import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './_lib/db.js'
import {
  routeCached,
  weatherAt,
  priceRange,
  requirementsFor,
  type Point,
} from './_lib/tools.js'

const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-oss-120b'
const MAX_STEPS = 4 // keruen: жёсткий предел, чтобы агент не зациклился на демо

// Маршрут, погоду и цену модель раньше добывала пятью последовательными
// вызовами — пять полных round-trip к OpenRouter, отсюда полминуты ожидания.
// Ни один из этих трёх шагов не требует решения: расстояние есть расстояние.
// Считаем их сами и параллельно, а модели оставляем то, где решение
// действительно есть — кого позвать и по какой цене.
const SYSTEM = `Ты — караван-баши KERUEN, логистический агент Мангистауской области.
Маршрут, погода и справедливая вилка цены уже посчитаны и даны тебе в сообщении.

Твоя работа:
1. вызвать find_carriers, чтобы получить машины под этот груз;
2. вызвать make_offers и позвать 2-3 лучших по цене внутри данной вилки.

Правила:
- Никогда не выдумывай цифры. Расстояние, погода и цена уже даны — бери их как есть.
- Цена в make_offers обязана лежать внутри вилки.
- Можешь вызвать оба инструмента сразу, одним ходом.
- После make_offers сразу заверши работу коротким текстом на русском (одно предложение).
- Не пиши длинных рассуждений — только вызовы инструментов и финальная фраза.`

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'find_carriers',
      description: 'Подходящие перевозчики: по тоннажу, типу кузова и близости к точке погрузки.',
      parameters: {
        type: 'object',
        properties: {
          near_point_id: { type: 'string' },
          weight_t: { type: 'number' },
          body: { type: 'string', description: 'тент | борт | реф' },
        },
        required: ['near_point_id', 'weight_t'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'make_offers',
      description: 'Отправить предложения перевозчикам по указанной цене.',
      parameters: {
        type: 'object',
        properties: {
          carrier_ids: { type: 'array', items: { type: 'string' } },
          price: { type: 'number' },
        },
        required: ['carrier_ids', 'price'],
      },
    },
  },
]

type Step = { at: string; text: string; detail?: string; state: 'done' | 'now' | 'wait' }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'Нет OPENROUTER_API_KEY' })

  const orderId = (req.body?.orderId ?? '') as string
  if (!orderId) return res.status(400).json({ error: 'Нужен orderId' })

  const { data: order, error } = await db.from('orders').select('*').eq('id', orderId).single()
  if (error || !order) return res.status(404).json({ error: 'Заказ не найден' })

  const { data: pointRows } = await db.from('points').select('*')
  const points = new Map<string, Point>((pointRows ?? []).map((p: Point) => [p.id, p]))

  const log: Step[] = []
  const now = () =>
    new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

  async function pushStep(text: string, detail?: string, state: Step['state'] = 'done') {
    log.push({ at: now(), text, detail, state })
    // Пишем сразу — на телефонах лог появляется в реальном времени через realtime.
    await db.from('orders').update({ agent_log: log }).eq('id', orderId)
  }

  /** Честная остановка: пользователь видит причину, а не вечный спиннер. */
  async function bail(text: string, detail: string, code = 502) {
    log.push({ at: now(), text, detail, state: 'wait' })
    await db.from('orders').update({ status: 'draft', agent_log: log }).eq('id', orderId)
    return res.status(code).json({ error: `${text}: ${detail}`, log })
  }

  await db.from('orders').update({ status: 'searching', agent_log: [] }).eq('id', orderId)

  const from = points.get(order.from_id ?? '')
  const to = points.get(order.to_id ?? '')
  if (!from || !to) return bail('Не знаю точки маршрута', 'проверьте «откуда» и «куда»', 400)

  const patch: Record<string, unknown> = {}
  let lastCarriers: { id: string; name: string; vehicle: string }[] = []
  let offersSent = false

  // --- Маршрут и погода одновременно: друг от друга они не зависят.
  const [route, weather] = await Promise.all([routeCached(db, from, to), weatherAt(from)])

  if (!route) return bail('Маршрут не рассчитан', 'OSRM не ответил, попробуйте ещё раз')

  patch.distance_km = route.distance_km
  patch.duration_min = route.duration_min
  await pushStep(
    `Маршрут рассчитан — ${route.distance_km} км`,
    `${from.name} → ${to.name} · ${Math.floor(route.duration_min / 60)} ч ${route.duration_min % 60} мин`,
  )

  // Погода не критична: без неё едем, просто не сужаем тип кузова.
  const need = requirementsFor(order.cargo ?? '', weather)
  const chosenBody = need.body
  if (weather) {
    patch.weather = weather
    await pushStep(
      `Погода в ${from.name} — ${weather.temp_c} °C, ${weather.description}`,
      need.notes[0],
    )
  } else {
    await pushStep('Погода недоступна', 'Open-Meteo молчит — кузов подбираю по грузу', 'wait')
  }

  // --- Цена. Чистая арифметика от километров, тоннажа и дизеля.
  const price = priceRange(route.distance_km, Number(order.weight_t) || 1, order.loaders ?? 0)
  patch.fuel_cost = price.fuel_cost
  patch.price_min = price.min
  patch.price_max = price.max
  await pushStep(
    `Справедливая цена — ${price.min.toLocaleString('ru-RU')}–${price.max.toLocaleString('ru-RU')} ₸`,
    `дизель ${price.litres} л ≈ ${price.fuel_cost.toLocaleString('ru-RU')} ₸`,
  )

  // Цифры уже в базе — отправитель видит их, пока модель ещё думает над машинами.
  await db.from('orders').update(patch).eq('id', orderId)

  async function runTool(name: string, args: Record<string, any>): Promise<unknown> {
    switch (name) {
      case 'find_carriers': {
        const { data } = await db
          .from('carriers')
          .select('*')
          .eq('online', true)
          .gte('capacity_t', args.weight_t ?? order.weight_t ?? 0)
        const body = args.body || chosenBody
        const list = (data ?? [])
          .filter((c: any) => (body === 'реф' ? c.body === 'реф' : c.body !== 'реф'))
          .slice(0, 4)
        lastCarriers = list.map((c: any) => ({ id: c.id, name: c.name, vehicle: c.vehicle }))
        await pushStep(
          `Найдено подходящих машин — ${list.length}`,
          `кузов ${body}, от ${args.weight_t ?? order.weight_t} т`,
        )
        return list.map((c: any) => ({
          id: c.id,
          name: c.name,
          vehicle: c.vehicle,
          body: c.body,
          capacity_t: c.capacity_t,
          rating: c.rating,
        }))
      }
      case 'make_offers': {
        const ids: string[] = (args.carrier_ids ?? []).slice(0, 3)
        // Модель иногда съезжает с вилки — держим её в границах, цифры тут наши.
        const asked = Math.round(Number(args.price) || price.min)
        const offerPrice = Math.min(Math.max(asked, price.min), price.max)
        if (!ids.length) return { error: 'Пустой список перевозчиков' }

        await db.from('offers').delete().eq('order_id', orderId)
        await db.from('offers').insert(
          ids.map((cid) => ({
            order_id: orderId,
            carrier_id: cid,
            price: offerPrice,
            status: 'sent',
            reason: `кузов ${chosenBody}, цена в справедливой вилке`,
          })),
        )

        // Экономия порожних — это гружёное плечо, которое машина иначе
        // проехала бы обратно пустой. Оно уже посчитано выше, второй
        // запрос к OSRM за тем же числом только тормозил бы.
        patch.empty_km = route.distance_km

        const names = lastCarriers
          .filter((c) => ids.includes(c.id))
          .map((c) => c.name)
          .join(', ')
        await pushStep(
          `Предложения отправлены — ${ids.length}`,
          `${names || 'перевозчикам'} · ${offerPrice.toLocaleString('ru-RU')} ₸`,
        )
        offersSent = true
        return { sent: ids.length, price: offerPrice }
      }
      default:
        return { error: `Неизвестный инструмент ${name}` }
    }
  }

  const deadline = order.deadline
    ? new Date(order.deadline).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    : null

  const messages: any[] = [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content:
        `Заявка: ${order.raw_text ?? ''}\n` +
        `Груз «${order.cargo}», ${order.weight_t} т, грузчиков ${order.loaders ?? 0}.\n` +
        `Откуда ${from.name} (id: ${order.from_id})` +
        `${order.from_address ? `, адрес: ${order.from_address}` : ''}.\n` +
        `Куда ${to.name} (id: ${order.to_id})` +
        `${order.to_address ? `, адрес: ${order.to_address}` : ''}.\n` +
        (deadline ? `Срок доставки: до ${deadline}.\n` : '') +
        `Уже посчитано: ${route.distance_km} км, ${route.duration_min} мин в пути.\n` +
        (weather
          ? `Погода в точке погрузки: ${weather.temp_c} °C, ${weather.description}, ветер ${weather.wind_ms} м/с.\n`
          : `Погода недоступна.\n`) +
        `Рекомендованный кузов: ${chosenBody} (${need.notes[0]}).\n` +
        `Справедливая вилка: ${price.min}–${price.max} ₸.\n` +
        `Вызывай find_carriers и make_offers.`,
    },
  ]

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'KERUEN',
        },
        body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, temperature: 0.2 }),
        signal: AbortSignal.timeout(30000),
      })
      if (!r.ok) {
        const body = await r.text()
        throw new Error(`OpenRouter ${r.status}: ${body.slice(0, 300)}`)
      }
      const json = (await r.json()) as any
      const msg = json.choices?.[0]?.message
      if (!msg) throw new Error('Пустой ответ модели')
      messages.push(msg)

      const calls = msg.tool_calls ?? []
      if (!calls.length) break

      // Модель может позвать оба инструмента одним ходом — тогда порядок важен:
      // find_carriers обязан отработать раньше make_offers.
      calls.sort((a: any, b: any) =>
        a.function.name === 'find_carriers' && b.function.name !== 'find_carriers' ? -1 : 0,
      )
      for (const call of calls) {
        let args: Record<string, any> = {}
        try {
          args = JSON.parse(call.function.arguments || '{}')
        } catch {
          args = {}
        }
        const result = await runTool(call.function.name, args)
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        })
      }

      // Дальше модель написала бы финальную фразу, которую экран не показывает.
      // Это лишний полный round-trip к OpenRouter, а отправитель всё это время
      // смотрит на крутящийся спиннер при уже готовом логе.
      if (offersSent) break
    }

    const { count } = await db
      .from('offers')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderId)
    if (!count) return bail('Машину не подобрали', 'подходящих свободных машин нет')

    await db
      .from('orders')
      .update({ ...patch, status: 'negotiating', agent_log: log })
      .eq('id', orderId)

    return res.status(200).json({ ok: true, log, patch })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return bail('Агент прервался', message, 500)
  }
}

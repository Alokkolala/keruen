import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './_lib/db.js'
import {
  routeBetween,
  weatherAt,
  priceRange,
  requirementsFor,
  emptyKmSaved,
  type Point,
} from './_lib/tools.js'

const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-oss-120b'
const MAX_STEPS = 8 // keruen: жёсткий предел, чтобы агент не зациклился на демо

const SYSTEM = `Ты — караван-баши KERUEN, логистический агент Мангистауской области.
Отправитель описывает груз обычными словами. Твоя работа:
1. вызвать get_route, чтобы узнать реальное расстояние и время;
2. вызвать get_weather в точке погрузки — от погоды зависит тип кузова;
3. вызвать estimate_price, чтобы получить справедливую вилку;
4. вызвать find_carriers, чтобы найти подходящие машины;
5. вызвать make_offers, чтобы отправить предложения лучшим перевозчикам.

Правила:
- Никогда не выдумывай цифры. Расстояние, погода и цена берутся только из инструментов.
- Вызывай инструменты по одному, в этом порядке.
- После make_offers сразу заверши работу коротким текстом на русском (одно предложение).
- Не пиши длинных рассуждений — только вызовы инструментов и финальная фраза.`

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_route',
      description: 'Расстояние и время в пути по реальной дорожной сети между двумя точками.',
      parameters: {
        type: 'object',
        properties: {
          from_id: { type: 'string', description: 'id точки отправления' },
          to_id: { type: 'string', description: 'id точки назначения' },
        },
        required: ['from_id', 'to_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Фактическая погода в точке: температура, осадки, ветер.',
      parameters: {
        type: 'object',
        properties: { point_id: { type: 'string' } },
        required: ['point_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'estimate_price',
      description: 'Справедливая вилка цены из километров, тоннажа и расхода дизеля.',
      parameters: {
        type: 'object',
        properties: {
          distance_km: { type: 'number' },
          weight_t: { type: 'number' },
          loaders: { type: 'number' },
        },
        required: ['distance_km', 'weight_t'],
      },
    },
  },
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

  async function pushStep(text: string, detail?: string) {
    log.push({ at: now(), text, detail, state: 'done' })
    // Пишем сразу — на телефонах лог появляется в реальном времени через realtime.
    await db.from('orders').update({ agent_log: log }).eq('id', orderId)
  }

  await db.from('orders').update({ status: 'searching', agent_log: [] }).eq('id', orderId)

  const patch: Record<string, unknown> = {}
  let chosenBody = 'борт'
  let lastCarriers: { id: string; name: string; vehicle: string }[] = []

  async function runTool(name: string, args: Record<string, any>): Promise<unknown> {
    switch (name) {
      case 'get_route': {
        const a = points.get(args.from_id)
        const b = points.get(args.to_id)
        if (!a || !b) return { error: 'Неизвестная точка' }
        const r = await routeBetween(a, b)
        if (!r) return { error: 'OSRM не ответил' }
        patch.distance_km = r.distance_km
        patch.duration_min = r.duration_min
        await pushStep(
          `Маршрут рассчитан — ${r.distance_km} км`,
          `${a.name} → ${b.name} · ${Math.floor(r.duration_min / 60)} ч ${r.duration_min % 60} мин`,
        )
        return r
      }
      case 'get_weather': {
        const p = points.get(args.point_id)
        if (!p) return { error: 'Неизвестная точка' }
        const w = await weatherAt(p)
        if (!w) return { error: 'Open-Meteo не ответил' }
        patch.weather = w
        const req = requirementsFor(order.cargo ?? '', w)
        chosenBody = req.body
        await pushStep(
          `Погода в ${p.name} — ${w.temp_c} °C, ${w.description}`,
          req.notes[0],
        )
        return { ...w, recommended_body: req.body, note: req.notes[0] }
      }
      case 'estimate_price': {
        const p = priceRange(args.distance_km, args.weight_t, args.loaders ?? order.loaders ?? 0)
        patch.fuel_cost = p.fuel_cost
        patch.price_min = p.min
        patch.price_max = p.max
        await pushStep(
          `Справедливая цена — ${p.min.toLocaleString('ru-RU')}–${p.max.toLocaleString('ru-RU')} ₸`,
          `дизель ${p.litres} л ≈ ${p.fuel_cost.toLocaleString('ru-RU')} ₸`,
        )
        return p
      }
      case 'find_carriers': {
        let q = db.from('carriers').select('*').eq('online', true).gte('capacity_t', args.weight_t)
        const { data } = await q
        const body = args.body || chosenBody
        const list = (data ?? [])
          .filter((c: any) => (body === 'реф' ? c.body === 'реф' : c.body !== 'реф'))
          .slice(0, 4)
        lastCarriers = list.map((c: any) => ({ id: c.id, name: c.name, vehicle: c.vehicle }))
        await pushStep(
          `Найдено подходящих машин — ${list.length}`,
          `кузов ${body}, от ${args.weight_t} т`,
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
        const price = Math.round(args.price)
        if (!ids.length) return { error: 'Пустой список перевозчиков' }

        await db.from('offers').delete().eq('order_id', orderId)
        await db.from('offers').insert(
          ids.map((cid) => ({
            order_id: orderId,
            carrier_id: cid,
            price,
            status: 'sent',
            reason: `кузов ${chosenBody}, цена в справедливой вилке`,
          })),
        )

        // Экономия порожних: путь машины до забора против гружёного плеча.
        const from = points.get(order.from_id!)
        const to = points.get(order.to_id!)
        if (from && to) {
          const saved = await emptyKmSaved(from, from, to)
          if (saved) patch.empty_km = saved.saved_km
        }

        const names = lastCarriers
          .filter((c) => ids.includes(c.id))
          .map((c) => c.name)
          .join(', ')
        await pushStep(
          `Предложения отправлены — ${ids.length}`,
          `${names || 'перевозчикам'} · ${price.toLocaleString('ru-RU')} ₸`,
        )
        return { sent: ids.length, price }
      }
      default:
        return { error: `Неизвестный инструмент ${name}` }
    }
  }

  const from = points.get(order.from_id ?? '')
  const to = points.get(order.to_id ?? '')

  const messages: any[] = [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content:
        `Заявка: ${order.raw_text ?? ''}\n` +
        `Разобрано: груз «${order.cargo}», ${order.weight_t} т, ` +
        `откуда ${from?.name} (id: ${order.from_id}), куда ${to?.name} (id: ${order.to_id}), ` +
        `грузчиков: ${order.loaders ?? 0}.\n` +
        `Начинай с get_route.`,
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
        signal: AbortSignal.timeout(45000),
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
    }

    await db
      .from('orders')
      .update({ ...patch, status: 'negotiating', agent_log: log })
      .eq('id', orderId)

    return res.status(200).json({ ok: true, log, patch })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    log.push({ at: now(), text: 'Агент прервался', detail: message, state: 'wait' })
    await db.from('orders').update({ status: 'draft', agent_log: log }).eq('id', orderId)
    return res.status(500).json({ error: message, log })
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './_lib/db.js'
import { routeCached, priceRange, type Point } from './_lib/tools.js'

// Буфер на выгрузку. Стыковка валидна, если машина успевает доехать
// от точки выгрузки до следующей погрузки с этим запасом.
const UNLOAD_BUFFER_MIN = 30

/**
 * Проактивное связывание рейсов.
 * Вызывается в момент, когда перевозчик взял заказ — то есть пока он ещё
 * даже не выехал. Ищем груз из точки, где он освободится, и предлагаем
 * заранее. Это и есть «агент видит будущее машины».
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const orderId = (req.body?.orderId ?? '') as string
  if (!orderId) return res.status(400).json({ error: 'Нужен orderId' })

  const { data: order } = await db.from('orders').select('*').eq('id', orderId).single()
  if (!order?.carrier_id) return res.status(400).json({ error: 'У заказа нет перевозчика' })

  const { data: pointRows } = await db.from('points').select('*')
  const points = new Map<string, Point>((pointRows ?? []).map((p: Point) => [p.id, p]))

  const { data: carrier } = await db
    .from('carriers')
    .select('*')
    .eq('id', order.carrier_id)
    .single()
  if (!carrier) return res.status(404).json({ error: 'Перевозчик не найден' })

  // Где и когда машина освободится.
  const freeAtId: string = order.to_id
  const freeAt = points.get(freeAtId)
  // Отсчёт от «сейчас»: перевозчик только что взял рейс и выезжает.
  // От created_at выходило время создания заявки — на демо это давало
  // «освободится» в прошлом.
  const startMs = new Date(order.started_at ?? Date.now()).getTime()
  const freeFromMs = startMs + (order.duration_min ?? 0) * 60_000 + UNLOAD_BUFFER_MIN * 60_000

  await db
    .from('carriers')
    .update({ free_at_id: freeAtId, free_from: new Date(freeFromMs).toISOString() })
    .eq('id', carrier.id)

  if (!freeAt) return res.status(200).json({ chained: false, reason: 'Точка выгрузки неизвестна' })

  // Открытые заявки, которые начинаются там же, где машина освободится.
  const { data: candidates } = await db
    .from('orders')
    .select('*')
    .in('status', ['searching', 'negotiating'])
    .eq('from_id', freeAtId)
    .lte('weight_t', carrier.capacity_t)
    .neq('id', orderId)

  if (!candidates?.length) {
    return res.status(200).json({ chained: false, reason: `Из ${freeAt.name} пока нет заявок` })
  }

  // Жадно берём первую подходящую по времени. Настоящий VRP тут не нужен:
  // на плечах по 3–4 часа разницы с оптимумом не видно.
  // keruen: жадный выбор — если плечей станет много, менять на подбор по прибыли.
  const next = candidates[0]
  const nextTo = points.get(next.to_id ?? '')
  if (!nextTo) return res.status(200).json({ chained: false, reason: 'Нет точки назначения' })

  // Порожний подход равен нулю: машина уже стоит в точке погрузки.
  // Именно это мы и убираем — иначе она поехала бы домой пустой.
  const back = await routeCached(db, freeAt, points.get(carrier.base_id ?? '') ?? freeAt)
  const emptyAvoided = back?.distance_km ?? 0

  const leg = await routeCached(db, freeAt, nextTo)
  if (!leg) return res.status(200).json({ chained: false, reason: 'OSRM не ответил' })

  const price = priceRange(leg.distance_km, next.weight_t ?? 1, next.loaders ?? 0)

  await db
    .from('orders')
    .update({
      distance_km: leg.distance_km,
      duration_min: leg.duration_min,
      fuel_cost: price.fuel_cost,
      price_min: price.min,
      price_max: price.max,
      empty_km: emptyAvoided,
      status: 'negotiating',
    })
    .eq('id', next.id)

  await db.from('offers').insert({
    order_id: next.id,
    carrier_id: carrier.id,
    price: price.min,
    status: 'sent',
    reason:
      `вы освободитесь в ${freeAt.name} в ` +
      `${new Date(freeFromMs).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` +
      ` · без этого рейса ${Math.round(emptyAvoided)} км порожних`,
  })

  // Дописываем в лог первого заказа — отправитель видит, что цепочка пошла дальше.
  const log = Array.isArray(order.agent_log) ? order.agent_log : []
  log.push({
    at: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    text: `Ищу продолжение из ${freeAt.name}`,
    detail: `нашёл ${nextTo.name} · ${leg.distance_km} км · убирает ${Math.round(emptyAvoided)} км порожних`,
    state: 'done',
  })
  await db.from('orders').update({ agent_log: log }).eq('id', orderId)

  return res.status(200).json({
    chained: true,
    next_order_id: next.id,
    from: freeAt.name,
    to: nextTo.name,
    free_from: new Date(freeFromMs).toISOString(),
    empty_km_avoided: emptyAvoided,
    price: price.min,
  })
}

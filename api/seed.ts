import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './_lib/db.js'
import { routeBetween, priceRange, type Point } from './_lib/tools.js'

// Открытые заявки, из которых агент собирает цепочку.
// Каждая начинается там, где заканчивается предыдущая — так рейсы стыкуются.
const OPEN = [
  { from_id: 'shetpe', to_id: 'beineu', cargo: 'оборудование', weight_t: 2, loaders: 0 },
  { from_id: 'beineu', to_id: 'aktau', cargo: 'продукты', weight_t: 5, loaders: 2 },
  { from_id: 'zhanaozen', to_id: 'aktau', cargo: 'стройматериалы', weight_t: 4, loaders: 0 },
]

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  await db.from('offers').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await db.from('orders').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await db.from('carriers').update({ free_from: null, free_at_id: null }).neq('id', '00000000-0000-0000-0000-000000000000')

  const { data: pointRows } = await db.from('points').select('*')
  const points = new Map<string, Point>((pointRows ?? []).map((p: Point) => [p.id, p]))

  const rows = []
  for (const o of OPEN) {
    const a = points.get(o.from_id)
    const b = points.get(o.to_id)
    const leg = a && b ? await routeBetween(a, b) : null
    const price = leg ? priceRange(leg.distance_km, o.weight_t, o.loaders) : null
    rows.push({
      ...o,
      raw_text: `${o.weight_t} т ${o.cargo}, ${a?.name} — ${b?.name}`,
      status: 'searching',
      distance_km: leg?.distance_km ?? null,
      duration_min: leg?.duration_min ?? null,
      fuel_cost: price?.fuel_cost ?? null,
      price_min: price?.min ?? null,
      price_max: price?.max ?? null,
      agent_log: [],
    })
  }

  const { data, error } = await db.from('orders').insert(rows).select()
  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ ok: true, created: data?.length ?? 0 })
}

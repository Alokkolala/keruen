import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './_lib/db.js'
import { routeBetween, type Point } from './_lib/tools.js'

/**
 * Порожний пробег между плечами дня: от точки выгрузки одного рейса
 * до точки погрузки следующего. Раньше на /day стояли захардкоженные
 * 8 и 12 км — теперь это настоящий OSRM по дорожной сети.
 * Совпали точки — ноль, машина уже там.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const pairs = req.body?.pairs
  if (!Array.isArray(pairs)) return res.status(400).json({ error: 'Нужен pairs: [[from,to]]' })
  if (pairs.length > 20) return res.status(400).json({ error: 'Слишком много плеч' })

  const { data: pointRows } = await db.from('points').select('*')
  const points = new Map<string, Point>((pointRows ?? []).map((p: Point) => [p.id, p]))

  const km = await Promise.all(
    pairs.map(async ([a, b]: [string, string]) => {
      if (a === b) return 0
      const pa = points.get(a)
      const pb = points.get(b)
      if (!pa || !pb) return null
      const r = await routeBetween(pa, pb)
      return r ? r.distance_km : null // null — честное «не посчитали», не подставляем число
    }),
  )

  return res.status(200).json({ km })
}

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { geocode, reverseGeocode, type Point } from './_lib/tools.js'
import { db } from './_lib/db.js'

// Nominatim требует User-Agent и не отдаёт CORS браузеру — ходим через сервер.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const { q, lat, lon, near_id } = req.body ?? {}

  try {
    if (typeof lat === 'number' && typeof lon === 'number') {
      const name = await reverseGeocode(lat, lon)
      if (!name) return res.status(502).json({ error: 'Nominatim не ответил' })
      return res.status(200).json({ name })
    }

    const query = (q ?? '').toString().trim()
    if (!query) return res.status(400).json({ error: 'Нужен q или lat/lon' })

    let near: Point | undefined
    if (near_id) {
      const { data } = await db.from('points').select('*').eq('id', near_id).single()
      if (data) near = data as Point
    }
    // Nominatim ищет лучше, когда город назван явно.
    const results = await geocode(near ? `${query}, ${near.name}` : query, near)
    return res.status(200).json({ results })
  } catch (e) {
    return res.status(502).json({ error: e instanceof Error ? e.message : String(e) })
  }
}

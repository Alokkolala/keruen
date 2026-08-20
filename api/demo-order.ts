import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './_lib/db.js'

// Заказ, ради которого перевозчик увидит предложение. Держим его на сервере,
// а не в клиенте: тогда сцена собирается одинаково и с телефона, и из скрипта.
const DEMO = {
  raw_text: '3 тонны стройматериала из Актау в Шетпе, нужен один грузчик',
  cargo: 'стройматериал',
  weight_t: 3,
  from_id: 'aktau',
  to_id: 'shetpe',
  loaders: 1,
  status: 'draft',
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const { data, error } = await db.from('orders').insert(DEMO).select('id').single()
  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ id: data.id })
}

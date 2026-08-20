import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './_lib/db.js'
import { fromWeekday, isoDate } from './_lib/dates.js'
import { fallbackParse } from './_lib/fallback-parse.js'

const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-oss-120b'

// Модель отвечает 7-10 с, но хвост уходит за 30. Ждать столько на питче
// нельзя: лучше два коротких захода, а потом разобрать правилами.
const MODEL_TIMEOUT_MS = 12_000
const ATTEMPTS = 2

interface Point {
  id: string
  name: string
}

async function askModel(apiKey: string, prompt: string) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'KERUEN',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0,
    }),
    signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
  })
  if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${(await r.text()).slice(0, 200)}`)

  const json = (await r.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const raw = json.choices?.[0]?.message?.content ?? '{}'
  // Модель иногда оборачивает JSON в ```json — срезаем.
  const cleaned = raw
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()
  return JSON.parse(cleaned) as Record<string, unknown>
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const text = (req.body?.text ?? '').toString().trim()
  if (!text) return res.status(400).json({ error: 'Пустой текст' })

  const { data: pointRows } = await db.from('points').select('id,name')
  const points = (pointRows ?? []) as Point[]
  const list = points.map((p) => `${p.id} = ${p.name}`).join(', ')

  const today = new Date()
  const iso = isoDate(today)
  const weekday = today.toLocaleDateString('ru-RU', { weekday: 'long' })

  const prompt =
    `Разбери заявку на перевозку в JSON. Доступные точки: ${list}.\n` +
    `Сегодня ${iso}, ${weekday}.\n` +
    `Верни строго объект с полями:\n` +
    `cargo (строка, что везут), weight_t (число, тонны), from_id, to_id (id из списка),\n` +
    `loaders (число, сколько грузчиков нужно, 0 если не сказано),\n` +
    `deadline_hint (строка как сказал человек, например "к пятнице", или null),\n` +
    `deadline (дата срока в формате YYYY-MM-DD, посчитанная от сегодня, или null).\n` +
    `Если чего-то нет — ставь null. Никакого текста кроме JSON.\n\n` +
    `Заявка: ${text}`

  const apiKey = process.env.OPENROUTER_API_KEY
  let parsed: Record<string, unknown> | null = null
  let source: 'model' | 'rules' = 'model'
  let note: string | null = null

  for (let i = 0; apiKey && i < ATTEMPTS && !parsed; i++) {
    try {
      parsed = await askModel(apiKey, prompt)
    } catch (e) {
      note = e instanceof Error ? e.message : String(e)
    }
  }

  // Разбор не должен ронять заказ. Правила поймут город, тоннаж и грузчиков,
  // остальное поправят на экране подтверждения — он для того и есть.
  if (!parsed) {
    const byRules = fallbackParse(text, points, today)
    return res.status(200).json({
      ...byRules,
      source: 'rules',
      note: apiKey ? `модель не ответила (${note ?? 'таймаут'})` : 'нет ключа модели',
      raw_text: text,
    })
  }

  // Дату проверяем сами: модель может вернуть мусор или дату в прошлом.
  let d = /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.deadline ?? '')) ? String(parsed.deadline) : null
  // «К пятнице» модель считает мимо: в четверг она отвечает «сегодня».
  // День недели — арифметика, а не языковая догадка, поэтому считаем сами.
  d = fromWeekday(String(parsed.deadline_hint ?? text), today) ?? d

  const known = new Set(points.map((p) => p.id))
  const pick = (v: unknown) => (typeof v === 'string' && known.has(v) ? v : null)

  return res.status(200).json({
    cargo: (parsed.cargo as string) ?? null,
    weight_t: Number(parsed.weight_t) || null,
    // Модель иногда выдумывает id — сверяем со справочником.
    from_id: pick(parsed.from_id),
    to_id: pick(parsed.to_id),
    loaders: Number(parsed.loaders) || 0,
    deadline_hint: (parsed.deadline_hint as string) ?? null,
    deadline: d && d >= iso ? d : null,
    source,
    note: null,
    raw_text: text,
  })
}

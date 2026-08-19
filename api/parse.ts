import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './_lib/db.js'
import { fromWeekday, isoDate } from './_lib/dates.js'

const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-oss-120b'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'Нет OPENROUTER_API_KEY' })

  const text = (req.body?.text ?? '').toString().trim()
  if (!text) return res.status(400).json({ error: 'Пустой текст' })

  const { data: points } = await db.from('points').select('id,name')
  const list = (points ?? []).map((p: any) => `${p.id} = ${p.name}`).join(', ')

  // Модель не знает, какое сегодня число — говорим прямо, иначе «к пятнице»
  // не во что превратить.
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

  try {
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
      signal: AbortSignal.timeout(30000),
    })
    if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${(await r.text()).slice(0, 300)}`)

    const json = (await r.json()) as any
    const raw = json.choices?.[0]?.message?.content ?? '{}'
    // Модель иногда оборачивает JSON в ```json — срезаем.
    const cleaned = raw
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim()
    const parsed = JSON.parse(cleaned)

    // Дату проверяем сами: модель может вернуть мусор или дату в прошлом.
    let d = /^\d{4}-\d{2}-\d{2}$/.test(parsed.deadline ?? '') ? parsed.deadline : null
    // «К пятнице» модель считает мимо: в четверг она отвечает «сегодня».
    // День недели — арифметика, а не языковая догадка, поэтому считаем сами.
    d = fromWeekday(parsed.deadline_hint ?? text, today) ?? d

    return res.status(200).json({
      cargo: parsed.cargo ?? null,
      weight_t: parsed.weight_t ?? null,
      from_id: parsed.from_id ?? null,
      to_id: parsed.to_id ?? null,
      loaders: Number(parsed.loaders) || 0,
      deadline_hint: parsed.deadline_hint ?? null,
      deadline: d && d >= iso ? d : null,
      raw_text: text,
    })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node'

// Web Speech API есть в Chrome, но его нет в Safari на iPhone — там кнопка
// микрофона просто ничего не делала. Этот путь работает везде, где есть
// MediaRecorder: браузер пишет звук, расшифровка идёт здесь.
//
// Модель со звуком на входе. Отдельный ключ не нужен — тот же OpenRouter.
const MODEL = process.env.OPENROUTER_AUDIO_MODEL || 'google/gemini-3.7-flash'

// Заявка — это одна фраза. Полторы минуты с запасом, дальше почти наверняка
// зажатая кнопка, а не человек.
const MAX_BYTES = 8 * 1024 * 1024

const PROMPT =
  'Это голосовая заявка на грузоперевозку в Мангистауской области Казахстана. ' +
  'Запиши дословно, что сказал человек, на том языке, на котором он говорит ' +
  '(русский или казахский). Названия посёлков: Актау, Шетпе, Бейнеу, Жанаозен, ' +
  'Форт-Шевченко, Сай-Утес, Мунайлы, Курык, Таушык, Жетыбай. ' +
  'Верни только текст сказанного, без пояснений и без кавычек.'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'Нет OPENROUTER_API_KEY' })

  const audio = (req.body?.audio ?? '') as string
  const format = (req.body?.format ?? 'webm') as string
  if (!audio) return res.status(400).json({ error: 'Нет звука' })
  if (audio.length > MAX_BYTES) return res.status(413).json({ error: 'Запись слишком длинная' })

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
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'input_audio', input_audio: { data: audio, format } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!r.ok) {
      const body = (await r.text()).slice(0, 300)
      throw new Error(`OpenRouter ${r.status}: ${body}`)
    }

    const json = (await r.json()) as { choices?: { message?: { content?: string } }[] }
    const text = (json.choices?.[0]?.message?.content ?? '').trim()
    if (!text) return res.status(200).json({ text: '', note: 'Ничего не разобрал' })

    return res.status(200).json({ text })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
}

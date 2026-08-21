// Проверка расшифровки речи. Берёт готовый WAV и гоняет через OpenRouter.
//   node scripts/test-transcribe.mjs путь.wav
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const file = process.argv[2]
if (!file) {
  console.error('нужен путь к аудиофайлу')
  process.exit(1)
}

const MODEL = env.OPENROUTER_AUDIO_MODEL || 'google/gemini-3.7-flash'
const audio = readFileSync(file).toString('base64')
const format = file.split('.').pop()

console.log(`файл: ${file} (${Math.round(audio.length / 1024)} КБ base64), формат ${format}`)
console.log(`модель: ${MODEL}`)

const t0 = Date.now()
const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
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
          {
            type: 'text',
            text:
              'Это голосовая заявка на грузоперевозку. Запиши дословно, что сказал человек. ' +
              'Верни только текст сказанного.',
          },
          { type: 'input_audio', input_audio: { data: audio, format } },
        ],
      },
    ],
  }),
})

const body = await r.text()
console.log(`HTTP ${r.status}, ${Date.now() - t0} мс`)

if (!r.ok) {
  console.error('ОШИБКА:', body.slice(0, 400))
  process.exit(1)
}

const json = JSON.parse(body)
const text = json.choices?.[0]?.message?.content ?? ''
console.log('расшифровка:', JSON.stringify(text))
if (!text.trim()) {
  console.error('модель вернула пусто')
  process.exit(1)
}
console.log('\nЗвуковой путь работает.')

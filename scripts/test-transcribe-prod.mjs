// Проверка эндпоинта расшифровки на проде.
//   node scripts/test-transcribe-prod.mjs путь.wav
import { readFileSync } from 'node:fs'

const BASE = process.env.BASE ?? 'https://keruen-xi.vercel.app'
const file = process.argv[2]
if (!file) {
  console.error('нужен путь к аудиофайлу')
  process.exit(1)
}

const audio = readFileSync(file).toString('base64')
const format = file.split('.').pop()
console.log(`${file} → ${BASE}/api/transcribe (${Math.round(audio.length / 1024)} КБ base64)`)

const t0 = Date.now()
const r = await fetch(`${BASE}/api/transcribe`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ audio, format }),
})
const j = await r.json().catch(() => ({}))
console.log(`HTTP ${r.status}, ${Date.now() - t0} мс`)
console.log(JSON.stringify(j).slice(0, 400))

if (!r.ok || !j.text) {
  console.error('\nПРОВАЛ')
  process.exit(1)
}
console.log('\nЭндпоинт работает.')

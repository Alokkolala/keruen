// Заливает переменные из .env.local в проект Vercel. Значений не печатает.
// Зовём бинарник напрямую: каждый запуск через npx стоит несколько секунд.
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const KEYS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENROUTER_API_KEY',
  'OPENROUTER_MODEL',
  'OPENROUTER_AUDIO_MODEL',
]

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

// cmd.exe спотыкается о прямые слэши — берём абсолютный путь.
const rel = ['node_modules/.bin/vercel.cmd', 'node_modules/.bin/vercel'].find(existsSync)
if (!rel) throw new Error('vercel не найден в node_modules — npm i -D vercel')
const bin = resolve(rel)

for (const key of KEYS) {
  const value = env[key]
  if (!value) {
    console.log(`${key.padEnd(28)} пропуск (пусто)`)
    continue
  }
  const r = spawnSync(bin, ['env', 'add', key, 'production', '--force'], {
    input: value,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  console.log(`${key.padEnd(28)} ${r.status === 0 ? 'ok' : 'ОШИБКА: ' + (r.stderr || '').trim().slice(0, 120)}`)
}

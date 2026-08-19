// Поднимает проект Supabase и записывает ключи в .env.local.
// Запускать после `npx supabase login`. Токен нигде не хранится — CLI держит свой.
//
//   node scripts/setup-supabase.mjs "keruen" "eu-central-1"

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

const NAME = process.argv[2] ?? 'keruen'
const REGION = process.argv[3] ?? 'eu-central-1'

const sb = (...args) =>
  execFileSync('npx', ['supabase', ...args], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  }).trim()

function findProject() {
  const out = sb('projects', 'list', '--output', 'json')
  const list = JSON.parse(out)
  return list.find((p) => p.name === NAME)
}

let project = findProject()

if (!project) {
  const dbPass = randomBytes(18).toString('base64url')
  console.log(`Создаю проект «${NAME}» в ${REGION}…`)
  sb('projects', 'create', NAME, '--region', REGION, '--db-password', dbPass, '--output', 'json')
  // Проект поднимается около минуты.
  for (let i = 0; i < 40 && !project; i++) {
    await new Promise((r) => setTimeout(r, 5000))
    project = findProject()
    process.stdout.write('.')
  }
  console.log('')
  if (!project) throw new Error('Проект не появился в списке — проверь дашборд')
  writeFileSync('.supabase-db-password', dbPass)
  console.log('Пароль базы сохранён в .supabase-db-password')
}

const ref = project.id ?? project.ref
console.log(`Проект: ${ref}`)

// Ждём, пока проект станет ACTIVE_HEALTHY — до этого ключи не отдаются.
let keys = null
for (let i = 0; i < 60; i++) {
  try {
    keys = JSON.parse(sb('projects', 'api-keys', '--project-ref', ref, '--output', 'json'))
    if (keys?.length) break
  } catch {
    /* ещё поднимается */
  }
  await new Promise((r) => setTimeout(r, 5000))
  process.stdout.write('.')
}
console.log('')
if (!keys?.length) throw new Error('Ключи не отдались — проект ещё поднимается, запусти скрипт ещё раз')

const anon = keys.find((k) => k.name === 'anon')?.api_key
const service = keys.find((k) => k.name === 'service_role')?.api_key
const url = `https://${ref}.supabase.co`

const path = '.env.local'
const prev = existsSync(path) ? readFileSync(path, 'utf8') : ''
const keep = prev
  .split(/\r?\n/)
  .filter((l) => l.startsWith('OPENROUTER_'))
  .join('\n')

writeFileSync(
  path,
  [
    '# Сгенерировано scripts/setup-supabase.mjs',
    `VITE_SUPABASE_URL=${url}`,
    `VITE_SUPABASE_ANON_KEY=${anon}`,
    '',
    `SUPABASE_URL=${url}`,
    `SUPABASE_SERVICE_ROLE_KEY=${service}`,
    '',
    keep || 'OPENROUTER_API_KEY=\nOPENROUTER_MODEL=openai/gpt-oss-120b',
    '',
  ].join('\n'),
)

console.log('.env.local заполнен.')
console.log(`Схема: npx supabase db push --project-ref ${ref}`)
console.log(`Или вручную: дашборд → SQL Editor → supabase/schema.sql`)

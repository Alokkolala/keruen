// Проверка живой базы. Значения ключей не печатает.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

for (const t of ['points', 'carriers', 'orders', 'offers', 'legs']) {
  const { count, error } = await db.from(t).select('*', { count: 'exact', head: true })
  console.log(`${t.padEnd(10)} ${error ? 'ОШИБКА: ' + error.message : count + ' строк'}`)
}

const { data: pts } = await db.from('points').select('name').limit(4)
console.log('точки:', (pts ?? []).map((p) => p.name).join(', '))
const { data: cs } = await db.from('carriers').select('name,vehicle').limit(3)
console.log('машины:', (cs ?? []).map((c) => `${c.name} (${c.vehicle})`).join(', '))

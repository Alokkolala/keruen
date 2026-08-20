// Замер агента на проде: сколько до первой строки лога и сколько всего.
// Первая строка важнее итога — она решает, выглядит ли экран живым.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.BASE ?? 'https://keruen-xi.vercel.app'
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const post = async (path, body) => {
  const r = await fetch(`${BASE}/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`${path}: ${j.error ?? r.status}`)
  return j
}

const { data: order } = await db
  .from('orders')
  .insert({
    raw_text: 'замер',
    cargo: 'стройматериал',
    weight_t: 3,
    from_id: 'aktau',
    to_id: 'shetpe',
    loaders: 0,
    status: 'draft',
  })
  .select()
  .single()

const t0 = Date.now()
let firstLine = null
const poll = setInterval(async () => {
  const { data } = await db.from('orders').select('agent_log').eq('id', order.id).single()
  if (!firstLine && (data?.agent_log ?? []).length > 0) {
    firstLine = Date.now() - t0
    console.log(`первая строка лога: ${firstLine} мс`)
  }
}, 150)

const res = await post('agent', { orderId: order.id })
const total = Date.now() - t0
clearInterval(poll)

console.log(`всего:              ${total} мс`)
console.log(`шагов в логе:       ${res.log.length}`)
for (const s of res.log) console.log(`  ${s.text}${s.detail ? ' — ' + s.detail : ''}`)

const { data: offers } = await db.from('offers').select('*').eq('order_id', order.id)
console.log(`предложений:        ${offers?.length ?? 0}`)

await db.from('offers').delete().eq('order_id', order.id)
await db.from('orders').delete().eq('id', order.id)

if (!offers?.length) {
  console.error('ПРОВАЛ: агент не отправил предложений')
  process.exit(1)
}

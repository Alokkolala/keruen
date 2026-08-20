// Сброс под демо: чистим сделки, засеваем открытые заявки и доводим
// один заказ до предложений, чтобы на /carrier было что показать.
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
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${path}: ${j.error ?? r.status}`)
  return j
}

console.log('Чищу сделки и предложения…')
const seeded = await post('seed', {})
console.log(`  открытых заявок: ${seeded.created}`)

// Заказ, ради которого перевозчик и увидит предложение.
const { data: order } = await db
  .from('orders')
  .insert({
    raw_text: '3 тонны стройматериала из Актау в Шетпе, нужен один грузчик',
    cargo: 'стройматериал',
    weight_t: 3,
    from_id: 'aktau',
    to_id: 'shetpe',
    loaders: 1,
    status: 'draft',
  })
  .select()
  .single()

console.log('Гоняю агента, чтобы предложения долетели…')
const t0 = Date.now()
await post('agent', { orderId: order.id })
console.log(`  ${Math.round((Date.now() - t0) / 1000)} с`)

const { data: offers } = await db
  .from('offers')
  .select('price, carrier_id, carriers(name, vehicle)')
  .eq('order_id', order.id)

console.log(`\nПеревозчик увидит ${offers?.length ?? 0} предложения:`)
for (const o of offers ?? []) {
  console.log(`  ${o.carriers?.name ?? '—'} · ${o.carriers?.vehicle ?? ''} · ${Number(o.price).toLocaleString('ru-RU')} ₸`)
}

const { count: ordersLeft } = await db.from('orders').select('*', { count: 'exact', head: true })
console.log(`\nВсего заказов в базе: ${ordersLeft}`)
console.log(`Открывай ${BASE}/carrier`)

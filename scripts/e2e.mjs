// Сквозной прогон: разбор речи → агент → предложения → принятие → цепочка.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
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
  const json = await r.json()
  if (!r.ok) throw new Error(`${path}: ${json.error ?? r.status}`)
  return json
}

const say = (s) => console.log(s)
const fail = (s) => {
  console.error('ПРОВАЛ: ' + s)
  process.exit(1)
}

say('1. Сброс демо-данных')
say('   ' + JSON.stringify(await post('seed', {})))

const TEXT = 'Надо отвезти 3 тонны стройматериала из Актау в Шетпе к пятнице, нужен один грузчик'
say('\n2. Разбор речи')
say('   вход: ' + TEXT)
const parsed = await post('parse', { text: TEXT })
say('   вышло: ' + JSON.stringify(parsed))
if (!parsed.from_id || !parsed.to_id) fail('агент не понял откуда/куда')
if (parsed.from_id !== 'aktau' || parsed.to_id !== 'shetpe') fail('перепутал точки')

say('\n3. Создаю заказ')
const { data: order, error } = await db
  .from('orders')
  .insert({
    raw_text: parsed.raw_text,
    cargo: parsed.cargo,
    weight_t: parsed.weight_t,
    from_id: parsed.from_id,
    to_id: parsed.to_id,
    loaders: parsed.loaders,
    status: 'draft',
  })
  .select()
  .single()
if (error) fail(error.message)
say('   id: ' + order.id)

say('\n4. Запускаю агента')
const t0 = Date.now()
const res = await post('agent', { orderId: order.id })
say(`   ${Math.round((Date.now() - t0) / 1000)} с, шагов в логе: ${res.log.length}`)
for (const s of res.log) say(`   [${s.at}] ${s.text}${s.detail ? ' — ' + s.detail : ''}`)

const { data: after } = await db.from('orders').select('*').eq('id', order.id).single()
say('\n   маршрут: ' + after.distance_km + ' км, ' + after.duration_min + ' мин')
say('   погода:  ' + JSON.stringify(after.weather))
say('   вилка:   ' + after.price_min + ' – ' + after.price_max + ' ₸')
if (!after.distance_km) fail('маршрут не посчитан')
if (!after.weather) fail('погода не получена')
if (!after.price_min) fail('цена не посчитана')

const { data: offers } = await db.from('offers').select('*').eq('order_id', order.id)
say('\n5. Предложений отправлено: ' + (offers?.length ?? 0))
if (!offers?.length) fail('агент не отправил ни одного предложения')

say('\n6. Перевозчик принимает')
const offer = offers[0]
await db.from('offers').update({ status: 'accepted' }).eq('id', offer.id)
await db
  .from('orders')
  .update({ status: 'assigned', carrier_id: offer.carrier_id, price_final: offer.price })
  .eq('id', order.id)
say('   принято за ' + offer.price + ' ₸')

say('\n7. Цепочка: ищу обратный груз заранее')
const chain = await post('chain', { orderId: order.id })
say('   ' + JSON.stringify(chain))
if (!chain.chained) fail('цепочка не собралась: ' + chain.reason)
say(`   ${chain.from} → ${chain.to}, убрано ${Math.round(chain.empty_km_avoided)} км порожних`)

say('\nСквозной сценарий прошёл.')

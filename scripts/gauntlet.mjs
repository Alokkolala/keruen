// Полный прогон продукта на проде: обе роли, realtime между «телефонами»,
// цепочка, день перевозчика. Падает громко на первой же неправде.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.BASE ?? 'https://keruen-xi.vercel.app'
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const url = env.SUPABASE_URL
const anon = env.VITE_SUPABASE_ANON_KEY
const svc = env.SUPABASE_SERVICE_ROLE_KEY

// Два клиента = два телефона. Перевозчик ходит под anon, как настоящий браузер.
const phoneShipper = createClient(url, anon, { auth: { persistSession: false } })
const phoneCarrier = createClient(url, anon, { auth: { persistSession: false } })
const admin = createClient(url, svc, { auth: { persistSession: false } })

let failures = 0
const ok = (cond, what, extra = '') => {
  console.log(`${cond ? '  ok  ' : ' ПЛОХО'} ${what}${extra ? ' — ' + extra : ''}`)
  if (!cond) failures++
}
const post = async (path, body) => {
  const r = await fetch(`${BASE}/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${path} → ${r.status}: ${j.error ?? ''}`)
  return j
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

console.log(`\n=== ПРОГОН ${BASE} ===\n`)

// --- 0. Статика и глубокие ссылки
console.log('0. Страницы и ассеты')
for (const p of ['/', '/carrier', '/day', '/orders']) {
  const r = await fetch(BASE + p)
  ok(r.ok, `страница ${p}`, `HTTP ${r.status}`)
}
for (const a of ['logo-mark', 'scene-road-truck', 'ill-driver']) {
  const r = await fetch(`${BASE}/assets/${a}.png`)
  ok(r.ok && Number(r.headers.get('content-length')) > 1000, `ассет ${a}.png`)
}

// --- 1. Сброс
console.log('\n1. Сброс демо-данных')
const seeded = await post('seed', {})
ok(seeded.created === 3, 'засеяно 3 открытые заявки', String(seeded.created))

// --- 2. Речь
console.log('\n2. Разбор речи')
const TEXT = 'Надо отвезти 3 тонны стройматериала из Актау в Шетпе к пятнице, нужен один грузчик'
const parsed = await post('parse', { text: TEXT })
ok(parsed.from_id === 'aktau', 'понял откуда', parsed.from_id)
ok(parsed.to_id === 'shetpe', 'понял куда', parsed.to_id)
ok(Number(parsed.weight_t) === 3, 'понял вес', String(parsed.weight_t))
ok(parsed.loaders === 1, 'понял грузчиков', String(parsed.loaders))

// --- 3. Заказ + подписка «телефона отправителя»
console.log('\n3. Агент, живой лог через realtime')
const { data: order } = await admin
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

const seen = []
const t0 = Date.now()
const chShipper = phoneShipper
  .channel(`gauntlet-order-${order.id}`)
  .on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${order.id}` },
    (p) => {
      const n = (p.new.agent_log ?? []).length
      if (n > seen.length) seen.push({ at: Date.now() - t0, count: n })
    },
  )
  .subscribe()
await wait(1200) // дать подписке встать

const agentRes = await post('agent', { orderId: order.id })
const totalMs = Date.now() - t0
ok(agentRes.log.length >= 5, 'агент прошёл все шаги', `${agentRes.log.length} шагов`)
ok(seen.length >= 3, 'realtime доставил лог по шагам', `${seen.length} обновлений`)
ok(seen.length > 0 && seen[0].at < 4000, 'первая строка быстро', `${seen[0]?.at} мс`)
console.log(`       агент целиком: ${totalMs} мс`)

const { data: afterAgent } = await admin.from('orders').select('*').eq('id', order.id).single()
ok(afterAgent.distance_km > 100, 'маршрут настоящий', `${afterAgent.distance_km} км`)
ok(!!afterAgent.weather, 'погода настоящая', JSON.stringify(afterAgent.weather?.temp_c) + ' °C')
ok(afterAgent.price_min > 20000, 'цена в рынке', `${afterAgent.price_min}–${afterAgent.price_max} ₸`)

// --- 4. Перевозчик видит предложение
console.log('\n4. Телефон перевозчика')
const { data: offers } = await phoneCarrier.from('offers').select('*').eq('order_id', order.id)
ok((offers?.length ?? 0) > 0, 'предложения видны под anon', `${offers?.length}`)
ok(!!offers?.[0]?.reason, 'у предложения есть причина', offers?.[0]?.reason?.slice(0, 40))

// --- 5. «Беру» на втором телефоне → первый телефон должен узнать
console.log('\n5. Беру → отправителя уносит на результат')
let shipperSawAssigned = false
const chAssign = phoneShipper
  .channel(`gauntlet-assign-${order.id}`)
  .on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${order.id}` },
    (p) => {
      if (p.new.status === 'assigned') shipperSawAssigned = true
    },
  )
  .subscribe()
await wait(1200)

const offer = offers[0]
await phoneCarrier.from('offers').update({ status: 'accepted' }).eq('id', offer.id)
await phoneCarrier
  .from('orders')
  .update({ status: 'assigned', carrier_id: offer.carrier_id, price_final: offer.price })
  .eq('id', order.id)

for (let i = 0; i < 20 && !shipperSawAssigned; i++) await wait(250)
ok(shipperSawAssigned, 'отправитель узнал о сделке через realtime')

// --- 6. Цепочка
console.log('\n6. Цепочка: обратный груз заранее')
const chain = await post('chain', { orderId: order.id })
ok(chain.chained === true, 'цепочка собралась', chain.reason ?? `${chain.from} → ${chain.to}`)
if (chain.chained) {
  ok(chain.empty_km_avoided > 100, 'убрано порожних', `${Math.round(chain.empty_km_avoided)} км`)
  const { data: chainOffers } = await phoneCarrier
    .from('offers')
    .select('*')
    .eq('order_id', chain.next_order_id)
  ok((chainOffers?.length ?? 0) > 0, 'предложение по цепочке дошло до перевозчика')
  ok(
    chainOffers?.[0]?.reason?.includes('освободитесь'),
    'в причине сказано когда освободится',
    chainOffers?.[0]?.reason?.slice(0, 50),
  )
}

// --- 7. День перевозчика
console.log('\n7. День перевозчика')
const { data: dayOrders } = await phoneCarrier
  .from('orders')
  .select('*')
  .eq('carrier_id', offer.carrier_id)
  .in('status', ['assigned', 'in_transit', 'done'])
ok((dayOrders?.length ?? 0) > 0, 'в дне есть принятые рейсы', `${dayOrders?.length}`)
const income = (dayOrders ?? []).reduce((s, o) => s + (o.price_final ?? 0), 0)
ok(income > 0, 'доход считается', `${income.toLocaleString('ru-RU')} ₸`)

// --- 8. Отслеживание
console.log('\n8. Груз в пути')
await phoneShipper.from('orders').update({ status: 'in_transit' }).eq('id', order.id)
const { data: track } = await phoneShipper.from('orders').select('*').eq('id', order.id).single()
ok(track.status === 'in_transit', 'статус переключился')
ok(!!track.duration_min, 'есть время в пути для ETA', `${track.duration_min} мин`)

phoneShipper.removeChannel(chShipper)
phoneShipper.removeChannel(chAssign)

console.log(`\n=== ${failures === 0 ? 'ВСЁ ЧИСТО' : `ПРОБЛЕМ: ${failures}`} ===\n`)
process.exit(failures === 0 ? 0 : 1)

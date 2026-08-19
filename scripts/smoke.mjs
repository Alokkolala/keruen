// Дым-тест настоящих интеграций: OSRM, Open-Meteo, расчёт цены.
// Ключей не требует — эти сервисы работают без регистрации.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { routeBetween, weatherAt, priceRange, requirementsFor } from '../api/_lib/tools.ts'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data: pts } = await db.from('points').select('*')
const P = Object.fromEntries(pts.map((p) => [p.id, p]))

const pairs = [
  ['aktau', 'shetpe'],
  ['shetpe', 'beineu'],
  ['zhanaozen', 'aktau'],
]

console.log('--- маршруты (OSRM, реальная дорожная сеть) ---')
for (const [a, b] of pairs) {
  const r = await routeBetween(P[a], P[b])
  console.log(
    r
      ? `${P[a].name} → ${P[b].name}: ${r.distance_km} км, ${Math.floor(r.duration_min / 60)} ч ${r.duration_min % 60} мин`
      : `${P[a].name} → ${P[b].name}: OSRM не ответил`,
  )
}

console.log('\n--- погода (Open-Meteo, факт сейчас) ---')
for (const id of ['aktau', 'shetpe', 'beineu']) {
  const w = await weatherAt(P[id])
  console.log(w ? `${P[id].name}: ${w.temp_c} °C, ${w.description}, ветер ${w.wind_ms} м/с` : `${P[id].name}: нет данных`)
}

console.log('\n--- цена и требования ---')
const route = await routeBetween(P.aktau, P.shetpe)
const w = await weatherAt(P.aktau)
const price = priceRange(route.distance_km, 3, 0)
const req = requirementsFor('стройматериалы', w)
console.log(`Актау → Шетпе, 3 т стройматериалов`)
console.log(`  топливо: ${price.litres} л ≈ ${price.fuel_cost.toLocaleString('ru-RU')} ₸`)
console.log(`  вилка:   ${price.min.toLocaleString('ru-RU')} – ${price.max.toLocaleString('ru-RU')} ₸`)
console.log(`  кузов:   ${req.body} — ${req.notes[0]}`)

const perish = requirementsFor('продукты молоко', { temp_c: 31, precipitation_mm: 0 })
console.log(`\nПроверка правила: скоропорт при +31 °C → кузов «${perish.body}» (${perish.notes[0]})`)
if (perish.body !== 'реф') {
  console.error('ОШИБКА: скоропорт в жару обязан требовать рефрижератор')
  process.exit(1)
}
console.log('\nВсё сходится.')

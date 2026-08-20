// Порядок плеч в «моём дне». Ошибка здесь показывает день задом наперёд —
// сначала обратный рейс, потом первый, и цепочка перестаёт читаться.
// Запуск: node scripts/test-day-order.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Функция живёт в .tsx, тянуть туда React ради проверки незачем — берём
// исходник и выполняем сам алгоритм. Типы стираем: он на них не опирается.
const src = readFileSync('src/screens/Day.tsx', 'utf8')
const body = src.slice(src.indexOf('function chainByRoute'), src.indexOf('export default function Day'))
const chainByRoute = new Function(
  `${body.replace(/: Order\[\]/g, '').replace(/: string \| null/g, '').replace(/: Order\[\] =/g, ' =')}; return chainByRoute`,
)()

const at = (s) => ({ created_at: s })

// Заявка из цепочки заведена раньше, чем свежий заказ отправителя —
// ровно тот случай, на котором сортировка по времени создания врала.
const chained = { id: 'chain', from_id: 'shetpe', to_id: 'beineu', ...at('2026-08-20T06:00:00Z') }
const fresh = { id: 'fresh', from_id: 'aktau', to_id: 'shetpe', ...at('2026-08-20T09:00:00Z') }

let out = chainByRoute([chained, fresh], 'aktau')
assert.deepEqual(
  out.map((o) => o.id),
  ['fresh', 'chain'],
  'от базы в Актау день начинается с Актау → Шетпе',
)

// Без базы порядок всё равно должен стыковаться, просто нитка начнётся
// с самого раннего плеча.
out = chainByRoute([chained, fresh], null)
assert.deepEqual(out.map((o) => o.id), ['chain', 'fresh'])

// Несостыкованные рейсы не должны теряться.
const orphan = { id: 'orphan', from_id: 'kuryk', to_id: 'aktau', ...at('2026-08-20T12:00:00Z') }
out = chainByRoute([chained, fresh, orphan], 'aktau')
assert.equal(out.length, 3, 'ни одно плечо не пропало')
assert.equal(out[0].id, 'fresh')

// Пустой день не должен падать.
assert.deepEqual(chainByRoute([], 'aktau'), [])

console.log('Порядок плеч дня верный.')

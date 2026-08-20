// Проверка разбора правилами. Гоняется без сети и без ключа.
import { fallbackParse } from '../api/_lib/fallback-parse.ts'

const POINTS = [
  { id: 'aktau', name: 'Актау' },
  { id: 'shetpe', name: 'Шетпе' },
  { id: 'beineu', name: 'Бейнеу' },
  { id: 'zhanaozen', name: 'Жанаозен' },
  { id: 'fort', name: 'Форт-Шевченко' },
  { id: 'kuryk', name: 'Курык' },
]

const CASES = [
  {
    text: 'Надо отвезти 3 тонны стройматериала из Актау в Шетпе к пятнице, нужен один грузчик',
    want: { from_id: 'aktau', to_id: 'shetpe', weight_t: 3, loaders: 1 },
  },
  {
    text: '2 т оборудования Жанаозен — Актау',
    want: { from_id: 'zhanaozen', to_id: 'aktau', weight_t: 2, loaders: 0 },
  },
  {
    text: 'Пять тонн продуктов до Бейнеу из Актау, двое грузчиков',
    want: { from_id: 'aktau', to_id: 'beineu', loaders: 2 },
  },
  {
    text: '1.5 т мебели Курык - Актау завтра',
    want: { from_id: 'kuryk', to_id: 'aktau', weight_t: 1.5 },
  },
]

let bad = 0
for (const c of CASES) {
  const got = fallbackParse(c.text, POINTS, new Date('2026-08-19T10:00:00Z'))
  const wrong = Object.entries(c.want).filter(([k, v]) => got[k] !== v)
  if (wrong.length) {
    bad++
    console.log(`ПЛОХО  ${c.text}`)
    for (const [k, v] of wrong) console.log(`         ${k}: ждали ${v}, вышло ${got[k]}`)
  } else {
    console.log(`ok     ${c.text.slice(0, 46)}… → ${got.from_id}→${got.to_id}, ${got.weight_t} т, ${got.loaders} грузч.`)
  }
}

console.log(bad === 0 ? '\nПравила держат все случаи.' : `\nПровалов: ${bad}`)
process.exit(bad === 0 ? 0 : 1)

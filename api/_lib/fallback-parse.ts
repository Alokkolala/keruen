// Разбор заявки правилами — страховка на случай, когда модель молчит.
// Это не мок: настоящий парсер, просто проще. Города известны, тоннаж это
// число рядом со словом «тонна», грузчики — число рядом со словом «грузчик».
// Всё, что он не понял, остаётся null — экран подтверждения даст поправить.

import { fromWeekday } from './dates.js'

export interface Parsed {
  cargo: string | null
  weight_t: number | null
  from_id: string | null
  to_id: string | null
  loaders: number
  deadline_hint: string | null
  deadline: string | null
}

const WORD_NUM: Record<string, number> = {
  один: 1, одного: 1, одна: 1,
  два: 2, двух: 2, две: 2, двое: 2, двоих: 2,
  три: 3, трёх: 3, трех: 3, трое: 3, троих: 3,
  четыре: 4, четырёх: 4, пять: 5,
}

// Русские окончания режем грубо: «Актау» не склоняется, а «Шетпе», «Бейнеу»,
// «Жанаозен» в тексте встречаются и как «в Шетпе», и как «до Жанаозена».
const stem = (s: string) => s.toLowerCase().replace(/[её]/g, 'е').slice(0, 6)

export function fallbackParse(
  text: string,
  points: { id: string; name: string }[],
  today = new Date(),
): Parsed {
  const lower = text.toLowerCase().replace(/[её]/g, 'е')

  // --- Точки. Сначала по предлогам: «до Бейнеу из Актау» ломает порядок
  // слов, но предлог говорит направление однозначно.
  const found: { id: string; at: number }[] = []
  let byPrepFrom: string | null = null
  let byPrepTo: string | null = null

  for (const p of points) {
    const needle = stem(p.name)
    const at = lower.indexOf(needle)
    if (at < 0) continue
    found.push({ id: p.id, at })
    if (!byPrepFrom && new RegExp(`(?:из|от|с)\\s+${needle}`).test(lower)) byPrepFrom = p.id
    if (!byPrepTo && new RegExp(`(?:в|во|до|на)\\s+${needle}`).test(lower)) byPrepTo = p.id
  }
  found.sort((a, b) => a.at - b.at)

  // Предлог главнее порядка; если предлогов нет — «X — Y» читаем слева направо.
  const from_id = byPrepFrom ?? found.find((f) => f.id !== byPrepTo)?.id ?? null
  const to_id = byPrepTo ?? found.find((f) => f.id !== from_id)?.id ?? null

  // --- Вес: число рядом со словом тонна.
  // \b тут не годится: в JS границы слова считаются по ASCII, и «т» для
  // регулярки не буква — «2 т» не находилось. Отсекаем следующей буквой.
  const wMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:т(?![а-я])|тонн)/)
  let weight_t = wMatch ? Number(wMatch[1].replace(',', '.')) : null
  if (!weight_t) {
    const word = Object.keys(WORD_NUM).find((w) => new RegExp(`${w}\\s+тонн`).test(lower))
    if (word) weight_t = WORD_NUM[word]
  }

  // --- Грузчики.
  let loaders = 0
  const lMatch = lower.match(/(\d+)\s*грузчик/)
  if (lMatch) loaders = Number(lMatch[1])
  else {
    const word = Object.keys(WORD_NUM).find((w) => new RegExp(`${w}\\s+грузчик`).test(lower))
    if (word) loaders = WORD_NUM[word]
    else if (/грузчик/.test(lower)) loaders = 1
  }

  // --- Груз: берём слово после числа с тоннами, до предлога «из/с/от».
  let cargo: string | null = null
  const cMatch = lower.match(
    /(?:\d+(?:[.,]\d+)?\s*(?:т(?![а-я])|тонн\w*)\s+)([а-я\- ]{3,40}?)(?=\s+(?:из|с\s|от|в\s|до\s|на\s)|\s*[-—]|$)/,
  )
  if (cMatch) cargo = cMatch[1].trim()
  if (!cargo) {
    const known = [
      'стройматериал', 'цемент', 'кирпич', 'продукт', 'оборудование',
      'мебель', 'техник', 'труб', 'металл', 'зерно', 'вод',
    ].find((k) => lower.includes(k))
    if (known) cargo = known
  }

  // --- Срок: день недели считаем арифметикой, а не догадкой.
  const hintMatch = text.match(
    /(к\s+\w+|до\s+\w+|завтра|послезавтра|сегодня|срочно|утром|вечером)/i,
  )
  const deadline_hint = hintMatch ? hintMatch[1] : null
  const deadline = fromWeekday(deadline_hint ?? text, today) ?? null

  return { cargo, weight_t, from_id, to_id, loaders, deadline_hint, deadline }
}

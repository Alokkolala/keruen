// Локальная дата, не UTC: вечером toISOString уводит срок на день назад.
export const isoDate = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)

// Понедельник = 1, воскресенье = 0 — как в Date.getDay().
const WEEKDAYS: [RegExp, number][] = [
  [/понедельник/i, 1],
  [/вторник/i, 2],
  [/сред[ыуа]/i, 3],
  [/четверг/i, 4],
  [/пятниц/i, 5],
  [/суббот/i, 6],
  [/воскресен/i, 0],
]

/**
 * «К пятнице», «завтра», «послезавтра» — чистая арифметика по календарю.
 * Модель тут регулярно ошибается на день, а срок доставки ошибаться не может.
 * Возвращает null, если в тексте нет ничего похожего на день.
 */
export function fromWeekday(hint: string, today: Date): string | null {
  const h = (hint || '').toLowerCase()
  if (/послезавтра/.test(h)) return isoDate(new Date(today.getTime() + 2 * 86_400_000))
  if (/завтра/.test(h)) return isoDate(new Date(today.getTime() + 86_400_000))
  if (/сегодня/.test(h)) return isoDate(today)

  for (const [re, target] of WEEKDAYS) {
    if (!re.test(h)) continue
    // Ближайший такой день, но не сегодня: «к пятнице» в пятницу — уже поздно.
    const delta = (target - today.getDay() + 7) % 7 || 7
    return isoDate(new Date(today.getTime() + delta * 86_400_000))
  }
  return null
}

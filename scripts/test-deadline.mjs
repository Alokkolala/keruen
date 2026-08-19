// Срок доставки — единственное место, где ошибка на день видна прямо на демо.
// Запуск: npx tsx scripts/test-deadline.mjs
import assert from 'node:assert/strict'
import { fromWeekday } from '../api/_lib/dates.ts'

const thu = new Date('2026-08-20T10:00:00') // четверг
const fri = new Date('2026-08-21T10:00:00') // пятница

assert.equal(fromWeekday('к пятнице', thu), '2026-08-21', 'в четверг пятница — завтра')
assert.equal(fromWeekday('к пятнице', fri), '2026-08-28', 'в пятницу «к пятнице» — уже следующая')
assert.equal(fromWeekday('завтра утром', thu), '2026-08-21')
assert.equal(fromWeekday('послезавтра', thu), '2026-08-22')
assert.equal(fromWeekday('сегодня до вечера', thu), '2026-08-20')
assert.equal(fromWeekday('в среду', thu), '2026-08-26')
assert.equal(fromWeekday('к понедельнику', fri), '2026-08-24')
assert.equal(fromWeekday('как можно скорее', thu), null, 'без дня недели — не выдумываем дату')
assert.equal(fromWeekday('', thu), null)

console.log('Срок считается верно.')

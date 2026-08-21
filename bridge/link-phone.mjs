/**
 * Привязывает номер к перевозчику. Номер вводишь ты — в код и в git он не
 * попадает, лежит только в базе.
 *
 *   npm run link-phone -- +77011234567            → первому перевозчику
 *   npm run link-phone -- +77011234567 "Ерлан Т."  → конкретному
 *   npm run link-phone -- --list                   → кто с номером сейчас
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(here, '..', '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line.includes('=') || line.trimStart().startsWith('#')) continue
    const k = line.slice(0, line.indexOf('=')).trim()
    const v = line.slice(line.indexOf('=') + 1).trim().replace(/^"|"$/g, '')
    if (!process.env[k]) process.env[k] = v
  }
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const [arg, who] = process.argv.slice(2)

const { data: carriers } = await db.from('carriers').select('id,name,vehicle,phone').order('name')

const list = () => {
  console.log('Перевозчики:')
  for (const c of carriers ?? []) {
    console.log(`  ${c.name.padEnd(12)} ${c.vehicle.padEnd(16)} ${c.phone ?? '— нет номера'}`)
  }
}

// process.exit посреди живого сокета роняет libuv с ассертом на Windows.
// Выходим через код возврата и даём соединению закрыться самому.
const done = (code = 0) => {
  process.exitCode = code
  setTimeout(() => process.exit(code), 300).unref()
}

if (!arg || arg === '--list') {
  list()
  console.log('\nПривязать:  npm run link-phone -- +77011234567 "Ерлан Т."')
  done()
}

const digits = (arg ?? '').replace(/\D/g, '')
if (arg && arg !== '--list' && digits.length < 10) {
  console.error(`Не похоже на номер: ${arg}`)
  done(1)
}

const target = who
  ? carriers?.find((c) => c.name.toLowerCase().startsWith(who.toLowerCase()))
  : carriers?.[0]

if (arg && arg !== '--list' && !target) {
  console.error(`Перевозчик «${who}» не найден.`)
  list()
  done(1)
}

if (!target) done(1)

// Только одному: на демо один номер, и три сообщения подряд читаются как спам.
await db.from('carriers').update({ phone: null }).neq('id', target.id)
await db.from('carriers').update({ phone: arg }).eq('id', target.id)

// Номер отправителя, который агент даёт перевозчику для связи.
if (process.env.KERUEN_SHIPPER_PHONE) {
  await db
    .from('orders')
    .update({ contact_phone: process.env.KERUEN_SHIPPER_PHONE })
    .is('contact_phone', null)
}

console.log(`Готово: ${target.name} (${target.vehicle}) → ${arg}`)
console.log('Остальным перевозчикам номер снят — чтобы на один телефон не пришло три сообщения.')
console.log('\nЗапуск моста:  cd bridge && npm start')

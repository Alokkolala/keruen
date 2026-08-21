/**
 * Мост KERUEN ↔ WhatsApp.
 *
 * Почему отдельный процесс, а не функция Vercel: whatsapp-web.js держит живой
 * браузер и папку с сессией. Функции живут секунды и без диска — там это
 * не поднять в принципе.
 *
 * Почему подписка, а не вебхук: мост крутится на ноутбуке за NAT, снаружи
 * его не позвать. Он сам слушает Supabase realtime — туннель не нужен.
 *
 * Поток:
 *   агент создал предложения → мост выбирает ОДНО и пишет перевозчику
 *   перевозчик отвечает «да»  → мост принимает заказ, как кнопка «Беру»
 *   агент ищет цепочку        → новое предложение → следующее сообщение
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import wwebjs from 'whatsapp-web.js'
import qrcodeTerminal from 'qrcode-terminal'

const { Client, LocalAuth } = wwebjs
const here = dirname(fileURLToPath(import.meta.url))

/* ——— окружение ————————————————————————————————————— */

const envPath = resolve(here, '..', '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line.includes('=') || line.trimStart().startsWith('#')) continue
    const k = line.slice(0, line.indexOf('=')).trim()
    const v = line.slice(line.indexOf('=') + 1).trim().replace(/^"|"$/g, '')
    if (!process.env[k]) process.env[k] = v
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const APP_URL = process.env.KERUEN_APP_URL || 'https://keruen-xi.vercel.app'

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Нет SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY в .env.local')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

/* ——— WhatsApp ——————————————————————————————————————— */

// Своя папка сессии: workgo не трогаем, чтобы два проекта не дрались за неё.
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: resolve(here, '.wa-session'), clientId: 'keruen' }),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
})

let ready = false
// Пауза между сообщениями: WhatsApp банит за очереди без задержек.
const SEND_GAP_MS = 2500
let lastSentAt = 0

function toChatId(phone) {
  let digits = String(phone).replace(/\D/g, '')
  // Казахстанские номера пишут и через 8, и через 7.
  if (digits.length === 11 && digits.startsWith('8')) digits = '7' + digits.slice(1)
  if (digits.length === 10) digits = '7' + digits
  return digits + '@c.us'
}

async function send(phone, text) {
  const gap = Date.now() - lastSentAt
  if (gap < SEND_GAP_MS) await new Promise((r) => setTimeout(r, SEND_GAP_MS - gap))
  const chatId = toChatId(phone)
  await client.sendMessage(chatId, text)
  lastSentAt = Date.now()
  console.log(`→ ${chatId}: ${text.split('\n')[0]}`)
  return chatId
}

/* ——— тексты ————————————————————————————————————————— */

const money = (n) => `${Math.round(Number(n)).toLocaleString('ru-RU')} ₸`

function offerText({ order, carrier, offer, from, to }) {
  const lines = [
    'KERUEN — появился заказ по вашему маршруту.',
    '',
    `${from} → ${to}`,
    `${order.cargo ?? 'груз'} · ${order.weight_t ?? '?'} т`,
    `${money(offer.price)}`,
  ]
  if (order.distance_km) {
    const h = Math.floor((order.duration_min ?? 0) / 60)
    const m = Math.round((order.duration_min ?? 0) % 60)
    lines.push(`${order.distance_km} км · ${h ? `${h} ч ` : ''}${m} мин`)
  }
  if (order.weather) {
    lines.push(`Погода: ${order.weather.temp_c} °C, ${order.weather.description}`)
  }
  if (order.loaders > 0) lines.push(`Нужны грузчики: ${order.loaders}`)
  if (offer.reason) lines.push('', `Почему вам: ${offer.reason}`)

  lines.push('', 'Чтобы взять — ответьте «да».')
  if (order.contact_phone) {
    lines.push(`Связаться с заказчиком: ${order.contact_phone}`)
  }
  lines.push(`Открыть в приложении: ${APP_URL}/carrier`)
  return lines.join('\n')
}

/* ——— отправка предложений ——————————————————————————— */

const pointName = new Map()
async function loadPoints() {
  const { data } = await db.from('points').select('id,name')
  for (const p of data ?? []) pointName.set(p.id, p.name)
}

/**
 * На один заказ уходит ОДНО сообщение, даже если агент разослал предложения
 * трём машинам. Иначе на телефон падает три одинаковых текста подряд, а это
 * и выглядит спамом, и банится быстрее всего.
 */
async function pushPendingOffers() {
  const { data: offers, error } = await db
    .from('offers')
    .select('*, carriers(id,name,vehicle,body,phone), orders(*)')
    .eq('status', 'sent')
    .is('wa_sent_at', null)
    .order('created_at', { ascending: true })

  if (error) return console.error('чтение предложений:', error.message)
  if (!offers?.length) return

  const seenOrders = new Set()
  for (const offer of offers) {
    const order = offer.orders
    const carrier = offer.carriers
    if (!order || !carrier) continue

    // По одному заказу пишем один раз.
    if (seenOrders.has(order.id)) {
      await db.from('offers').update({ wa_sent_at: new Date().toISOString() }).eq('id', offer.id)
      continue
    }
    if (!carrier.phone) continue // некому писать — молча пропускаем

    seenOrders.add(order.id)
    try {
      const chatId = await send(
        carrier.phone,
        offerText({
          order,
          carrier,
          offer,
          from: pointName.get(order.from_id) ?? '—',
          to: pointName.get(order.to_id) ?? '—',
        }),
      )
      await db
        .from('offers')
        .update({ wa_sent_at: new Date().toISOString(), wa_chat_id: chatId })
        .eq('id', offer.id)
    } catch (e) {
      console.error('отправка не удалась:', e.message)
    }
  }
}

/* ——— приём ответов —————————————————————————————————— */

// \b после кириллицы в JS не работает — границы слова считаются по ASCII.
// Поэтому явный конец строки или небуква.
const YES = /^\s*(да|беру|согласен|ок|окей|\+|yes|ok)(?![а-яё\w])/i
// «не подходит» — это отказ, но просмотр вперёд нельзя вешать на «не »:
// после пробела там всегда буква. Поэтому варианты разведены.
const NO = /^\s*(?:(?:нет|пас|отказ|no)(?![а-яё\w])|не\s)/i

async function acceptOffer(offer) {
  await db.from('offers').update({ status: 'accepted' }).eq('id', offer.id)
  await db
    .from('offers')
    .update({ status: 'declined' })
    .eq('order_id', offer.order_id)
    .neq('id', offer.id)
  await db
    .from('orders')
    .update({
      status: 'assigned',
      carrier_id: offer.carrier_id,
      price_final: offer.price,
      started_at: new Date().toISOString(),
    })
    .eq('id', offer.order_id)

  // Тот же вызов, что делает кнопка «Беру»: агент ищет обратный груз,
  // пока машина ещё даже не выехала.
  fetch(`${APP_URL}/api/chain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: offer.order_id }),
  }).catch(() => {})
}

async function onMessage(msg) {
  if (msg.fromMe) return
  const text = (msg.body ?? '').trim()

  // Ищем последнее живое предложение, отправленное в этот чат.
  const { data: offers } = await db
    .from('offers')
    .select('*, orders(*)')
    .eq('wa_chat_id', msg.from)
    .eq('status', 'sent')
    .order('wa_sent_at', { ascending: false })
    .limit(1)

  const offer = offers?.[0]
  if (!offer) {
    if (YES.test(text) || NO.test(text)) {
      await msg.reply('KERUEN: сейчас нет активных предложений. Как появится — напишу.')
    }
    return
  }

  const order = offer.orders
  const route = `${pointName.get(order?.from_id) ?? '—'} → ${pointName.get(order?.to_id) ?? '—'}`

  if (YES.test(text)) {
    await acceptOffer(offer)
    await msg.reply(
      [
        `KERUEN: принято. ${route}, ${money(offer.price)}.`,
        order?.contact_phone ? `Заказчик: ${order.contact_phone}` : null,
        'Ищу вам обратный груз — напишу, как найду.',
        `${APP_URL}/day`,
      ]
        .filter(Boolean)
        .join('\n'),
    )
    console.log(`✓ ${msg.from} принял ${route}`)
    return
  }

  if (NO.test(text)) {
    await db.from('offers').update({ status: 'declined' }).eq('id', offer.id)
    await msg.reply('KERUEN: понял, убрал. Напишу, когда будет другой груз.')
    return
  }

  await msg.reply(`KERUEN: по заказу ${route} ответьте «да», чтобы взять, или «нет».`)
}

/* ——— запуск ————————————————————————————————————————— */

client.on('qr', (qr) => {
  console.log('\nОтсканируйте QR в WhatsApp того номера, с которого будет писать KERUEN:\n')
  qrcodeTerminal.generate(qr, { small: true })
})

client.on('ready', async () => {
  ready = true
  await loadPoints()
  console.log('WhatsApp готов. Слушаю новые предложения.')
  await pushPendingOffers()

  // Realtime — основной путь. Опрос раз в 15 с страхует от разрыва сокета:
  // ноутбук уходит в сон, Wi-Fi моргает, а сообщение потеряться не должно.
  db.channel('bridge-offers')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'offers' }, () => {
      if (ready) pushPendingOffers()
    })
    .subscribe()

  setInterval(() => ready && pushPendingOffers(), 15_000)
})

client.on('message', (msg) => {
  onMessage(msg).catch((e) => console.error('ответ не обработан:', e.message))
})

client.on('disconnected', (reason) => {
  ready = false
  console.error('WhatsApp отключился:', reason)
})

client.initialize()

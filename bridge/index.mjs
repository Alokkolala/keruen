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
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import wwebjs from 'whatsapp-web.js'
import qrcodeTerminal from 'qrcode-terminal'
import QRCode from 'qrcode'

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

// Версию WhatsApp Web не закрепляем: библиотека 1.34.7 рассчитана на
// 2.3000.1017054665 и умеет внедряться только в близкие к ней. Свежая
// версия из реестра ломала запуск с «Execution context was destroyed»
// прямо на Client.inject.
// keruen: если связывание начнёт падать по версии — задать WA_WEB_VERSION
// с версией, близкой к той, что в node_modules/whatsapp-web.js/src/util/Constants.js
const PINNED = process.env.WA_WEB_VERSION

// Своя папка сессии: workgo не трогаем, чтобы два проекта не дрались за неё.
// После первого сканирования QR больше не нужен — сессия лежит здесь.
const SESSION_DIR = resolve(here, '.wa-session')

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: SESSION_DIR, clientId: 'keruen' }),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
  ...(PINNED
    ? {
        webVersionCache: {
          type: 'remote',
          remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${PINNED}.html`,
        },
      }
    : {}),
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

/* ——— страница с QR ————————————————————————————————— */

// В PowerShell блоки QR съезжают по ширине символа, и камера их не читает.
// Поэтому отдаём картинку страницей: она сама обновляется, когда WhatsApp
// присылает новый код, и сама закрывается, когда связывание прошло.
const QR_PORT = Number(process.env.KERUEN_QR_PORT || 8787)
let qrDataUrl = null

const qrServer = createServer(async (req, res) => {
  if (req.url === '/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ ready, qr: qrDataUrl }))
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(`<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>KERUEN · привязка WhatsApp</title>
<style>
 body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f2f0ee;
      font:16px/1.5 Inter,system-ui,sans-serif;color:#1c1c1a}
 .card{background:#fcfbf9;border-radius:22px;padding:28px;text-align:center;
       box-shadow:0 4px 18px rgb(0 0 0/.06);max-width:420px}
 h1{font-size:20px;margin:0 0 6px} p{color:#8e8c88;font-size:13px;margin:0 0 18px}
 img{width:300px;height:300px;image-rendering:pixelated}
 ol{text-align:left;font-size:13px;color:#8e8c88;padding-left:20px;margin:18px 0 0}
 .ok{font-size:44px}
</style></head><body><div class="card" id="c">
<h1>Привязка WhatsApp</h1><p>Ждём код…</p></div>
<script>
async function tick(){
  const s = await (await fetch('/state')).json();
  const c = document.getElementById('c');
  if (s.ready) {
    c.innerHTML = '<div class="ok">✅</div><h1>Готово</h1>'
      + '<p>Номер привязан. Вкладку можно закрыть.</p>';
    return;
  }
  if (s.qr) {
    c.innerHTML = '<h1>Привязка WhatsApp</h1>'
      + '<p>Сканируйте с того номера, с которого будет писать KERUEN</p>'
      + '<img src="' + s.qr + '" alt="QR">'
      + '<ol><li>WhatsApp на телефоне</li><li>Настройки → Связанные устройства</li>'
      + '<li>Привязка устройства</li><li>Наведите на код</li></ol>';
  }
  setTimeout(tick, 1500);
}
tick();
</script></body></html>`)
})

client.on('qr', async (qr) => {
  try {
    qrDataUrl = await QRCode.toDataURL(qr, { width: 520, margin: 2 })
  } catch (e) {
    console.error('не смог отрисовать QR:', e.message)
  }
  console.log('\nОткройте и отсканируйте:  http://localhost:' + QR_PORT)
  console.log('Он же в терминале, если браузера нет:\n')
  qrcodeTerminal.generate(qr, { small: true })
})

client.on('ready', async () => {
  ready = true
  qrDataUrl = null
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

client.on('authenticated', () => {
  console.log('Сессия сохранена в bridge/.wa-session — QR больше не понадобится.')
})

client.on('disconnected', (reason) => {
  ready = false
  console.error('WhatsApp отключился:', reason)
  // Разрыв не должен убивать мост: телефон мог уйти в сон или сеть моргнуть.
  setTimeout(() => client.initialize().catch((e) => console.error(e.message)), 5000)
})

// Падение внутри puppeteer не должно ронять процесс: иначе мост умирает
// молча посреди демо, и об этом узнаёшь, только когда сообщение не пришло.
process.on('unhandledRejection', (e) => {
  console.error('Сбой:', e instanceof Error ? e.message : e)
})

qrServer.listen(QR_PORT, () => {
  const url = `http://localhost:${QR_PORT}`
  console.log(`Страница привязки: ${url}`)
  // Открываем сразу: код живёт около минуты, искать вкладку некогда.
  if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true }).unref()
})

const hasSession = existsSync(resolve(SESSION_DIR, 'session-keruen'))
console.log(
  hasSession
    ? 'Сессия найдена — подключаюсь без QR…'
    : 'Первый запуск: сейчас появится QR. Отсканируете один раз, дальше молча.',
)

client.initialize().catch((e) => {
  console.error('\nЗапуск не удался:', e.message)
  console.error('Если это «Execution context was destroyed» — снимите WA_WEB_VERSION')
  console.error('и удалите bridge/.wa-session, затем запустите снова.')
  process.exitCode = 1
})

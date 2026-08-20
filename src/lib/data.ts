import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Carrier, Offer, Order, Point } from './types'

export async function api<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  // Не всякий сбой приходит как JSON: таймаут функции, 502 от прокси и
  // «страница не найдена» отдают HTML. Раньше это превращалось в
  // «Unexpected end of JSON input» — сообщение, из которого ничего не понять.
  const text = await r.text()
  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(
      r.ok ? `Сервис ответил не по формату (${path})` : `Сервис недоступен, ошибка ${r.status}`,
    )
  }
  if (!r.ok) throw new Error(json.error ?? `Ошибка ${r.status}`)
  return json as T
}

export function usePoints() {
  const [points, setPoints] = useState<Map<string, Point>>(new Map())
  useEffect(() => {
    supabase
      .from('points')
      .select('*')
      .then(({ data }) => setPoints(new Map((data ?? []).map((p) => [p.id, p as Point]))))
  }, [])
  return points
}

export function useCarriers() {
  const [carriers, setCarriers] = useState<Carrier[]>([])
  useEffect(() => {
    supabase
      .from('carriers')
      .select('*')
      .order('rating', { ascending: false })
      .then(({ data }) => setCarriers((data ?? []) as Carrier[]))
  }, [])
  return carriers
}

/**
 * Кто сидит за экраном перевозчика. Без этого /carrier показывал все
 * предложения в системе: агент рассылает один заказ трём машинам, и
 * отправитель видел свой единственный заказ тремя карточками.
 *
 * По умолчанию — первая машина в базе (Ерлан Т., та самая, что нарисована
 * в шапке). Логина в демо нет, поэтому выбор живёт в localStorage.
 */
const meWatchers = new Set<() => void>()

/** Сменить машину, под которой сидит перевозчик. Логина в демо нет. */
export function setMyCarrier(id: string) {
  localStorage.setItem('keruen:carrier', id)
  meWatchers.forEach((fn) => fn())
}

export function useMe() {
  const [me, setMe] = useState<Carrier | null | undefined>(undefined)
  const [bump, setBump] = useState(0)

  useEffect(() => {
    const fn = () => setBump((n) => n + 1)
    meWatchers.add(fn)
    return () => void meWatchers.delete(fn)
  }, [])

  useEffect(() => {
    let alive = true
    const saved = localStorage.getItem('keruen:carrier')
    const q = supabase.from('carriers').select('*')
    // created_at у засеянных машин одинаковый до миллисекунды — без второго
    // ключа порядок произвольный, и «кто я» прыгал бы между загрузками.
    const one = saved
      ? q.eq('id', saved).maybeSingle()
      : q
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .limit(1)
          .maybeSingle()
    one.then(({ data }) => {
      if (!alive) return
      // Машину могли удалить или база пересоздана — тогда выбор протух.
      if (!data && saved) localStorage.removeItem('keruen:carrier')
      setMe((data as Carrier) ?? null)
    })
    return () => {
      alive = false
    }
  }, [bump])

  return me
}

/**
 * Один заказ с подпиской на изменения — на этом живёт лог агента.
 * undefined — ещё грузим (показываем скелетон), null — такого заказа нет.
 */
export function useOrder(id: string | undefined) {
  const [order, setOrder] = useState<Order | null | undefined>(undefined)
  useEffect(() => {
    if (!id) return
    let alive = true
    supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => alive && setOrder((data as Order) ?? null))

    const ch = supabase
      .channel(`order-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` },
        (p) => setOrder(p.new as Order),
      )
      .subscribe()

    return () => {
      alive = false
      supabase.removeChannel(ch)
    }
  }, [id])
  return order
}

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const load = () =>
      supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          setOrders((data ?? []) as Order[])
          setLoading(false)
        })
    load()
    const ch = supabase
      .channel('orders-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .subscribe()
    return () => void supabase.removeChannel(ch)
  }, [])
  return { orders, loading }
}

/**
 * Порожний пробег между соседними плечами дня — настоящий OSRM.
 * null в элементе означает «не посчитали», и экран так и пишет:
 * подставлять правдоподобное число вместо ответа сервиса нельзя.
 */
export function useDeadhead(pairs: [string, string][]) {
  const [km, setKm] = useState<(number | null)[]>([])
  const key = JSON.stringify(pairs)
  useEffect(() => {
    if (!pairs.length) return setKm([])
    let alive = true
    api<{ km: (number | null)[] }>('deadhead', { pairs })
      .then((r) => alive && setKm(r.km))
      .catch(() => alive && setKm(pairs.map(() => null)))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return km
}

/** Входящие предложения перевозчику — обновляются в реальном времени. */
export function useOffers(status?: Offer['status']) {
  const [offers, setOffers] = useState<Offer[]>([])
  useEffect(() => {
    const load = async () => {
      let q = supabase.from('offers').select('*').order('created_at', { ascending: false })
      if (status) q = q.eq('status', status)
      const { data } = await q
      setOffers((data ?? []) as Offer[])
    }
    load()
    const ch = supabase
      .channel('offers-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offers' }, load)
      .subscribe()
    return () => void supabase.removeChannel(ch)
  }, [status])
  return offers
}

export async function acceptOffer(offer: Offer) {
  await supabase.from('offers').update({ status: 'accepted' }).eq('id', offer.id)
  await supabase
    .from('offers')
    .update({ status: 'declined' })
    .eq('order_id', offer.order_id)
    .neq('id', offer.id)
  await supabase
    .from('orders')
    .update({ status: 'assigned', carrier_id: offer.carrier_id, price_final: offer.price })
    .eq('id', offer.order_id)

  // Машина ещё даже не выехала, а агент уже ищет ей груз из точки выгрузки.
  // Не ждём ответа: цепочка догрузится сама и прилетит через realtime.
  api('chain', { orderId: offer.order_id }).catch(() => {})
}

export async function counterOffer(offer: Offer, price: number) {
  await supabase.from('offers').update({ status: 'countered', counter: price }).eq('id', offer.id)
}

/**
 * Удаление заказа. Плечи и предложения уходят каскадом — так описано в схеме,
 * поэтому чистить их отдельно не нужно.
 */
export async function deleteOrder(id: string) {
  const { error } = await supabase.from('orders').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Снять предложение — перевозчик больше его не увидит. */
export async function declineOffer(id: string) {
  const { error } = await supabase.from('offers').update({ status: 'declined' }).eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * Полный сброс демо. Живых заказов нет, только показательные — поэтому
 * сносим всё разом, а не выбираем по одному.
 */
export async function wipeOrders() {
  const NIL = '00000000-0000-0000-0000-000000000000'
  const { error } = await supabase.from('orders').delete().neq('id', NIL)
  if (error) throw new Error(error.message)
  await supabase.from('carriers').update({ free_from: null, free_at_id: null }).neq('id', NIL)
}

export function fmtDuration(min: number | null | undefined) {
  if (min == null) return '—'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? `${h} ч ${m} мин` : `${m} мин`
}

/**
 * Раскрывает лог агента по строке, а не пачкой.
 *
 * Маршрут, погода и цена считаются за ~200 мс и падают в базу почти
 * одновременно — а дальше 5–8 секунд молчания, пока модель выбирает машины.
 * Пачка, потом пустота ощущается как зависание, хотя работа идёт.
 * Поэтому держим паузу между строками: к концу капельницы ответ модели
 * обычно уже пришёл, и шва не видно.
 *
 * Цифры при этом настоящие — растягиваем показ, а не выдумываем работу.
 * Если отстали больше чем на три строки (агент уже закончил), догоняем
 * быстрее, чтобы не врать про «идёт поиск», когда всё готово.
 */
export function usePacedLog<T>(log: T[], done = false, gapMs = 1800) {
  const [shown, setShown] = useState(0)

  // Открыли другой заказ — начинаем показ заново.
  const empty = log.length === 0
  useEffect(() => {
    if (empty) setShown(0)
  }, [empty])

  useEffect(() => {
    if (shown >= log.length) return
    // Пока агент работает — держим ритм: маршрут, погода и цена готовы за
    // секунду, а решение по машинам приходит на восьмой. Растянутый показ
    // накрывает эту паузу. Когда агент закончил, добираем остаток быстро,
    // иначе экран врёт про «идёт поиск».
    const delay = shown === 0 ? 250 : done ? 220 : gapMs
    const t = setTimeout(() => setShown((n) => Math.min(log.length, n + 1)), delay)
    return () => clearTimeout(t)
  }, [log.length, shown, gapMs, done])

  return { visible: log.slice(0, shown), settled: shown >= log.length }
}

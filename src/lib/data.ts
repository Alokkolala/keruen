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

export function fmtDuration(min: number | null | undefined) {
  if (min == null) return '—'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? `${h} ч ${m} мин` : `${m} мин`
}

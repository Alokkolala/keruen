import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Carrier, Offer, Order, Point } from './types'

export async function api<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await r.json()
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

/** Один заказ с подпиской на изменения — на этом живёт лог агента. */
export function useOrder(id: string | undefined) {
  const [order, setOrder] = useState<Order | null>(null)
  useEffect(() => {
    if (!id) return
    let alive = true
    supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => alive && setOrder(data as Order))

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
  useEffect(() => {
    const load = () =>
      supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .then(({ data }) => setOrders((data ?? []) as Order[]))
    load()
    const ch = supabase
      .channel('orders-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .subscribe()
    return () => void supabase.removeChannel(ch)
  }, [])
  return orders
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

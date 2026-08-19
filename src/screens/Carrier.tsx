import { useState } from 'react'
import { Header, TabBar, Chip, Button, money } from '../ui/Shell'
import { Icon } from '../ui/Icon'
import { acceptOffer, counterOffer, useOffers, useOrders, usePoints, fmtDuration } from '../lib/data'

export default function Carrier() {
  const offers = useOffers()
  const orders = useOrders()
  const points = usePoints()
  const [busy, setBusy] = useState<string | null>(null)

  const live = offers.filter((o) => o.status === 'sent' || o.status === 'countered')

  return (
    <div className="screen">
      <Header />
      <h1 className="text-[20px] font-bold">Добрый день, Ерлан</h1>

      <section className="card flex items-center gap-3 p-3">
        <img src="/assets/truck-brand.png" alt="" className="h-11 w-[72px] shrink-0 object-contain" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold">ГАЗель Next · 5 т · тент</p>
          <p className="text-muted text-[12px]">Актау</p>
        </div>
        <Chip tone="green" icon="check">
          На линии
        </Chip>
      </section>

      {live.length === 0 && (
        <section className="card p-5 text-center">
          <Icon name="search" size={26} className="text-muted mx-auto" />
          <p className="mt-2 text-[14px] font-bold">Пока предложений нет</p>
          <p className="text-muted mt-1 text-[12px]">
            Как только агент найдёт подходящий груз — он появится здесь сам.
          </p>
        </section>
      )}

      {live.map((offer, i) => {
        const order = orders.find((o) => o.id === offer.order_id)
        if (!order) return null
        const from = points.get(order.from_id ?? '')
        const to = points.get(order.to_id ?? '')
        const price = offer.counter ?? offer.price
        return (
          <section key={offer.id} className="card rise p-3.5" style={{ animationDelay: `${i * 70}ms` }}>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <Chip icon="star">Подходящий заказ</Chip>
                <div className="mt-2 flex items-center gap-2 text-[20px] font-bold">
                  <span className="truncate">{from?.name}</span>
                  <span className="text-yellow-ink">→</span>
                  <span className="truncate">{to?.name}</span>
                </div>
                <p className="text-muted mt-0.5 text-[12.5px]">
                  {order.cargo} · {order.weight_t} т
                </p>
                <p className="tnum mt-1 text-[24px] font-bold">{money(price)}</p>
                <ul className="mt-2 space-y-1.5 text-[11.5px]">
                  <li className="flex items-center gap-2">
                    <Icon name="road" size={13} className="text-yellow-ink" />
                    {order.distance_km} км · {fmtDuration(order.duration_min)}
                  </li>
                  {order.weather && (
                    <li className="flex items-center gap-2">
                      <Icon name="weather" size={13} className="text-yellow-ink" />
                      {order.weather.temp_c} °C, {order.weather.description}
                    </li>
                  )}
                  {order.loaders > 0 && (
                    <li className="flex items-center gap-2">
                      <Icon name="comment" size={13} className="text-yellow-ink" />
                      нужны грузчики: {order.loaders}
                    </li>
                  )}
                </ul>
              </div>
              <img src="/assets/scene-road-truck.png" alt="" className="h-[150px] w-[130px] object-contain" />
            </div>

            {offer.reason && (
              <p className="bg-chip-y mt-3 rounded-[12px] p-2.5 text-[11.5px]">Почему вам: {offer.reason}</p>
            )}

            <div className="mt-3 flex gap-2.5">
              <Button
                disabled={busy === offer.id}
                onClick={async () => {
                  setBusy(offer.id)
                  await acceptOffer({ ...offer, price })
                  setBusy(null)
                }}
              >
                {busy === offer.id ? 'Беру…' : 'Беру'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  const raw = prompt('Ваша цена, ₸', String(Math.round(price * 1.12)))
                  const v = Number(raw)
                  if (v > 0) counterOffer(offer, v)
                }}
              >
                Своя цена
              </Button>
            </div>
          </section>
        )
      })}

      <TabBar role="carrier" />
    </div>
  )
}

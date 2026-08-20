import { useState } from 'react'
import {
  Header,
  TabBar,
  Chip,
  Button,
  ButtonRow,
  Empty,
  CardSkeleton,
  Num,
  money,
} from '../ui/Shell'
import { Icon } from '../ui/Icon'
import {
  acceptOffer,
  counterOffer,
  declineOffer,
  useOffers,
  useOrders,
  usePoints,
  fmtDuration,
} from '../lib/data'
import type { Offer } from '../lib/types'

export default function Carrier() {
  const offers = useOffers()
  const { orders, loading } = useOrders()
  const points = usePoints()
  const [busy, setBusy] = useState<string | null>(null)

  const live = offers.filter((o) => o.status === 'sent' || o.status === 'countered')

  return (
    <div className="screen">
      <Header />
      <h1 className="text-[20px] font-bold">Добрый день, Ерлан</h1>

      <section className="card flex items-center gap-3 p-3">
        <img
          src="/assets/truck-brand.png"
          alt=""
          className="h-11 w-[72px] shrink-0 object-contain"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold">ГАЗель Next · 5 т · тент</p>
          <p className="text-muted text-[12px]">Актау</p>
        </div>
        <Chip tone="green" icon="check">
          На линии
        </Chip>
      </section>

      {loading && <CardSkeleton rows={1} />}

      {!loading && live.length === 0 && (
        <Empty
          art="/assets/scene-road-truck.png"
          title="Пока предложений нет"
          hint="Агент сам пришлёт груз, который вам по пути. Экран обновится — обновлять вручную не надо."
        />
      )}

      {live.map((offer, i) => {
        const order = orders.find((o) => o.id === offer.order_id)
        if (!order) return null
        const from = points.get(order.from_id ?? '')
        const to = points.get(order.to_id ?? '')
        const price = offer.counter ?? offer.price
        return (
          <section
            key={offer.id}
            className="card rise p-3.5"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <Chip icon="star">Подходящий заказ</Chip>
                <div className="mt-2 flex items-center gap-2 text-[19px] font-bold">
                  <span className="truncate">{from?.name}</span>
                  <span className="text-yellow-ink shrink-0">→</span>
                  <span className="truncate">{to?.name}</span>
                </div>
                <p className="text-muted mt-0.5 truncate text-[12.5px]">
                  {order.cargo} · {order.weight_t} т
                </p>
                <Num value={price} fmt={money} className="mt-1 block text-[24px] font-bold" />
                <ul className="mt-2 space-y-1.5 text-[11.5px]">
                  <li className="flex items-center gap-2">
                    <Icon name="road" size={13} className="text-yellow-ink shrink-0" />
                    {order.distance_km ?? '—'} км · {fmtDuration(order.duration_min)}
                  </li>
                  {order.weather && (
                    <li className="flex items-center gap-2">
                      <Icon name="weather" size={13} className="text-yellow-ink shrink-0" />
                      {order.weather.temp_c} °C, {order.weather.description}
                    </li>
                  )}
                  {order.deadline && (
                    <li className="flex items-center gap-2">
                      <Icon name="clock" size={13} className="text-yellow-ink shrink-0" />
                      до{' '}
                      {new Date(order.deadline).toLocaleDateString('ru-RU', {
                        day: 'numeric',
                        month: 'long',
                      })}
                    </li>
                  )}
                  {order.loaders > 0 && (
                    <li className="flex items-center gap-2">
                      <Icon name="comment" size={13} className="text-yellow-ink shrink-0" />
                      нужны грузчики: {order.loaders}
                    </li>
                  )}
                </ul>
              </div>
              <img
                src="/assets/scene-road-truck.png"
                alt=""
                className="h-[150px] w-[112px] shrink-0 object-contain"
              />
            </div>

            {(order.from_address || order.to_address) && (
              <p className="text-muted mt-2 text-[11px] leading-[15px]">
                {order.from_address && <>Погрузка: {order.from_address}. </>}
                {order.to_address && <>Выгрузка: {order.to_address}.</>}
              </p>
            )}

            {offer.reason && (
              <p className="bg-chip-y mt-3 rounded-[12px] p-2.5 text-[11.5px]">
                Почему вам: {offer.reason}
              </p>
            )}

            <Actions offer={{ ...offer, price }} busy={busy === offer.id} onBusy={setBusy} />
          </section>
        )
      })}

      <TabBar role="carrier" />
    </div>
  )
}

/**
 * «Своя цена» раньше открывала window.prompt — системное окно поверх макета.
 * Теперь торг живёт внутри карточки: шаг ±1000 ₸ и ручной ввод.
 */
function Actions({
  offer,
  busy,
  onBusy,
}: {
  offer: Offer
  busy: boolean
  onBusy: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(() => Math.round((offer.price * 1.12) / 500) * 500)

  if (open)
    return (
      <div className="bg-bg mt-3 rounded-[16px] p-3">
        <p className="text-muted text-[11.5px]">Ваша цена за рейс</p>
        <div className="mt-1.5 flex items-center gap-2">
          <button
            onClick={() => setValue((v) => Math.max(500, v - 1000))}
            aria-label="Меньше на 1000"
            className="bg-card flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          >
            <Icon name="minus" size={15} />
          </button>
          <div className="bg-card flex min-w-0 flex-1 items-center justify-center gap-1 rounded-[14px] px-2 py-2.5">
            <input
              inputMode="numeric"
              value={value}
              onChange={(e) =>
                setValue(Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0))
              }
              className="tnum w-full min-w-0 bg-transparent text-center text-[19px] font-bold outline-none"
              aria-label="Ваша цена"
            />
            <span className="shrink-0 text-[15px] font-bold">₸</span>
          </div>
          <button
            onClick={() => setValue((v) => v + 1000)}
            aria-label="Больше на 1000"
            className="bg-card flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          >
            <Icon name="plus" size={15} />
          </button>
        </div>
        <p className="text-muted mt-1.5 text-[10.5px]">
          Агент предложил {money(offer.price)} — отправитель увидит вашу цену сразу.
        </p>
        <div className="mt-2.5">
          <ButtonRow>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button
              disabled={value <= 0}
              onClick={() => {
                counterOffer(offer, value)
                setOpen(false)
              }}
            >
              Отправить
            </Button>
          </ButtonRow>
        </div>
      </div>
    )

  return (
    <div className="mt-3">
      <ButtonRow>
        <Button
          disabled={busy}
          onClick={async () => {
            onBusy(offer.id)
            await acceptOffer(offer)
            onBusy(null)
          }}
        >
          {busy ? 'Беру…' : 'Беру'}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(true)}>
          Своя цена
        </Button>
      </ButtonRow>
      {/* Отказ — отдельной строкой и без акцента: это не равноценный
          третий выбор, а способ убрать карточку с глаз. */}
      <button
        onClick={() => declineOffer(offer.id)}
        className="text-muted hover:text-alert mt-2 w-full py-1.5 text-[12px] transition-colors"
      >
        Не подходит — убрать
      </button>
    </div>
  )
}

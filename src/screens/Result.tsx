import { useNavigate, useParams } from 'react-router-dom'
import { Header, TabBar, Button, Failed, CardSkeleton, Num, money } from '../ui/Shell'
import { Icon } from '../ui/Icon'
import { useCarriers, useOrder, usePoints, fmtDuration } from '../lib/data'
import { supabase } from '../lib/supabase'

// Те же калибровочные цифры, что в PRICING (api/_lib/tools.ts).
// Меняешь там — поменяй и здесь, иначе экономия на экране разойдётся с ценой.
const LITRES_PER_100KM = 25
const DIESEL_PER_LITRE = 295

export default function Result() {
  const { id } = useParams()
  const nav = useNavigate()
  const order = useOrder(id)
  const points = usePoints()
  const carriers = useCarriers()

  if (order === undefined)
    return (
      <div className="screen">
        <Header />
        <CardSkeleton rows={2} />
        <TabBar role="shipper" />
      </div>
    )

  if (order === null)
    return (
      <div className="screen">
        <Header />
        <Failed title="Заказ не найден" detail="Возможно, демо-данные сбросили" />
        <Button onClick={() => nav('/')}>На главную</Button>
        <TabBar role="shipper" />
      </div>
    )

  const from = points.get(order.from_id ?? '')
  const to = points.get(order.to_id ?? '')
  const carrier = carriers.find((c) => c.id === order.carrier_id)
  const savedFuel = order.empty_km ? Math.round((order.empty_km * LITRES_PER_100KM) / 100) : 0
  const savedMoney = savedFuel * DIESEL_PER_LITRE

  async function confirm() {
    // Отсюда, а не от created_at, считается ETA: между созданием заказа
    // и реальной погрузкой проходит весь поиск машины.
    await supabase
      .from('orders')
      .update({ status: 'in_transit', started_at: new Date().toISOString() })
      .eq('id', order!.id)
    nav(`/track/${order!.id}`, { viewTransition: true })
  }

  return (
    <div className="screen">
      <Header />

      <section className="card flex items-center gap-2 p-4">
        <div className="min-w-0 flex-1">
          <span className="bg-green pop mb-2 flex h-9 w-9 items-center justify-center rounded-full text-white">
            <Icon name="check" size={19} strokeWidth={3} />
          </span>
          <h1 className="text-[25px] leading-[30px] font-bold">
            Вариант
            <br />
            найден
          </h1>
          <p className="text-muted mt-2 text-[12.5px] leading-[17px]">
            Агент подобрал лучший рейс для вашего груза
          </p>
        </div>
        <img
          src="/assets/ill-truck-confetti.png"
          alt=""
          className="h-[132px] w-[132px] shrink-0 object-contain"
        />
      </section>

      <section className="card flex items-center gap-3.5 p-4">
        <img src="/assets/ill-driver.png" alt="" className="h-16 w-16 shrink-0 object-contain" />
        <dl className="min-w-0 flex-1 space-y-1.5 text-[12.5px]">
          {[
            ['Водитель', carrier?.name ?? '—'],
            ['Машина', carrier ? `${carrier.vehicle}, ${carrier.capacity_t} т, ${carrier.body}` : '—'],
            ['Маршрут', `${from?.name} → ${to?.name}`],
            ['В пути', `${order.distance_km ?? '—'} км · ${fmtDuration(order.duration_min)}`],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="text-muted w-[68px] shrink-0">{k}</dt>
              <dd className="min-w-0 flex-1 truncate font-bold">{v}</dd>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-0.5">
            <dt className="text-muted w-[68px] shrink-0">Цена</dt>
            <Num value={order.price_final} fmt={money} className="text-[17px] font-bold" />
          </div>
        </dl>
      </section>

      {(order.from_address || order.to_address) && (
        <section className="card p-3.5 text-[12px] leading-[17px]">
          {order.from_address && (
            <p className="flex gap-2">
              <Icon name="pin" size={13} className="text-yellow-ink mt-0.5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="text-muted">Погрузка: </span>
                {order.from_address}
              </span>
            </p>
          )}
          {order.to_address && (
            <p className="mt-1.5 flex gap-2">
              <Icon name="flag" size={13} className="text-yellow-ink mt-0.5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="text-muted">Выгрузка: </span>
                {order.to_address}
              </span>
            </p>
          )}
        </section>
      )}

      {order.empty_km ? (
        <section className="bg-chip-g border-green rise flex items-center gap-3 rounded-[18px] border p-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-green-ink text-[12.5px] leading-[17px]">
              Обратное плечо не пустое — убрано{' '}
              <Num value={order.empty_km} className="font-bold" /> км порожних
            </p>
            <p className="text-green-ink mt-1 text-[16px] font-bold">
              ≈ <Num value={savedMoney} fmt={(v) => Math.round(v).toLocaleString('ru-RU')} /> ₸ экономии
            </p>
          </div>
          <img
            src="/assets/ill-route-done.png"
            alt=""
            className="h-[60px] w-24 shrink-0 object-contain"
          />
        </section>
      ) : null}

      <Button onClick={confirm}>Подтвердить</Button>
      <a
        href="tel:+77000000000"
        className="bg-gray-btn text-ink flex min-h-[48px] items-center justify-center gap-2 rounded-[18px] px-4 py-3.5 text-[15px] font-medium"
      >
        <Icon name="phone" size={16} />
        Связаться с водителем
      </a>

      <TabBar role="shipper" />
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Header,
  TabBar,
  TitleBar,
  Chip,
  Button,
  Failed,
  CardSkeleton,
  money,
  useRole,
} from '../ui/Shell'
import { Icon } from '../ui/Icon'
import { useCarriers, useOrder, usePoints, fmtDuration } from '../lib/data'
import { supabase } from '../lib/supabase'

export default function Track() {
  const { id } = useParams()
  const nav = useNavigate()
  const order = useOrder(id)
  const points = usePoints()
  const carriers = useCarriers()
  // На этот экран теперь заходят с обеих сторон: отправитель из результата
  // и перевозчик из плана дня. Водителю незачем звонить самому себе.
  const iAm = useRole() ?? 'shipper'

  // Минутная стрелка: «осталось» должно таять само, без перезагрузки.
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  if (order === undefined)
    return (
      <div className="screen">
        <Header />
        <CardSkeleton rows={2} />
        <TabBar role={iAm} />
      </div>
    )

  if (order === null)
    return (
      <div className="screen">
        <Header />
        <Failed title="Заказ не найден" detail="Возможно, демо-данные сбросили" />
        <Button onClick={() => nav('/')}>На главную</Button>
        <TabBar role={iAm} />
      </div>
    )

  const from = points.get(order.from_id ?? '')
  const to = points.get(order.to_id ?? '')
  const carrier = carriers.find((c) => c.id === order.carrier_id)

  // ETA от момента погрузки, а не от создания заказа: между ними лежит
  // весь поиск машины, и на демо это давало прибытие «в прошлом».
  const start = new Date(order.started_at ?? order.created_at)
  const eta = new Date(start.getTime() + (order.duration_min ?? 0) * 60_000)
  const hhmm = (d: Date) => d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const leftMin = Math.max(0, Math.round((eta.getTime() - Date.now()) / 60_000))
  const done = order.status === 'done'
  const arrived = !done && leftMin === 0
  // Доля пути — по времени, а не по выдуманным координатам машины.
  const total = (order.duration_min ?? 0) * 60_000
  const progress = total ? Math.min(1, Math.max(0, (Date.now() - start.getTime()) / total)) : 0

  const steps = [
    { label: `Загрузка в ${from?.name}`, time: hhmm(start), state: 'done' as const },
    {
      label: 'В пути',
      time: hhmm(new Date(start.getTime() + 15 * 60_000)),
      state: done ? ('done' as const) : ('now' as const),
    },
    {
      label: `Прибытие в ${to?.name}`,
      time: hhmm(eta),
      state: done || arrived ? ('done' as const) : ('wait' as const),
    },
    { label: 'Выгрузка', time: done ? hhmm(eta) : '—', state: done ? ('done' as const) : ('wait' as const) },
  ]

  return (
    <div className="screen">
      <Header />
      <TitleBar
        title={done ? 'Груз доставлен' : 'Груз в пути'}
        sub={done ? `Доставлен в ${to?.name}` : `Прибытие в ${to?.name} — ${hhmm(eta)}`}
      />

      <section className="card relative overflow-hidden p-2">
        <img src="/assets/ill-map-region.png" alt="" className="h-[152px] w-full object-contain" />
        {/* полоса пути: заполняется по мере того, как идёт время рейса */}
        <div className="bg-line mx-3 mb-1 h-1.5 rounded-full">
          <div
            className="bg-green h-full rounded-full transition-[width] duration-700 ease-out"
            style={{ width: `${(done ? 1 : progress) * 100}%` }}
          />
        </div>
        <div className="text-muted mx-3 flex justify-between text-[10.5px]">
          <span>{from?.name}</span>
          <span>{to?.name}</span>
        </div>
      </section>

      <section className="card flex items-center gap-3.5 p-3.5">
        <img src="/assets/ill-clock-boxes.png" alt="" className="h-16 w-16 shrink-0 object-contain" />
        <div className="min-w-0 flex-1">
          <p className="text-muted text-[12px]">
            {done ? 'Доставлено в' : arrived ? 'Расчётное время вышло' : 'Ожидаемое прибытие'}
          </p>
          <p className="tnum text-[34px] leading-10 font-bold">{hhmm(eta)}</p>
          <p className="text-muted tnum text-[12px]">
            {done
              ? 'доставлено'
              : arrived
                ? `машина на месте · ${order.distance_km ?? '—'} км позади`
                : `осталось ${fmtDuration(leftMin)} · ${order.distance_km ?? '—'} км`}
          </p>
        </div>
      </section>

      <section className="card px-4 py-2">
        {steps.map((s, i) => (
          <div
            key={s.label}
            className="rise flex items-center gap-3 py-2.5"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                s.state === 'done'
                  ? 'bg-green text-white'
                  : s.state === 'now'
                    ? 'border-green breathe border-4 bg-white'
                    : 'border-line border-2 bg-white'
              }`}
            >
              {s.state === 'done' && <Icon name="check" size={10} strokeWidth={3} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-[14px] font-bold ${s.state === 'wait' ? 'text-muted' : ''}`}>
                {s.label}
              </p>
              {s.state === 'wait' && <Chip tone="yellow">Ожидается</Chip>}
            </div>
            <span className={`tnum text-[13px] ${s.state === 'wait' ? 'text-muted' : ''}`}>{s.time}</span>
          </div>
        ))}
      </section>

      {iAm === 'carrier' ? (
        // Водителю нужны не кнопки связи с самим собой, а куда подъезжать.
        // Телефона отправителя в модели данных нет — выдумывать его не станем.
        <section className="card p-3.5 text-[12.5px] leading-[17px]">
          <p className="flex gap-2">
            <Icon name="pin" size={14} className="text-yellow-ink mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="text-muted">Погрузка: </span>
              {order.from_address || from?.name || '—'}
            </span>
          </p>
          <p className="mt-1.5 flex gap-2">
            <Icon name="flag" size={14} className="text-yellow-ink mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="text-muted">Выгрузка: </span>
              {order.to_address || to?.name || '—'}
            </span>
          </p>
          <p className="mt-1.5 flex gap-2">
            <Icon name="cube" size={14} className="text-yellow-ink mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1">
              {order.cargo} · {order.weight_t} т
              {order.loaders > 0 ? ` · грузчиков ${order.loaders}` : ''}
            </span>
          </p>
        </section>
      ) : (
        <div className="flex gap-2.5">
          <a
            href="tel:+77000000000"
            className="card flex min-w-0 flex-1 items-center gap-2 px-3 py-3 text-[12.5px] font-medium"
          >
            <span className="bg-yellow flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]">
              <Icon name="phone" size={15} />
            </span>
            <span className="truncate">Позвонить {carrier?.name ?? 'водителю'}</span>
          </a>
          <span className="card flex shrink-0 items-center gap-2 px-3 py-3 text-[12.5px] font-medium">
            <span className="bg-yellow flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]">
              <Icon name="chat" size={15} />
            </span>
            Чат
          </span>
        </div>
      )}

      {!done && (
        <Button
          onClick={async () => {
            await supabase.from('orders').update({ status: 'done' }).eq('id', order.id)
            nav(iAm === 'carrier' ? '/day' : '/orders', { viewTransition: true })
          }}
        >
          Груз выгружен
        </Button>
      )}

      <p className="text-muted text-center text-[11px]">Цена сделки {money(order.price_final)}</p>

      <TabBar role={iAm} />
    </div>
  )
}

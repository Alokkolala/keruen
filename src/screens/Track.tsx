import { useNavigate, useParams } from 'react-router-dom'
import { Header, TabBar, TitleBar, Chip, Button, money } from '../ui/Shell'
import { Icon } from '../ui/Icon'
import { useCarriers, useOrder, usePoints, fmtDuration } from '../lib/data'
import { supabase } from '../lib/supabase'

export default function Track() {
  const { id } = useParams()
  const nav = useNavigate()
  const order = useOrder(id)
  const points = usePoints()
  const carriers = useCarriers()

  if (!order) return <div className="screen">Загружаю…</div>
  const from = points.get(order.from_id ?? '')
  const to = points.get(order.to_id ?? '')
  const carrier = carriers.find((c) => c.id === order.carrier_id)

  const start = new Date(order.created_at)
  const eta = new Date(start.getTime() + (order.duration_min ?? 0) * 60_000)
  const hhmm = (d: Date) => d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const leftMin = Math.max(0, Math.round((eta.getTime() - Date.now()) / 60_000))
  const done = order.status === 'done'

  const steps = [
    { label: `Загрузка в ${from?.name}`, time: hhmm(start), state: 'done' as const },
    { label: 'В пути', time: hhmm(new Date(start.getTime() + 15 * 60_000)), state: done ? ('done' as const) : ('now' as const) },
    { label: `Прибытие в ${to?.name}`, time: hhmm(eta), state: done ? ('done' as const) : ('wait' as const) },
    { label: 'Выгрузка', time: done ? hhmm(eta) : '—', state: done ? ('done' as const) : ('wait' as const) },
  ]

  return (
    <div className="screen">
      <Header />
      <TitleBar title={done ? 'Груз доставлен' : 'Груз в пути'} sub={`Прибытие в ${to?.name} — ${hhmm(eta)}`} />

      <img src="/assets/ill-map-region.png" alt="" className="card h-[168px] w-full object-contain p-2" />

      <section className="card flex items-center gap-3.5 p-3.5">
        <img src="/assets/ill-clock-boxes.png" alt="" className="h-16 w-16 shrink-0 object-contain" />
        <div className="min-w-0 flex-1">
          <p className="text-muted text-[12px]">Ожидаемое прибытие</p>
          <p className="tnum text-[34px] leading-10 font-bold">{hhmm(eta)}</p>
          <p className="text-muted tnum text-[12px]">
            {done ? 'доставлено' : `осталось ${fmtDuration(leftMin)} · ${order.distance_km ?? '—'} км`}
          </p>
        </div>
      </section>

      <section className="card px-4 py-2">
        {steps.map((s) => (
          <div key={s.label} className="flex items-center gap-3 py-2.5">
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                s.state === 'done'
                  ? 'bg-green text-white'
                  : s.state === 'now'
                    ? 'border-green border-4 bg-white'
                    : 'border-line border-2 bg-white'
              }`}
            >
              {s.state === 'done' && <Icon name="check" size={10} strokeWidth={3} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-[14px] font-bold ${s.state === 'wait' ? 'text-muted' : ''}`}>{s.label}</p>
              {s.state === 'wait' && <Chip tone="yellow">Ожидается</Chip>}
            </div>
            <span className={`tnum text-[13px] ${s.state === 'wait' ? 'text-muted' : ''}`}>{s.time}</span>
          </div>
        ))}
      </section>

      <div className="flex gap-2.5">
        <a
          href={`tel:+77000000000`}
          className="card flex flex-1 items-center gap-2 px-3 py-3 text-[12.5px] font-medium"
        >
          <span className="bg-yellow flex h-7 w-7 items-center justify-center rounded-[9px]">
            <Icon name="phone" size={15} />
          </span>
          Позвонить {carrier?.name ?? 'водителю'}
        </a>
        <span className="card flex items-center gap-2 px-3 py-3 text-[12.5px] font-medium">
          <span className="bg-yellow flex h-7 w-7 items-center justify-center rounded-[9px]">
            <Icon name="chat" size={15} />
          </span>
          Чат
        </span>
      </div>

      {!done && (
        <Button
          onClick={async () => {
            await supabase.from('orders').update({ status: 'done' }).eq('id', order.id)
            nav('/orders')
          }}
        >
          Груз выгружен
        </Button>
      )}

      <p className="text-muted text-center text-[11px]">Цена сделки {money(order.price_final)}</p>

      <TabBar role="shipper" />
    </div>
  )
}

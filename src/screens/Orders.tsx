import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header, TabBar, Chip, money } from '../ui/Shell'
import { useOrders, usePoints } from '../lib/data'
import type { OrderStatus } from '../lib/types'

const STAGES: OrderStatus[] = ['searching', 'negotiating', 'assigned', 'in_transit']
const STAGE_LABEL = ['Поиск', 'Согласование', 'В пути', 'Завершён']

export default function Orders() {
  const nav = useNavigate()
  const orders = useOrders()
  const points = usePoints()
  const [tab, setTab] = useState<'active' | 'done'>('active')

  const list = orders.filter((o) =>
    tab === 'active' ? !['done', 'cancelled'].includes(o.status) : ['done', 'cancelled'].includes(o.status),
  )

  return (
    <div className="screen">
      <Header />
      <h1 className="text-[26px] font-bold">Мои заказы</h1>

      <div className="bg-line flex rounded-[18px] p-1">
        {(['active', 'done'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-[15px] py-2.5 text-[14px] ${
              tab === t ? 'bg-card font-bold shadow-[0_2px_8px_rgb(0_0_0/0.06)]' : 'text-muted'
            }`}
          >
            {t === 'active' ? 'Активные' : 'Завершённые'}
          </button>
        ))}
      </div>

      {list.length === 0 && <p className="text-muted px-1 text-[13px]">Здесь пока пусто.</p>}

      {list.map((o, i) => {
        const stage = Math.max(0, STAGES.indexOf(o.status as OrderStatus))
        const finished = o.status === 'done'
        const accent = o.status === 'in_transit' || finished ? 'bg-green' : 'bg-yellow'
        return (
          <section
            key={o.id}
            onClick={() => nav(o.status === 'in_transit' || finished ? `/track/${o.id}` : `/working/${o.id}`)}
            className="card rise p-3.5"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-center gap-3">
              <img
                src={i % 2 ? '/assets/ill-handcart.png' : '/assets/ill-pin-path.png'}
                alt=""
                className="h-[58px] w-[58px] shrink-0 object-contain"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[14.5px] font-bold">
                  <span className="truncate">{points.get(o.from_id ?? '')?.name}</span>
                  <span className="text-yellow-ink">→</span>
                  <span className="truncate">{points.get(o.to_id ?? '')?.name}</span>
                </div>
                <p className="text-muted truncate text-[11.5px]">
                  {o.weight_t} т {o.cargo}
                </p>
                <div className="mt-1">
                  <Chip tone={finished ? 'green' : 'yellow'}>
                    {finished ? 'Доставлен' : o.status === 'in_transit' ? 'В пути' : 'Ищем перевозчика'}
                  </Chip>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="tnum text-[14px] font-bold">
                  {o.price_final ? money(o.price_final) : o.price_min ? `${Math.round(o.price_min / 1000)}–${Math.round((o.price_max ?? 0) / 1000)} тыс` : '—'}
                </div>
                <div className="text-muted text-[10.5px]">{o.distance_km ? `${o.distance_km} км` : ''}</div>
              </div>
            </div>

            <div className="mt-3 flex items-center px-3">
              {[0, 1, 2, 3].map((s) => (
                <div key={s} className="flex flex-1 items-center last:flex-none">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      s < stage ? accent : s === stage ? `${accent} ring-2 ring-white` : 'bg-line'
                    }`}
                  />
                  {s < 3 && <span className={`h-0.5 flex-1 ${s < stage ? accent : 'bg-line'}`} />}
                </div>
              ))}
            </div>
            <div className="text-muted mt-1.5 flex justify-between text-[9.5px]">
              {STAGE_LABEL.map((l, s) => (
                <span key={l} className={s <= stage ? 'text-ink font-medium' : ''}>
                  {l}
                </span>
              ))}
            </div>
          </section>
        )
      })}

      <TabBar role="shipper" />
    </div>
  )
}

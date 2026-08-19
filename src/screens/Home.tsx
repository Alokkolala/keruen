import { Link, useNavigate } from 'react-router-dom'
import { Header, TabBar, Chip, CardSkeleton, Empty, Num, money } from '../ui/Shell'
import { Icon } from '../ui/Icon'
import { useOrders, usePoints } from '../lib/data'
import type { Order } from '../lib/types'

const STATUS: Record<string, { label: string; tone: 'yellow' | 'green' | 'plain' | 'alert' }> = {
  draft: { label: 'Черновик', tone: 'plain' },
  searching: { label: 'Ищем', tone: 'yellow' },
  negotiating: { label: 'Согласовываем', tone: 'yellow' },
  assigned: { label: 'Водитель найден', tone: 'green' },
  in_transit: { label: 'В пути', tone: 'green' },
  done: { label: 'Доставлен', tone: 'green' },
  cancelled: { label: 'Отменён', tone: 'plain' },
}

const NEXT_ROUTE: Record<string, (o: Order) => string> = {
  draft: (o) => `/working/${o.id}`,
  searching: (o) => `/working/${o.id}`,
  negotiating: (o) => `/working/${o.id}`,
  assigned: (o) => `/result/${o.id}`,
  in_transit: (o) => `/track/${o.id}`,
  done: (o) => `/track/${o.id}`,
}

export default function Home() {
  const nav = useNavigate()
  const { orders, loading } = useOrders()
  const points = usePoints()
  const active = orders.filter((o) => !['done', 'cancelled'].includes(o.status)).slice(0, 4)
  const savedKm = orders.reduce((s, o) => s + (o.empty_km ?? 0), 0)

  return (
    <div className="screen">
      <Header />

      <section className="card flex items-center gap-3 p-5">
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] leading-[27px] font-bold">
            Отправляйте
            <br />
            груз без лишних
            <br />
            хлопот
          </h1>
          <p className="text-muted mt-3 text-[12.5px] leading-[18px]">
            Опишите задачу — агент найдёт перевозчика, рассчитает цену и запустит поиск.
          </p>
          <button
            onClick={() => nav('/new', { viewTransition: true })}
            className="bg-yellow text-ink mt-4 flex items-center gap-2.5 rounded-full px-[18px] py-3.5 text-[14.5px] font-bold shadow-[0_4px_10px_rgb(0_0_0/0.16)] transition-transform active:scale-[0.97]"
          >
            <Icon name="cube" size={16} />
            Создать заказ
          </button>
        </div>
        <img
          src="/assets/ill-truck-boxes.png"
          alt=""
          className="h-[176px] w-[136px] shrink-0 object-contain"
        />
      </section>

      <div className="flex items-center gap-2.5">
        <Icon name="cube" size={20} className="text-yellow-ink shrink-0" />
        <h2 className="min-w-0 flex-1 truncate text-[17px] font-bold">Активные заказы</h2>
        <Link
          to="/orders"
          viewTransition
          className="bg-card flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[12.5px] font-medium"
        >
          Смотреть все
          <Icon name="next" size={12} />
        </Link>
      </div>

      {loading && <CardSkeleton rows={2} />}

      {!loading && active.length === 0 && (
        <Empty
          art="/assets/ill-pin-path.png"
          title="Пока ни одного заказа"
          hint="Нажмите «Создать заказ» и просто скажите, что нужно везти — остальное посчитает агент."
        />
      )}

      {active.map((o, i) => {
        const st = STATUS[o.status] ?? STATUS.draft
        return (
          <button
            key={o.id}
            onClick={() => nav(NEXT_ROUTE[o.status]?.(o) ?? `/working/${o.id}`, { viewTransition: true })}
            className="card rise flex items-center gap-3 p-3.5 text-left transition-transform active:scale-[0.99]"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <img
              src={i % 2 ? '/assets/ill-handcart.png' : '/assets/ill-pin-path.png'}
              alt=""
              className="h-[58px] w-[58px] shrink-0 object-contain"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[14.5px] font-bold">
                <span className="truncate">{points.get(o.from_id ?? '')?.name ?? '—'}</span>
                <span className="text-yellow-ink shrink-0">→</span>
                <span className="truncate">{points.get(o.to_id ?? '')?.name ?? '—'}</span>
              </div>
              <p className="text-muted mt-0.5 truncate text-[11.5px]">
                {o.weight_t ? `${o.weight_t} т ` : ''}
                {o.cargo ?? ''}
              </p>
              <div className="mt-1.5">
                <Chip tone={st.tone}>{st.label}</Chip>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="tnum text-[14px] font-bold">
                {o.price_final
                  ? money(o.price_final)
                  : o.price_min
                    ? `${Math.round(o.price_min / 1000)}–${Math.round((o.price_max ?? 0) / 1000)} тыс ₸`
                    : '—'}
              </div>
              <div className="text-muted text-[10.5px]">
                {o.distance_km ? `${o.distance_km} км` : 'считаем…'}
              </div>
            </div>
          </button>
        )
      })}

      {savedKm > 0 && (
        <section className="bg-chip-g rise flex items-center gap-2.5 rounded-[18px] p-3.5">
          <Icon name="leaf" size={16} className="text-green-ink shrink-0" />
          <Num value={savedKm} className="text-green-ink text-[15px] font-bold" />
          <span className="text-green-ink text-[12px]">км порожних убрано</span>
        </section>
      )}

      <TabBar role="shipper" />
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Header, TabBar, TitleBar, Chip, Button, Failed, CardSkeleton, Num, money } from '../ui/Shell'
import { Icon } from '../ui/Icon'
import { api, useCarriers, useOffers, useOrder, usePoints, fmtDuration } from '../lib/data'
import { supabase } from '../lib/supabase'

export default function Working() {
  const { id } = useParams()
  const nav = useNavigate()
  const order = useOrder(id)
  const points = usePoints()
  const carriers = useCarriers()
  const offers = useOffers().filter((o) => o.order_id === id)
  const [retrying, setRetrying] = useState(false)

  // Перевозчик принял на своём телефоне — отправителя уносит на результат.
  useEffect(() => {
    if (order?.status === 'assigned') nav(`/result/${order.id}`, { replace: true, viewTransition: true })
  }, [order?.status, order?.id, nav])

  const retry = useCallback(async () => {
    if (!id) return
    setRetrying(true)
    try {
      await api('agent', { orderId: id })
    } catch {
      /* причина уже в логе заказа — экран покажет её сам */
    } finally {
      setRetrying(false)
    }
  }, [id])

  if (order === undefined)
    return (
      <div className="screen">
        <Header />
        <span className="skeleton h-6 w-40" />
        <CardSkeleton rows={2} />
        <TabBar role="shipper" />
      </div>
    )

  if (order === null)
    return (
      <div className="screen">
        <Header />
        <TitleBar title="Заказ не найден" />
        <Failed title="Такого заказа нет" detail="Возможно, его отменили или сбросили демо-данные" />
        <Button onClick={() => nav('/')}>На главную</Button>
        <TabBar role="shipper" />
      </div>
    )

  const from = points.get(order.from_id ?? '')
  const to = points.get(order.to_id ?? '')
  const log = order.agent_log ?? []
  const working = order.status === 'searching' || retrying
  // Агент кладёт причину остановки последней строкой со state:'wait' и
  // возвращает заказ в draft. Раньше это выглядело как вечный спиннер.
  const broke = log.length > 0 && log[log.length - 1].state === 'wait' && order.status === 'draft'

  async function cancel() {
    await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order!.id)
    nav('/')
  }

  return (
    <div className="screen">
      <Header />
      <TitleBar
        title={broke ? 'Поиск остановился' : 'Ищем машину'}
        sub={`${from?.name ?? '—'} → ${to?.name ?? '—'} · ${order.weight_t ?? '?'} т`}
      />

      <section className="card flex items-center gap-3 p-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[15px] font-bold">
            <span className="truncate">{from?.name}</span>
            <span className="text-yellow-ink">→</span>
            <span className="truncate">{to?.name}</span>
          </div>
          <p className="text-muted mt-1 truncate text-[11.5px]">
            {order.cargo} · {order.weight_t} т
            {order.from_address ? ` · ${order.from_address}` : ''}
          </p>
          <p className="mt-1 text-[12.5px]">
            {order.distance_km ? (
              <>
                <Num value={order.distance_km} fmt={(v) => v.toFixed(1)} /> км ·{' '}
                {fmtDuration(order.duration_min)}
              </>
            ) : (
              <span className="text-muted">считаю маршрут…</span>
            )}
          </p>
        </div>
        <img src="/assets/scene-road-truck.png" alt="" className="h-[76px] w-[110px] object-contain" />
      </section>

      <section className="card p-3.5">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="flex-1 text-[16px] font-bold">Агент работает</h2>
          <Chip
            tone={broke ? 'alert' : working ? 'yellow' : 'green'}
            icon={broke ? 'info' : working ? undefined : 'check'}
          >
            {broke ? 'Прервался' : working ? 'В процессе' : 'Готово'}
          </Chip>
        </div>

        <ol>
          {log.map((s, i) => {
            const bad = s.state === 'wait'
            return (
              <li
                key={i}
                className="rise border-line flex items-start gap-3 border-b py-2.5 last:border-0"
                style={{ animationDelay: `${Math.min(i, 6) * 70}ms` }}
              >
                <span
                  className={`pop mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white ${
                    bad ? 'bg-alert' : 'bg-green'
                  }`}
                  style={{ animationDelay: `${Math.min(i, 6) * 70 + 120}ms` }}
                >
                  <Icon name={bad ? 'info' : 'check'} size={10} strokeWidth={3} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-[13px] leading-tight font-medium ${bad ? 'text-alert' : ''}`}>
                    {s.text}
                  </p>
                  {s.detail && (
                    <p className="text-muted mt-0.5 text-[11px] leading-tight break-words">{s.detail}</p>
                  )}
                </div>
                <span className="tnum text-muted shrink-0 text-[10.5px]">{s.at}</span>
              </li>
            )
          })}

          {working && (
            <li className="flex items-center gap-3 py-2.5">
              <span className="border-yellow-ink h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-t-transparent" />
              <span className="text-muted breathe text-[13px]">
                {log.length === 0
                  ? 'Разбираю заявку…'
                  : log.length < 3
                    ? 'Считаю маршрут и погоду…'
                    : 'Подбираю машины…'}
              </span>
            </li>
          )}
        </ol>

        {order.weather && !broke && (
          <div className="bg-chip-y mt-2 flex items-center gap-2 rounded-[12px] p-2.5">
            <Icon name="weather" size={16} className="text-yellow-ink shrink-0" />
            <span className="text-[11.5px]">
              Учитываю погоду {order.weather.temp_c} °C, {order.weather.description}, топливо и
              обратный груз
            </span>
          </div>
        )}
      </section>

      {broke && (
        <Failed
          title={log[log.length - 1].text}
          detail={log[log.length - 1].detail}
          onRetry={retrying ? undefined : retry}
        />
      )}

      {offers.length > 0 && (
        <section className="card p-3.5">
          <h2 className="mb-1 text-[15px] font-bold">Предложения отправлены</h2>
          <p className="text-muted mb-2 text-[11.5px]">
            Ждём ответ. Перевозчик примет на своём телефоне — экран обновится сам.
          </p>
          {offers.map((o, i) => {
            const c = carriers.find((x) => x.id === o.carrier_id)
            return (
              <div
                key={o.id}
                className="rise border-line flex items-center gap-3 border-b py-2.5 last:border-0"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <span className="bg-chip-y flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold">
                  {(c?.name ?? '??').slice(0, 2)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">{c?.name ?? 'Перевозчик'}</p>
                  <p className="text-muted truncate text-[11px]">
                    {c?.vehicle} · {c?.body}
                  </p>
                </div>
                <div className="text-right">
                  <div className="tnum text-[13.5px] font-bold">{money(o.price)}</div>
                  <div className="text-muted text-[10.5px]">
                    {o.status === 'sent'
                      ? 'отправлено'
                      : o.status === 'countered'
                        ? `просит ${money(o.counter)}`
                        : o.status}
                  </div>
                </div>
              </div>
            )
          })}
        </section>
      )}

      <Button variant="ghost" onClick={cancel}>
        Отменить поиск
      </Button>

      <TabBar role="shipper" />
    </div>
  )
}

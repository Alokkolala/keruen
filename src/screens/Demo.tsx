import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, ButtonRow, Header, TitleBar, money } from '../ui/Shell'
import { Icon } from '../ui/Icon'
import { api, useCarriers, useOffers, useOrders, usePoints, wipeOrders } from '../lib/data'

/**
 * Служебный экран для показа. В таббаре его нет намеренно: жюри по нему не
 * ходит, а перед выступлением одним движением возвращает чистое состояние.
 */
export default function Demo() {
  const nav = useNavigate()
  const { orders } = useOrders()
  const offers = useOffers()
  const carriers = useCarriers()
  const points = usePoints()
  const [busy, setBusy] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)

  const run = async (what: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(what)
    setSaid(null)
    try {
      await fn()
      setSaid(done)
    } catch (e) {
      setSaid(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const live = offers.filter((o) => o.status === 'sent' || o.status === 'countered')
  const savedKm = orders.reduce((s, o) => s + (o.empty_km ?? 0), 0)

  return (
    <div className="screen">
      <Header />
      <TitleBar title="Демо" sub="Служебный экран — в навигации его нет" />

      <section className="card p-3.5">
        <h2 className="mb-2 text-[15px] font-bold">Что сейчас в базе</h2>
        <dl className="space-y-1.5 text-[13px]">
          {[
            ['Заказов', String(orders.length)],
            ['Живых предложений', String(live.length)],
            ['Перевозчиков', String(carriers.length)],
            ['Точек на карте', String(points.size)],
            ['Порожних убрано', savedKm ? `${Math.round(savedKm)} км` : '—'],
            [
              'Заработано',
              money(orders.reduce((s, o) => s + (o.price_final ?? 0), 0)),
            ],
          ].map(([k, v]) => (
            <div key={k} className="border-line flex gap-2 border-b py-1 last:border-0">
              <dt className="text-muted flex-1">{k}</dt>
              <dd className="tnum font-bold">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card p-3.5">
        <h2 className="text-[15px] font-bold">Собрать сцену заново</h2>
        <p className="text-muted mt-1 mb-3 text-[12px] leading-[17px]">
          Сотрёт все заказы и предложения, засеет три открытые заявки и доведёт одну до
          предложений — чтобы на экране перевозчика было что показать.
        </p>
        <Button
          disabled={!!busy}
          onClick={() =>
            run(
              'seed',
              async () => {
                await wipeOrders()
                await api('seed', {})
                const { id } = await api<{ id: string }>('demo-order', {})
                await api('agent', { orderId: id })
              },
              'Готово — открывай экран перевозчика',
            )
          }
        >
          {busy === 'seed' ? 'Собираю…' : 'Собрать демо'}
        </Button>
      </section>

      <section className="card p-3.5">
        <h2 className="text-[15px] font-bold">Только очистить</h2>
        <p className="text-muted mt-1 mb-3 text-[12px] leading-[17px]">
          Уберёт все заказы и предложения. Перевозчики и точки на карте останутся —
          это справочники, а не данные показа.
        </p>
        <Button
          variant="ghost"
          disabled={!!busy}
          className="text-alert"
          onClick={() => run('wipe', wipeOrders, 'База пуста')}
        >
          {busy === 'wipe' ? 'Чищу…' : 'Удалить все заказы'}
        </Button>
      </section>

      {said && (
        <p className="pop bg-chip-g text-green-ink rounded-[14px] p-3 text-center text-[12.5px]">
          {said}
        </p>
      )}

      <ButtonRow>
        <Button variant="ghost" onClick={() => nav('/orders', { viewTransition: true })}>
          <span className="flex items-center justify-center gap-1.5">
            <Icon name="clipboard" size={15} /> Заказы
          </span>
        </Button>
        <Button variant="ghost" onClick={() => nav('/carrier', { viewTransition: true })}>
          <span className="flex items-center justify-center gap-1.5">
            <Icon name="truck" size={15} /> Перевозчик
          </span>
        </Button>
      </ButtonRow>
    </div>
  )
}

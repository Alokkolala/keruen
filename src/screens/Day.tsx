import { useNavigate } from 'react-router-dom'
import { Header, TabBar, Chip, CardSkeleton, Empty, Num, money } from '../ui/Shell'
import { Icon } from '../ui/Icon'
import { useDeadhead, useMe, useOrders, usePoints } from '../lib/data'
import type { Order } from '../lib/types'

// keruen: калибровочные. Разгрузка — тот же буфер, что в api/chain.ts.
// Скорость нужна только чтобы оценить порожний перегон между плечами:
// OSRM даёт километры, а времени по ним мы отдельно не спрашиваем.
const UNLOAD_MIN = 30
const AVG_KMH = 70

/**
 * Выстраивает рейсы в порядке движения: от базы машины идём по цепочке,
 * где выгрузка одного плеча совпадает с погрузкой следующего. Что не
 * состыковалось — дописываем по времени создания, чтобы ничего не потерять.
 */
function chainByRoute(list: Order[], baseId: string | null): Order[] {
  const left = [...list].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
  const out: Order[] = []
  let at = baseId

  while (left.length) {
    // Сначала плечо, которое начинается там, где машина стоит сейчас.
    let i = at ? left.findIndex((o) => o.from_id === at) : -1
    // Стыковки нет — начинаем новую нитку с самого раннего оставшегося.
    if (i < 0) i = 0
    const [next] = left.splice(i, 1)
    out.push(next)
    at = next.to_id
  }
  return out
}

export default function Day() {
  const nav = useNavigate()
  const { orders, loading } = useOrders()
  const points = usePoints()
  const me = useMe()

  // Мой день — это мои рейсы. Без фильтра по машине сюда попадали заказы,
  // которые взял кто-то другой, и доход считался чужой.
  const mine = orders
    .filter((o) => ['assigned', 'in_transit', 'done'].includes(o.status))
    .filter((o) => !me || o.carrier_id === me.id)

  // Порядок плеч — по маршруту, а не по времени создания записи. Заявка,
  // которую агент подцепил в цепочку, лежит в базе с более раннего момента,
  // чем свежий заказ отправителя, и сортировка по created_at показывала
  // день задом наперёд: сначала обратное плечо, потом первое.
  const plan = chainByRoute(mine, me?.base_id ?? null)

  const income = plan.reduce((s, o) => s + (o.price_final ?? 0), 0)
  const savedKm = plan.reduce((s, o) => s + (o.empty_km ?? 0), 0)

  // Порожние между плечами: от выгрузки предыдущего рейса до погрузки следующего.
  // Раньше тут стояли 8 и 12 км «на глаз» — теперь настоящий OSRM.
  const pairs = plan
    .slice(1)
    .map((o, i) => [plan[i].to_id ?? '', o.from_id ?? ''] as [string, string])
  const deadhead = useDeadhead(pairs)
  const known = deadhead.filter((k): k is number => k != null)
  const emptyBetween = known.reduce((s, k) => s + k, 0)
  const pending = deadhead.length < pairs.length

  // Время выезда каждого плеча. У выехавшего рейса оно настоящее (started_at),
  // дальше складываем реальные длительности OSRM, порожний перегон и разгрузку.
  // Раньше тут стоял created_at строки в базе — у подцепленной агентом заявки
  // это момент, когда её кто-то завёл, к плану дня отношения не имеющий.
  const starts = plan.reduce<(Date | null)[]>((acc, o, i) => {
    if (o.started_at) return [...acc, new Date(o.started_at)]
    const prev = acc[i - 1]
    const prevOrder = plan[i - 1]
    if (!prev || !prevOrder) return [...acc, new Date()]
    const drive = (Number(prevOrder.duration_min) || 0) * 60_000
    const empty = ((deadhead[i - 1] ?? 0) / AVG_KMH) * 3_600_000
    return [...acc, new Date(prev.getTime() + drive + empty + UNLOAD_MIN * 60_000)]
  }, [])

  return (
    <div className="screen">
      <Header />
      <h1 className="text-[22px] font-bold">Мой день</h1>

      <section className="card flex items-start gap-2 p-3.5">
        <div className="min-w-0 flex-1">
          <Num value={income} fmt={money} className="block text-[27px] leading-[31px] font-bold" />
          <p className="text-muted text-[12px]">Сегодняшний доход</p>
          <div className="mt-2 flex gap-5">
            <div>
              <p className="tnum text-[18px] font-bold">{plan.length}</p>
              <p className="text-muted text-[10.5px]">
                {plan.length === 1 ? 'рейс' : plan.length < 5 ? 'рейса' : 'рейсов'}
              </p>
            </div>
            <div>
              {pending && pairs.length > 0 ? (
                <span className="skeleton mt-1 block h-4 w-10" />
              ) : (
                <Num value={emptyBetween} className="block text-[18px] font-bold" />
              )}
              <p className="text-muted text-[10.5px]">км порожних</p>
            </div>
          </div>
          {savedKm > 0 && (
            <div className="bg-chip-g mt-2.5 flex items-center gap-2 rounded-[12px] p-2.5">
              <Icon name="leaf" size={14} className="text-green-ink shrink-0" />
              <span className="text-green-ink text-[11px] leading-[15px]">
                KERUEN убрал <Num value={savedKm} className="font-bold" /> км пустого пробега
              </span>
            </div>
          )}
        </div>
        <img
          src="/assets/scene-road-truck.png"
          alt=""
          className="h-[124px] w-[112px] shrink-0 object-contain"
        />
      </section>

      <h2 className="text-[16px] font-bold">План на день</h2>

      {loading && <CardSkeleton rows={2} />}

      {!loading && plan.length === 0 && (
        <Empty
          art="/assets/ill-route-done.png"
          title="День ещё не начат"
          hint="Возьмите заказ на главной — он встанет сюда, а следующее плечо агент подберёт ещё до выгрузки."
        />
      )}

      {plan.map((o, i) => (
        <div key={o.id}>
          {i > 0 && (
            <div className="my-1.5 flex flex-col items-center">
              {/* перемычка прорисовывается сверху вниз, вслед за карточкой */}
              <span
                className="bg-line draw-down h-3 w-0.5"
                style={{ animationDelay: `${i * 90}ms` }}
              />
              <span
                className="bg-bg border-line text-muted rise inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium"
                style={{ animationDelay: `${i * 90 + 100}ms` }}
              >
                <Icon name="road" size={11} />
                {deadhead[i - 1] == null
                  ? pending
                    ? 'считаю порожние…'
                    : 'порожние не посчитали'
                  : deadhead[i - 1] === 0
                    ? 'без порожних — машина уже там'
                    : `${deadhead[i - 1]} км без груза`}
              </span>
              <span
                className="bg-line draw-down h-3 w-0.5"
                style={{ animationDelay: `${i * 90 + 160}ms` }}
              />
            </div>
          )}
          <button
            onClick={() => nav(`/track/${o.id}`, { viewTransition: true })}
            className="card rise flex w-full items-center gap-2.5 p-3 text-left transition-transform active:scale-[0.99]"
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <span className="bg-yellow text-ink flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-muted text-[10.5px]">
                {starts[i]
                  ? `${o.started_at ? '' : '≈ '}${starts[i]!.toLocaleTimeString('ru-RU', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}`
                  : '—'}
              </p>
              <div className="flex items-center gap-1.5 text-[14px] font-bold">
                <span className="truncate">{points.get(o.from_id ?? '')?.name}</span>
                <span className="text-yellow-ink shrink-0">→</span>
                <span className="truncate">{points.get(o.to_id ?? '')?.name}</span>
              </div>
              <p className="text-muted truncate text-[10.5px]">
                {o.cargo} · {o.weight_t} т
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="tnum text-[13.5px] font-bold">+{money(o.price_final)}</p>
              <div className="mt-1">
                <Chip tone="green" icon="check">
                  {o.status === 'done' ? 'Доставлен' : o.status === 'in_transit' ? 'В пути' : 'Принят'}
                </Chip>
              </div>
            </div>
            <Icon name="next" size={14} className="text-muted shrink-0" />
          </button>
        </div>
      ))}

      <TabBar role="carrier" />
    </div>
  )
}

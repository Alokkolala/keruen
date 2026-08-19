import { Header, TabBar, Chip, CardSkeleton, Empty, Num, money } from '../ui/Shell'
import { Icon } from '../ui/Icon'
import { useDeadhead, useOrders, usePoints } from '../lib/data'

export default function Day() {
  const { orders, loading } = useOrders()
  const points = usePoints()

  const plan = orders
    .filter((o) => ['assigned', 'in_transit', 'done'].includes(o.status))
    .slice()
    .reverse()

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
          <section
            className="card rise flex items-center gap-2.5 p-3"
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <span className="bg-yellow text-ink flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-muted text-[10.5px]">
                {new Date(o.started_at ?? o.created_at).toLocaleTimeString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
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
          </section>
        </div>
      ))}

      <TabBar role="carrier" />
    </div>
  )
}

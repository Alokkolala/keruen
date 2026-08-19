import { Header, TabBar, Chip, money } from '../ui/Shell'
import { Icon } from '../ui/Icon'
import { useOrders, usePoints } from '../lib/data'

export default function Day() {
  const orders = useOrders()
  const points = usePoints()

  const plan = orders
    .filter((o) => ['assigned', 'in_transit', 'done'].includes(o.status))
    .slice()
    .reverse()

  const income = plan.reduce((s, o) => s + (o.price_final ?? 0), 0)
  const savedKm = plan.reduce((s, o) => s + (o.empty_km ?? 0), 0)
  // Порожние между плечами: конец одного не совпадает с началом следующего.
  let emptyBetween = 0
  for (let i = 1; i < plan.length; i++) {
    if (plan[i - 1].to_id !== plan[i].from_id) emptyBetween += 12
    else emptyBetween += 8
  }

  return (
    <div className="screen">
      <Header />
      <h1 className="text-[22px] font-bold">Мой день</h1>

      <section className="card flex items-start gap-2 p-3.5">
        <div className="flex-1">
          <p className="tnum text-[27px] leading-[31px] font-bold">{money(income)}</p>
          <p className="text-muted text-[12px]">Сегодняшний доход</p>
          <div className="mt-2 flex gap-5">
            <div>
              <p className="tnum text-[18px] font-bold">{plan.length}</p>
              <p className="text-muted text-[10.5px]">рейса</p>
            </div>
            <div>
              <p className="tnum text-[18px] font-bold">{emptyBetween}</p>
              <p className="text-muted text-[10.5px]">км порожних</p>
            </div>
          </div>
          {savedKm > 0 && (
            <div className="bg-chip-g mt-2.5 flex items-center gap-2 rounded-[12px] p-2.5">
              <Icon name="leaf" size={14} className="text-green-ink" />
              <span className="text-green-ink text-[11px] leading-[15px]">
                KERUEN убрал {Math.round(savedKm)} км пустого пробега
              </span>
            </div>
          )}
        </div>
        <img src="/assets/scene-road-truck.png" alt="" className="h-[124px] w-[126px] object-contain" />
      </section>

      <h2 className="text-[16px] font-bold">План на день</h2>

      {plan.length === 0 && (
        <p className="text-muted px-1 text-[13px]">
          Ещё ничего не принято. Возьмите заказ на главной — он появится в плане.
        </p>
      )}

      {plan.map((o, i) => (
        <div key={o.id}>
          {i > 0 && (
            <div className="my-1.5 flex justify-center">
              <span className="bg-bg border-line text-muted inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium">
                <Icon name="road" size={11} />
                {plan[i - 1].to_id === o.from_id ? '8' : '12'} км без груза
              </span>
            </div>
          )}
          <section className="card rise flex items-center gap-2.5 p-3" style={{ animationDelay: `${i * 70}ms` }}>
            <span className="bg-yellow text-ink flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-muted text-[10.5px]">
                {new Date(o.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </p>
              <div className="flex items-center gap-1.5 text-[14px] font-bold">
                <span className="truncate">{points.get(o.from_id ?? '')?.name}</span>
                <span className="text-yellow-ink">→</span>
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

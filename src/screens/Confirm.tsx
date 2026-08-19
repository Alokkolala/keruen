import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header, TabBar, TitleBar, Button, ButtonRow, Failed } from '../ui/Shell'
import { Icon, type IconName } from '../ui/Icon'
import { DeadlinePicker, PointPicker, humanDate } from '../ui/Pickers'
import { api, usePoints } from '../lib/data'
import { supabase } from '../lib/supabase'

interface Draft {
  cargo: string | null
  weight_t: number | null
  from_id: string | null
  to_id: string | null
  from_address: string | null
  to_address: string | null
  loaders: number
  deadline_hint: string | null
  deadline: string | null
  raw_text: string
}

export default function Confirm() {
  const nav = useNavigate()
  const points = usePoints()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState<'from' | 'to' | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('keruen:draft')
    if (!raw) return void nav('/new', { replace: true })
    setDraft(JSON.parse(raw))
  }, [nav])

  if (!draft) return null
  const list = [...points.values()]

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch })

  /** Адрес живёт на отдельном экране с картой — черновик едет через sessionStorage. */
  function toAddress(end: 'from' | 'to') {
    sessionStorage.setItem('keruen:draft', JSON.stringify(draft))
    nav(`/address/${end}`, { viewTransition: true })
  }

  async function start() {
    if (!draft || busy) return
    if (!draft.from_id || !draft.to_id) {
      setError('Укажите откуда и куда — агент не сможет посчитать маршрут')
      return
    }
    if (draft.from_id === draft.to_id) {
      setError('Погрузка и выгрузка в одной точке — маршрута не будет')
      return
    }
    if (!draft.weight_t || draft.weight_t <= 0) {
      setError('Укажите вес в тоннах — от него считается класс машины и цена')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { data, error: dbError } = await supabase
        .from('orders')
        .insert({
          raw_text: draft.raw_text,
          cargo: draft.cargo,
          weight_t: draft.weight_t,
          from_id: draft.from_id,
          to_id: draft.to_id,
          from_address: draft.from_address,
          to_address: draft.to_address,
          loaders: draft.loaders ?? 0,
          // Срок теперь настоящая дата, а не фраза — агент её видит.
          deadline: draft.deadline ? `${draft.deadline}T18:00:00` : null,
          status: 'draft',
        })
        .select()
        .single()
      if (dbError) throw dbError

      sessionStorage.removeItem('keruen:draft')
      nav(`/working/${data.id}`, { viewTransition: true })
      // Агент работает в фоне и пишет лог прямо в базу — экран его слушает.
      api('agent', { orderId: data.id }).catch(() => {})
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const Row = ({
    icon,
    label,
    children,
  }: {
    icon: IconName
    label: string
    children: React.ReactNode
  }) => (
    <div className="border-line flex items-center gap-3 border-b py-2.5 last:border-0">
      <span className="bg-chip-y flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
        <Icon name={icon} size={15} />
      </span>
      <span className="w-[76px] shrink-0 text-[13px] font-bold">{label}</span>
      <div className="min-w-0 flex-1 text-right text-[13.5px]">{children}</div>
    </div>
  )

  const input = 'w-full bg-transparent text-right outline-none'

  /** Строка точки: тап открывает поиск, вторая строка — адрес с картой. */
  const PlaceRow = ({ end }: { end: 'from' | 'to' }) => {
    const id = end === 'from' ? draft.from_id : draft.to_id
    const addr = end === 'from' ? draft.from_address : draft.to_address
    return (
      <Row icon={end === 'from' ? 'pin' : 'flag'} label={end === 'from' ? 'Откуда' : 'Куда'}>
        <button
          onClick={() => setPicking(end)}
          className="flex w-full items-center justify-end gap-1.5"
        >
          {/* Точка распознана, но справочник ещё грузится — не пишем «выбрать»,
              иначе выглядит так, будто агент ничего не понял. */}
          {id && !points.size ? (
            <span className="skeleton h-3.5 w-20" />
          ) : (
            <span className={`truncate ${id ? 'font-medium' : 'text-muted'}`}>
              {points.get(id ?? '')?.name ?? 'выбрать'}
            </span>
          )}
          <Icon name="next" size={12} className="text-muted shrink-0" />
        </button>
        <button
          onClick={() => id && toAddress(end)}
          disabled={!id}
          className="text-muted mt-0.5 flex w-full items-center justify-end gap-1 text-[11px] disabled:opacity-40"
        >
          <Icon name="pin" size={10} className="shrink-0" />
          <span className="truncate">{addr || 'уточнить адрес на карте'}</span>
        </button>
      </Row>
    )
  }

  return (
    <div className="screen">
      <Header />
      <TitleBar title="Проверяем заявку" sub="Вот что агент понял из вашего запроса" />

      <section className="card p-3.5">
        <div className="mb-3 flex items-center gap-2">
          <Icon name="sparkle" size={16} className="text-yellow-ink" />
          <h2 className="text-[16px] font-bold">Поняли так</h2>
        </div>

        <div className="bg-bg rounded-[16px] px-3 py-1">
          <Row icon="cube" label="Груз">
            <input
              className={input}
              value={draft.cargo ?? ''}
              placeholder="что везём"
              onChange={(e) => set({ cargo: e.target.value })}
            />
          </Row>
          <Row icon="weight" label="Вес">
            <div className="flex items-center justify-end gap-1">
              <input
                className="w-16 bg-transparent text-right outline-none"
                inputMode="decimal"
                value={draft.weight_t ?? ''}
                placeholder="0"
                onChange={(e) =>
                  set({
                    weight_t: Number(e.target.value.replace(',', '.')) || null,
                  })
                }
              />
              <span className="text-muted">т</span>
            </div>
          </Row>
          <PlaceRow end="from" />
          <PlaceRow end="to" />
          <Row icon="clock" label="Срок">
            <DeadlinePicker value={draft.deadline} onChange={(v) => set({ deadline: v })} />
            <p className="text-muted mt-1 text-[10.5px]">
              {draft.deadline_hint && !draft.deadline
                ? `сказано «${draft.deadline_hint}» — уточните`
                : humanDate(draft.deadline)}
            </p>
          </Row>
          <Row icon="comment" label="Грузчики">
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => set({ loaders: Math.max(0, (draft.loaders ?? 0) - 1) })}
                className="bg-card flex h-8 w-8 items-center justify-center rounded-full"
                aria-label="Меньше"
              >
                <Icon name="minus" size={13} />
              </button>
              <span className="tnum w-5 text-center font-bold">{draft.loaders ?? 0}</span>
              <button
                onClick={() => set({ loaders: (draft.loaders ?? 0) + 1 })}
                className="bg-card flex h-8 w-8 items-center justify-center rounded-full"
                aria-label="Больше"
              >
                <Icon name="plus" size={13} />
              </button>
            </div>
          </Row>
        </div>

        <div className="bg-chip-y mt-3 flex items-center gap-2.5 rounded-[14px] p-3">
          <Icon name="info" size={18} className="text-yellow-ink shrink-0" />
          <p className="text-[12px]">Можно поправить любое поле — агент пересчитает</p>
        </div>

        {error && (
          <div className="mt-2">
            <Failed title="Не запускается" detail={error} />
          </div>
        )}

        <div className="mt-3">
          <ButtonRow>
            <Button variant="ghost" onClick={() => nav('/new')}>
              Исправить
            </Button>
            <Button onClick={start} disabled={busy}>
              {busy ? 'Запускаю…' : 'Всё верно'}
            </Button>
          </ButtonRow>
        </div>
      </section>

      <PointPicker
        open={picking !== null}
        title={picking === 'to' ? 'Куда везём' : 'Откуда забираем'}
        points={list}
        value={picking === 'to' ? draft.to_id : draft.from_id}
        onPick={(id) => set(picking === 'to' ? { to_id: id } : { from_id: id })}
        onClose={() => setPicking(null)}
      />

      <TabBar role="shipper" />
    </div>
  )
}

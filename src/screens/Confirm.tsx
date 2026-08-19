import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header, TabBar, TitleBar, Button } from '../ui/Shell'
import { Icon, type IconName } from '../ui/Icon'
import { api, usePoints } from '../lib/data'
import { supabase } from '../lib/supabase'

interface Draft {
  cargo: string | null
  weight_t: number | null
  from_id: string | null
  to_id: string | null
  loaders: number
  deadline_hint: string | null
  raw_text: string
}

export default function Confirm() {
  const nav = useNavigate()
  const points = usePoints()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('keruen:draft')
    if (!raw) return void nav('/new', { replace: true })
    setDraft(JSON.parse(raw))
  }, [nav])

  if (!draft) return null
  const list = [...points.values()]

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch })

  async function start() {
    if (!draft || busy) return
    if (!draft.from_id || !draft.to_id) {
      setError('Укажите откуда и куда — агент не сможет посчитать маршрут')
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
          loaders: draft.loaders ?? 0,
          status: 'draft',
        })
        .select()
        .single()
      if (dbError) throw dbError

      sessionStorage.removeItem('keruen:draft')
      nav(`/working/${data.id}`)
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
      <span className="w-[92px] shrink-0 text-[13px] font-bold">{label}</span>
      <div className="min-w-0 flex-1 text-right text-[13.5px]">{children}</div>
    </div>
  )

  const input = 'w-full bg-transparent text-right outline-none'

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
            <input className={input} value={draft.cargo ?? ''} onChange={(e) => set({ cargo: e.target.value })} />
          </Row>
          <Row icon="weight" label="Вес">
            <input
              className={input}
              inputMode="decimal"
              value={draft.weight_t ?? ''}
              onChange={(e) => set({ weight_t: Number(e.target.value.replace(',', '.')) || null })}
            />
          </Row>
          <Row icon="pin" label="Откуда">
            <select
              className={`${input} text-right`}
              value={draft.from_id ?? ''}
              onChange={(e) => set({ from_id: e.target.value })}
            >
              <option value="">—</option>
              {list.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Row>
          <Row icon="flag" label="Куда">
            <select
              className={`${input} text-right`}
              value={draft.to_id ?? ''}
              onChange={(e) => set({ to_id: e.target.value })}
            >
              <option value="">—</option>
              {list.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Row>
          <Row icon="clock" label="Срок">
            <input
              className={input}
              value={draft.deadline_hint ?? ''}
              placeholder="не указан"
              onChange={(e) => set({ deadline_hint: e.target.value })}
            />
          </Row>
          <Row icon="comment" label="Грузчики">
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => set({ loaders: Math.max(0, (draft.loaders ?? 0) - 1) })}
                className="bg-card flex h-7 w-7 items-center justify-center rounded-full"
                aria-label="Меньше"
              >
                <Icon name="minus" size={13} />
              </button>
              <span className="tnum w-5 text-center font-bold">{draft.loaders ?? 0}</span>
              <button
                onClick={() => set({ loaders: (draft.loaders ?? 0) + 1 })}
                className="bg-card flex h-7 w-7 items-center justify-center rounded-full"
                aria-label="Больше"
              >
                <Icon name="plus" size={13} />
              </button>
            </div>
          </Row>
        </div>

        <div className="bg-chip-y mt-3 flex items-center gap-2.5 rounded-[14px] p-3">
          <Icon name="info" size={18} className="text-yellow-ink" />
          <p className="text-[12px]">Можно поправить любое поле — агент пересчитает</p>
        </div>

        {error && <p className="mt-2 text-[12.5px] text-red-600">{error}</p>}

        <div className="mt-3 flex gap-2.5">
          <Button variant="ghost" onClick={() => nav('/new')}>
            Исправить
          </Button>
          <Button onClick={start} disabled={busy}>
            {busy ? 'Запускаю…' : 'Всё верно'}
          </Button>
        </div>
      </section>

      <TabBar role="shipper" />
    </div>
  )
}

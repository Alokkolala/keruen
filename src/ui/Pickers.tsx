import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'
import type { Carrier, Point } from '../lib/types'

/** Нижняя шторка. Закрывается по фону и по Esc. */
export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-black/35"
        style={{ animation: 'vtOut 0.2s reverse both' }}
      />
      <div
        className="bg-card rise relative mx-auto flex max-h-[78vh] w-full max-w-[480px] flex-col rounded-t-[26px] px-4 pt-3"
        style={{ paddingBottom: 'calc(14px + env(safe-area-inset-bottom))' }}
      >
        <span className="bg-line mx-auto mb-2 h-1 w-10 shrink-0 rounded-full" />
        <div className="mb-2 flex shrink-0 items-center gap-2">
          <h2 className="flex-1 text-[17px] font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Закрыть" className="bg-bg rounded-full p-2">
            <Icon name="plus" size={14} className="rotate-45" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/**
 * Выбор населённого пункта. Раньше это был <select> на 10 строк —
 * на телефоне в него было не попасть, и искать в нём нечего.
 */
export function PointPicker({
  open,
  title,
  points,
  value,
  onPick,
  onClose,
}: {
  open: boolean
  title: string
  points: Point[]
  value: string | null
  onPick: (id: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  useEffect(() => {
    if (open) setQ('')
  }, [open])

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const sorted = [...points].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    return needle ? sorted.filter((p) => p.name.toLowerCase().includes(needle)) : sorted
  }, [points, q])

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <div className="bg-bg mb-2 flex shrink-0 items-center gap-2 rounded-[16px] px-3 py-2.5">
        <Icon name="search" size={16} className="text-muted shrink-0" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Актау, Шетпе, Бейнеу…"
          className="placeholder:text-muted w-full bg-transparent text-[15px] outline-none"
        />
      </div>

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {list.length === 0 && (
          <p className="text-muted py-6 text-center text-[13px]">
            Ничего не нашлось. Мы возим по Мангистауской области.
          </p>
        )}
        {list.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              onPick(p.id)
              onClose()
            }}
            className="border-line flex w-full items-center gap-3 border-b py-3 text-left last:border-0"
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                value === p.id ? 'bg-yellow' : 'bg-bg'
              }`}
            >
              <Icon name={p.kind === 'city' ? 'flag' : 'pin'} size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{p.name}</span>
              <span className="text-muted block text-[11px]">
                {p.kind === 'city' ? 'город' : 'посёлок'}
              </span>
            </span>
            {value === p.id && <Icon name="check" size={16} className="text-green-ink shrink-0" />}
          </button>
        ))}
      </div>
    </Sheet>
  )
}

/**
 * Под какой машиной сидит перевозчик. Логина в демо нет, а агент зовёт
 * на заказ 2-3 машины из четырёх — без этого выбора можно было открыть
 * экран той, которую агент не позвал, и увидеть пустоту.
 * Счётчик показывает, у кого сейчас есть предложения.
 */
export function CarrierPicker({
  open,
  carriers,
  value,
  offersBy,
  onPick,
  onClose,
}: {
  open: boolean
  carriers: Carrier[]
  value: string | null
  offersBy: Map<string, number>
  onPick: (id: string) => void
  onClose: () => void
}) {
  return (
    <Sheet open={open} title="Чья это машина" onClose={onClose}>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {carriers.length === 0 && (
          <p className="text-muted py-6 text-center text-[13px]">Машин в базе нет.</p>
        )}
        {carriers.map((c) => {
          const n = offersBy.get(c.id) ?? 0
          return (
            <button
              key={c.id}
              onClick={() => {
                onPick(c.id)
                onClose()
              }}
              className="border-line flex w-full items-center gap-3 border-b py-3 text-left last:border-0"
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  value === c.id ? 'bg-yellow' : 'bg-bg'
                }`}
              >
                {c.name.slice(0, 2)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{c.name}</span>
                <span className="text-muted block truncate text-[11px]">
                  {c.vehicle} · {c.capacity_t} т · {c.body} · ★ {c.rating}
                </span>
              </span>
              {n > 0 && (
                <span className="bg-chip-y shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold">
                  {n}
                </span>
              )}
              {value === c.id && <Icon name="check" size={16} className="text-green-ink shrink-0" />}
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}

/* ——— срок ——————————————————————————————————————————— */

const DAY = 86_400_000
const iso = (d: Date) => {
  // Локальная дата, не UTC: иначе вечером срок уезжает на день назад.
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
  return z.toISOString().slice(0, 10)
}

/** Ближайшая пятница; если сегодня пятница — сегодня. */
function nextFriday(from: Date) {
  const d = new Date(from)
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7))
  return d
}

export function humanDate(value: string | null) {
  if (!value) return 'не указан'
  const now = new Date()
  if (value === iso(now)) return 'сегодня'
  if (value === iso(new Date(now.getTime() + DAY))) return 'завтра'
  return new Date(`${value}T12:00:00`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    weekday: 'short',
  })
}

/**
 * Срок доставки. До этого поле было свободным текстом и никуда не сохранялось:
 * колонка orders.deadline оставалась null, агент про срок не знал.
 */
export function DeadlinePicker({
  value,
  onChange,
}: {
  value: string | null
  onChange: (v: string | null) => void
}) {
  const dateRef = useRef<HTMLInputElement>(null)
  const now = new Date()
  const quick = [
    { label: 'Сегодня', v: iso(now) },
    { label: 'Завтра', v: iso(new Date(now.getTime() + DAY)) },
    { label: 'К пятнице', v: iso(nextFriday(now)) },
  ]
  // Завтра может само оказаться пятницей — подсвечиваем один чип, не два.
  const activeIdx = quick.findIndex((q) => q.v === value)

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {quick.map((q, i) => (
        <button
          key={q.label}
          onClick={() => onChange(value === q.v ? null : q.v)}
          className={`rounded-full px-2.5 py-1.5 text-[11.5px] font-medium transition-colors ${
            activeIdx === i ? 'bg-yellow text-ink' : 'bg-card text-muted'
          }`}
        >
          {q.label}
        </button>
      ))}
      <button
        onClick={() => {
          const el = dateRef.current
          if (!el) return
          // showPicker есть в iOS Safari 16+ и Chrome; где нет — обычный фокус.
          if (typeof el.showPicker === 'function') el.showPicker()
          else el.focus()
        }}
        className={`rounded-full px-2.5 py-1.5 text-[11.5px] font-medium ${
          value && activeIdx < 0 ? 'bg-yellow text-ink' : 'bg-card text-muted'
        }`}
      >
        {value && activeIdx < 0 ? humanDate(value) : 'Другая'}
      </button>
      <input
        ref={dateRef}
        type="date"
        min={iso(now)}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="sr-only"
        tabIndex={-1}
        aria-label="Другая дата"
      />
    </div>
  )
}

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Icon, type IconName } from './Icon'

export function Header({ city = 'Актау' }: { city?: string }) {
  const nav = useNavigate()
  const role = useRole()
  return (
    <header className="flex items-center gap-2">
      <img src="/assets/logo-mark.png" alt="" className="h-6 w-9 object-contain" />
      <span className="text-[21px] font-bold tracking-[0.14em]">KERUEN</span>
      <span className="flex-1" />
      <span className="bg-card flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-medium">
        <Icon name="pin" size={14} />
        {city}
      </span>
      {/* Колокольчик ничего не делал. На его месте — смена роли:
          на демо два телефона переключаются одним тапом. */}
      <button
        onClick={() => nav('/role')}
        aria-label={role === 'carrier' ? 'Я перевозчик, сменить роль' : 'Я отправитель, сменить роль'}
        className="bg-card flex h-9 w-9 items-center justify-center rounded-full"
      >
        <Icon name={role === 'carrier' ? 'truck' : 'cube'} size={17} />
      </button>
    </header>
  )
}

export function TitleBar({ title, sub }: { title: string; sub?: string }) {
  const nav = useNavigate()
  return (
    <div className="flex items-center gap-2.5">
      <button onClick={() => nav(-1)} aria-label="Назад" className="shrink-0">
        <Icon name="back" size={20} />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[21px] leading-tight font-bold">{title}</h1>
        {sub && <p className="text-muted truncate text-[11.5px]">{sub}</p>}
      </div>
    </div>
  )
}

function Tab({ to, icon, label }: { to: string; icon: IconName; label: string }) {
  return (
    <NavLink
      to={to}
      end
      viewTransition
      className={({ isActive }) =>
        `flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1 ${isActive ? 'text-ink' : 'text-muted'}`
      }
    >
      <Icon name={icon} size={20} />
      <span className="w-full truncate text-center text-[10.5px] font-medium">{label}</span>
    </NavLink>
  )
}

export function TabBar({ role }: { role: 'shipper' | 'carrier' }) {
  const nav = useNavigate()
  return (
    <nav className="bg-card sticky bottom-0 mt-auto flex items-center gap-1 rounded-[26px] px-2.5 py-2 shadow-[0_-2px_20px_rgb(0_0_0/0.06)]">
      {role === 'shipper' ? (
        <>
          <Tab to="/" icon="home" label="Главная" />
          <button
            onClick={() => nav('/new', { viewTransition: true })}
            className="bg-yellow text-ink flex shrink-0 items-center gap-1.5 rounded-full px-4 py-3 text-[13.5px] font-bold"
          >
            <Icon name="plus" size={14} />
            Новый заказ
          </button>
          <Tab to="/orders" icon="clipboard" label="Мои заказы" />
        </>
      ) : (
        <>
          <Tab to="/carrier" icon="home" label="Главная" />
          <span className="bg-yellow text-ink flex shrink-0 items-center gap-1.5 rounded-full px-4 py-3 text-[13.5px] font-bold">
            <span className="bg-card flex h-4 w-4 items-center justify-center rounded-full">
              <span className="bg-green h-2 w-2 rounded-full" />
            </span>
            На линии
          </span>
          <Tab to="/day" icon="calendar" label="Мой день" />
        </>
      )}
    </nav>
  )
}

export function Chip({
  tone = 'yellow',
  icon,
  children,
}: {
  tone?: 'yellow' | 'green' | 'plain' | 'alert'
  icon?: IconName
  children: React.ReactNode
}) {
  const bg =
    tone === 'green'
      ? 'bg-chip-g text-green-ink'
      : tone === 'alert'
        ? 'bg-chip-r text-alert'
        : tone === 'plain'
          ? 'bg-bg text-muted'
          : 'bg-chip-y text-ink'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium ${bg}`}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  )
}

export function Button({
  variant = 'primary',
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  const cls =
    variant === 'primary'
      ? 'bg-yellow text-ink font-bold shadow-[0_4px_12px_rgb(0_0_0/0.14)]'
      : 'bg-gray-btn text-ink font-medium'
  // w-full, а не flex-1: .screen — колонка, и flex-1 растил кнопку по высоте
  // на пол-экрана. Пары кнопок кладём в ButtonRow.
  return (
    <button
      {...rest}
      className={`min-h-[50px] w-full rounded-[18px] px-4 py-3.5 text-[15px] transition-transform active:scale-[0.98] disabled:opacity-50 ${cls} ${rest.className ?? ''}`}
    >
      {children}
    </button>
  )
}

/** Две кнопки в ряд равной ширины. Сетка, а не flex — не растягивается по высоте. */
export function ButtonRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2.5">{children}</div>
}

export function money(n: number | null | undefined) {
  if (n == null) return '—'
  return `${Math.round(n).toLocaleString('ru-RU')} ₸`
}

/* ——— роль: отправитель или перевозчик ————————————————— */

export type Role = 'shipper' | 'carrier'

// localStorage сам по себе не реактивен: без подписки экран, который выбрал
// роль, остаётся на месте — он не знает, что значение поменялось.
const roleWatchers = new Set<() => void>()

export function getRole(): Role | null {
  const v = localStorage.getItem('keruen:role')
  return v === 'shipper' || v === 'carrier' ? v : null
}

export function setRole(r: Role) {
  localStorage.setItem('keruen:role', r)
  roleWatchers.forEach((fn) => fn())
}

export function useRole() {
  return useSyncExternalStore(
    (cb) => {
      roleWatchers.add(cb)
      // Вторая вкладка на том же телефоне тоже должна подхватить смену роли.
      addEventListener('storage', cb)
      return () => {
        roleWatchers.delete(cb)
        removeEventListener('storage', cb)
      }
    },
    getRole,
    () => null,
  )
}

/* ——— общие состояния: пусто, ошибка, грузится ————————— */

export function Empty({
  art,
  title,
  hint,
  action,
}: {
  art: string
  title: string
  hint: string
  action?: React.ReactNode
}) {
  return (
    <section className="card rise flex flex-col items-center px-6 py-7 text-center">
      <img src={art} alt="" className="h-[104px] w-[124px] object-contain opacity-90" />
      <p className="mt-2 text-[15px] font-bold">{title}</p>
      <p className="text-muted mt-1 max-w-[260px] text-[12.5px] leading-[17px]">{hint}</p>
      {action && <div className="mt-3 flex w-full max-w-[240px]">{action}</div>}
    </section>
  )
}

export function Failed({
  title,
  detail,
  onRetry,
}: {
  title: string
  detail?: string | null
  onRetry?: () => void
}) {
  return (
    <section className="bg-chip-r rise rounded-[18px] p-3.5">
      <div className="flex items-start gap-2.5">
        <Icon name="info" size={18} className="text-alert mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-alert text-[13.5px] font-bold">{title}</p>
          {detail && <p className="text-alert/80 mt-0.5 text-[11.5px] break-words">{detail}</p>}
        </div>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="bg-card text-ink mt-2.5 w-full rounded-[14px] py-2.5 text-[13.5px] font-bold"
        >
          Попробовать ещё раз
        </button>
      )}
    </section>
  )
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <section key={i} className="card flex items-center gap-3 p-3.5">
          <span className="skeleton h-[58px] w-[58px] shrink-0 rounded-[16px]" />
          <div className="flex-1 space-y-2">
            <span className="skeleton block h-3.5 w-3/5" />
            <span className="skeleton block h-2.5 w-2/5" />
            <span className="skeleton block h-4 w-20 rounded-full" />
          </div>
        </section>
      ))}
    </>
  )
}

/* ——— числа набегают счётчиком, а не прыгают —————————— */

export function useCountUp(target: number | null | undefined, ms = 700) {
  const [n, setN] = useState(target ?? 0)
  const fromRef = useRef(target ?? 0)

  useEffect(() => {
    const to = target ?? 0
    const from = fromRef.current
    if (from === to) return setN(to)
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      fromRef.current = to
      return setN(to)
    }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      // ease-out: быстро стартует, мягко догоняет — читается как «насчитал»
      setN(from + (to - from) * (1 - Math.pow(1 - k, 3)))
      if (k < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = to
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])

  return n
}

/** Число, которое набегает. `fmt` решает, деньги это, километры или штуки. */
export function Num({
  value,
  fmt = (v) => Math.round(v).toLocaleString('ru-RU'),
  className = '',
}: {
  value: number | null | undefined
  fmt?: (v: number) => string
  className?: string
}) {
  const n = useCountUp(value)
  if (value == null) return <span className={className}>—</span>
  return <span className={`tnum ${className}`}>{fmt(n)}</span>
}

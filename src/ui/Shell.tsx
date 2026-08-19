import { NavLink, useNavigate } from 'react-router-dom'
import { Icon, type IconName } from './Icon'

export function Header({ city = 'Актау' }: { city?: string }) {
  return (
    <header className="flex items-center gap-2">
      <img src="/assets/logo-mark.png" alt="" className="h-6 w-9 object-contain" />
      <span className="text-[21px] font-bold tracking-[0.14em]">KERUEN</span>
      <span className="flex-1" />
      <span className="bg-card flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-medium">
        <Icon name="pin" size={14} />
        {city}
      </span>
      <Icon name="bell" size={22} />
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
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center gap-1 py-1 ${isActive ? 'text-ink' : 'text-muted'}`
      }
    >
      <Icon name={icon} size={21} />
      <span className="text-[11px] font-medium">{label}</span>
    </NavLink>
  )
}

export function TabBar({ role }: { role: 'shipper' | 'carrier' }) {
  const nav = useNavigate()
  return (
    <nav className="bg-card sticky bottom-0 mt-auto flex items-center gap-2 rounded-[30px] px-3.5 py-2.5 shadow-[0_-2px_20px_rgb(0_0_0/0.06)]">
      {role === 'shipper' ? (
        <>
          <Tab to="/" icon="home" label="Главная" />
          <button
            onClick={() => nav('/new')}
            className="bg-yellow text-ink flex items-center gap-2 rounded-full px-5 py-3.5 text-[14px] font-bold"
          >
            <Icon name="plus" size={15} />
            Новый заказ
          </button>
          <Tab to="/orders" icon="clipboard" label="Мои заказы" />
        </>
      ) : (
        <>
          <Tab to="/carrier" icon="home" label="Главная" />
          <span className="bg-yellow text-ink flex items-center gap-2 rounded-full px-5 py-3.5 text-[14px] font-bold">
            <span className="bg-card flex h-5 w-5 items-center justify-center rounded-full">
              <span className="bg-green h-2.5 w-2.5 rounded-full" />
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
  tone?: 'yellow' | 'green' | 'plain'
  icon?: IconName
  children: React.ReactNode
}) {
  const bg =
    tone === 'green' ? 'bg-chip-g text-green-ink' : tone === 'plain' ? 'bg-bg text-muted' : 'bg-chip-y text-ink'
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
  return (
    <button
      {...rest}
      className={`flex-1 rounded-[18px] px-4 py-3.5 text-[15px] disabled:opacity-50 ${cls} ${rest.className ?? ''}`}
    >
      {children}
    </button>
  )
}

export function money(n: number | null | undefined) {
  if (n == null) return '—'
  return `${Math.round(n).toLocaleString('ru-RU')} ₸`
}

import { useNavigate } from 'react-router-dom'
import { Icon } from '../ui/Icon'
import { getRole, setRole, type Role as R } from '../ui/Shell'

/**
 * Кто вы. Раньше экран перевозчика открывался только вручную по /carrier —
 * на демо это значило «наберите адрес на чужом телефоне».
 * Выбор запоминается, сменить можно из шапки на любом экране.
 */
export default function Role() {
  const nav = useNavigate()
  const current = getRole()

  function pick(r: R) {
    setRole(r)
    nav(r === 'carrier' ? '/carrier' : '/', { replace: true, viewTransition: true })
  }

  const Option = ({
    role,
    art,
    icon,
    title,
    hint,
    delay,
  }: {
    role: R
    art: string
    icon: 'cube' | 'truck'
    title: string
    hint: string
    delay: number
  }) => (
    <button
      onClick={() => pick(role)}
      className={`card rise flex items-center gap-3 p-4 text-left transition-transform active:scale-[0.98] ${
        current === role ? 'ring-yellow ring-2' : ''
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <img src={art} alt="" className="h-[92px] w-[92px] shrink-0 object-contain" />
      <div className="min-w-0 flex-1">
        <span className="bg-chip-y mb-1.5 flex h-8 w-8 items-center justify-center rounded-[10px]">
          <Icon name={icon} size={17} className="text-yellow-ink" />
        </span>
        <p className="text-[17px] leading-tight font-bold">{title}</p>
        <p className="text-muted mt-1 text-[12px] leading-[16px]">{hint}</p>
      </div>
      <Icon name="next" size={16} className="text-muted shrink-0" />
    </button>
  )

  return (
    <div className="screen justify-center">
      <div className="rise flex items-center justify-center gap-2 pb-1">
        <img src="/assets/logo-mark.png" alt="" className="h-7 w-11 object-contain" />
        <span className="text-[24px] font-bold tracking-[0.14em]">KERUEN</span>
      </div>
      <p className="text-muted rise mb-1 text-center text-[13px]" style={{ animationDelay: '60ms' }}>
        Грузовой день без порожних километров
      </p>

      <Option
        role="shipper"
        art="/assets/ill-truck-boxes.png"
        icon="cube"
        title="Я отправляю груз"
        hint="Скажите, что везти — агент посчитает маршрут, цену и найдёт машину"
        delay={120}
      />
      <Option
        role="carrier"
        art="/assets/truck-brand.png"
        icon="truck"
        title="Я вожу груз"
        hint="Принимайте заявки и получайте обратный груз заранее, ещё в пути"
        delay={190}
      />

      <p className="text-muted rise mt-1 text-center text-[11px]" style={{ animationDelay: '260ms' }}>
        Роль запомнится. Сменить — по значку в шапке.
      </p>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Header, TitleBar, Button, ButtonRow, Failed } from '../ui/Shell'
import { Icon } from '../ui/Icon'
import { api, usePoints } from '../lib/data'

interface Draft {
  from_id: string | null
  to_id: string | null
  from_address: string | null
  to_address: string | null
  [k: string]: unknown
}

/**
 * Фрейм «8 · Адрес» из макета. Точка на карте — настоящая:
 * тайлы OSM, адрес приходит обратным геокодом Nominatim.
 * Если геокодер молчит — так и пишем, а не подставляем выдуманную улицу.
 */
export default function Address() {
  const { end } = useParams<{ end: 'from' | 'to' }>()
  const nav = useNavigate()
  const points = usePoints()

  const boxRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const seq = useRef(0)

  const [draft, setDraft] = useState<Draft | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const field = end === 'to' ? 'to_address' : 'from_address'
  const pointId = draft ? (end === 'to' ? draft.to_id : draft.from_id) : null
  const base = points.get(pointId ?? '')

  useEffect(() => {
    const raw = sessionStorage.getItem('keruen:draft')
    if (!raw) return void nav('/new', { replace: true })
    const d = JSON.parse(raw) as Draft
    setDraft(d)
    setAddress((d[field] as string) ?? null)
  }, [nav, field])

  // Карта поднимается один раз, когда стал известен населённый пункт.
  useEffect(() => {
    if (!boxRef.current || mapRef.current || !base) return
    const map = L.map(boxRef.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView([base.lat, base.lon], 14)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    mapRef.current = map

    const ask = async () => {
      const c = map.getCenter()
      const mine = ++seq.current
      setBusy(true)
      setError(null)
      try {
        const r = await api<{ name: string }>('geocode', {
          lat: c.lat,
          lon: c.lng,
        })
        if (mine === seq.current) setAddress(r.name)
      } catch (e) {
        if (mine === seq.current) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (mine === seq.current) setBusy(false)
      }
    }
    map.on('moveend', ask)
    ask()

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [base])

  function save() {
    if (!draft) return
    sessionStorage.setItem('keruen:draft', JSON.stringify({ ...draft, [field]: address }))
    nav(-1)
  }

  return (
    <div className="screen">
      <Header />
      <TitleBar
        title={end === 'to' ? 'Адрес выгрузки' : 'Адрес погрузки'}
        sub={base ? `${base.name} — двигайте карту, пин по центру` : 'Загружаю карту…'}
      />

      <div
        className="card relative shrink-0 overflow-hidden"
        style={{ height: '46vh', minHeight: 260 }}
      >
        <div ref={boxRef} className="h-full w-full" />
        {/* Пин прибит к центру экрана: карта ездит под ним, как в такси. */}
        <span className="pointer-events-none absolute top-1/2 left-1/2 z-[500] -translate-x-1/2 -translate-y-full drop-shadow-lg">
          <Icon name="pin" size={38} className="text-yellow-ink fill-yellow" strokeWidth={1.6} />
        </span>
      </div>

      <section className="card p-3.5">
        <p className="text-muted text-[11.5px]">Что под пином</p>
        {busy ? (
          <span className="skeleton mt-2.5 block h-5 w-4/5" />
        ) : (
          <input
            value={address ?? ''}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Адрес не определился — впишите вручную"
            className="placeholder:text-muted placeholder:font-normal mt-1 w-full bg-transparent text-[15px] leading-tight font-bold outline-none"
          />
        )}
        <p className="text-muted mt-1.5 text-[10.5px]">
          Можно дописать ориентир: подъезд, ворота, склад
        </p>
      </section>

      {error && <Failed title="Геокодер не ответил" detail={error} />}

      <div className="mt-auto pt-2">
        <ButtonRow>
          <Button variant="ghost" onClick={() => nav(-1)}>
            Отмена
          </Button>
          <Button onClick={save} disabled={!address?.trim()}>
            Готово
          </Button>
        </ButtonRow>
      </div>
    </div>
  )
}

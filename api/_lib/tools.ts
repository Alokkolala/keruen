// Настоящие интеграции агента. Никаких моков: OSRM считает по дорожной сети,
// Open-Meteo отдаёт фактическую погоду, цена выводится из километров и топлива.

export interface Point {
  id: string
  name: string
  lat: number
  lon: number
}

// keruen: калибровочные константы. Проверять раз в сезон — дизель и ставки плывут.
// Ставка за километр — основа цены, топливо лишь показывается отправителю
// как составляющая. Считать цену от одного топлива нельзя: на межгороде
// оно около 12% рейса, остальное водитель, амортизация и маржа.
export const PRICING = {
  dieselPerLitre: 295, // ₸/л, Мангистау
  litresPer100km: { light: 14, medium: 25, heavy: 34 }, // до 3т / до 8т / выше
  ratePerKm: { light: 260, medium: 330, heavy: 450 }, // ₸/км по классам
  minFare: 15000, // подача на короткое плечо
  spread: { min: 0.92, max: 1.12 },
  loaderFee: 2000, // ₸ за грузчика
}

function classOf(weightT: number): 'light' | 'medium' | 'heavy' {
  if (weightT <= 3) return 'light'
  if (weightT <= 8) return 'medium'
  return 'heavy'
}

function consumptionFor(weightT: number) {
  return PRICING.litresPer100km[classOf(weightT)]
}

/**
 * Сеть падает молча и по-разному: таймаут, обрыв, DNS. AbortSignal.timeout
 * бросает, а не возвращает — и вызывающий код падал до своего try/catch,
 * снова показывая пользователю вечный спиннер. Здесь единственное место,
 * где это ловится: наружу уходит либо ответ, либо null.
 */
async function getJson<T>(url: string, init: RequestInit = {}, ms = 7000): Promise<T | null> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/** Маршрут по реальной дорожной сети. Возвращает null, если OSRM не ответил. */
export async function routeBetween(a: Point, b: Point) {
  if (a.id && a.id === b.id) return { distance_km: 0, duration_min: 0, source: 'osrm' as const }
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${a.lon},${a.lat};${b.lon},${b.lat}?overview=false&alternatives=false`
  // Публичный сервер OSRM режет запросы из датацентров: с Vercel он отвечает
  // то за 7 секунд, то не отвечает вовсе. Одна повторная попытка.
  let json = await getJson<{ code: string; routes?: { distance: number; duration: number }[] }>(url)
  if (!json) json = await getJson(url)
  const r = json?.routes?.[0]
  if (json?.code !== 'Ok' || !r) return null
  return {
    distance_km: Math.round(r.distance / 100) / 10,
    duration_min: Math.round(r.duration / 60),
    source: 'osrm' as const,
  }
}

/**
 * Тот же настоящий OSRM, но ответ сохраняется в базу и переиспользуется.
 * Дорога между Актау и Шетпе не меняется между запросами, а публичный
 * сервер OSRM — самое медленное и самое ненадёжное звено демо.
 * Это кэш настоящих ответов, а не подставленное число: пока OSRM не
 * ответил хотя бы раз, здесь тоже будет null.
 */
export async function routeCached(db: DbLike, a: Point, b: Point) {
  if (!a.id || !b.id) return routeBetween(a, b)
  if (a.id === b.id) return { distance_km: 0, duration_min: 0, source: 'osrm' as const }

  const { data: hit } = await db
    .from('route_cache')
    .select('distance_km,duration_min')
    .eq('from_id', a.id)
    .eq('to_id', b.id)
    .maybeSingle()
  if (hit)
    return {
      distance_km: Number(hit.distance_km),
      duration_min: Number(hit.duration_min),
      source: 'osrm' as const,
    }

  const fresh = await routeBetween(a, b)
  if (!fresh) return null
  await db.from('route_cache').upsert({
    from_id: a.id,
    to_id: b.id,
    distance_km: fresh.distance_km,
    duration_min: fresh.duration_min,
  })
  return fresh
}

// Ровно тот кусочек Supabase-клиента, который нужен кэшу.
type DbLike = {
  from: (t: string) => any
}

/** Фактическая погода в точке. */
export async function weatherAt(p: Point) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}` +
    `&current=temperature_2m,precipitation,wind_speed_10m,weather_code&timezone=auto`
  const json = await getJson<{
    current?: {
      temperature_2m: number
      precipitation: number
      wind_speed_10m: number
      weather_code: number
    }
  }>(url)
  const c = json?.current
  if (!c) return null
  return {
    temp_c: Math.round(c.temperature_2m),
    precipitation_mm: c.precipitation,
    wind_ms: Math.round(c.wind_speed_10m / 3.6),
    description: describeWeather(c.weather_code, c.precipitation),
  }
}

function describeWeather(code: number, precip: number) {
  if (precip > 0.4) return 'осадки'
  if (code === 0) return 'ясно'
  if (code <= 3) return 'переменная облачность'
  if (code <= 48) return 'туман'
  if (code <= 67) return 'дождь'
  if (code <= 77) return 'снег'
  if (code <= 82) return 'ливень'
  return 'без осадков'
}

/** Требования к перевозке из груза и погоды — то, чего отправитель не сказал. */
export function requirementsFor(cargo: string, weather: { temp_c: number; precipitation_mm: number } | null) {
  const c = (cargo || '').toLowerCase()
  const req: string[] = []
  let body: 'тент' | 'борт' | 'реф' = 'борт'

  const perishable = /продукт|молок|мясо|рыб|овощ|фрукт|скоропорт/.test(c)
  const fragile = /стекл|техник|оборудован|мебел|электрон/.test(c)

  if (perishable && weather && weather.temp_c >= 25) {
    body = 'реф'
    req.push(`жара ${weather.temp_c} °C — скоропорт только рефрижератором`)
  } else if (fragile || (weather && weather.precipitation_mm > 0.4)) {
    body = 'тент'
    req.push(
      weather && weather.precipitation_mm > 0.4
        ? 'осадки — нужен закрытый кузов'
        : 'хрупкий груз — нужен закрытый кузов',
    )
  } else {
    req.push('подойдёт борт или тент')
  }
  return { body, notes: req }
}

/** Справедливая вилка цены: ставка за км по классу машины, не с потолка. */
export function priceRange(distanceKm: number, weightT: number, loaders = 0) {
  const litres = (distanceKm * consumptionFor(weightT)) / 100
  const fuel = Math.round(litres * PRICING.dieselPerLitre)
  const base =
    Math.max(distanceKm * PRICING.ratePerKm[classOf(weightT)], PRICING.minFare) +
    loaders * PRICING.loaderFee
  return {
    fuel_cost: fuel,
    litres: Math.round(litres),
    min: Math.round((base * PRICING.spread.min) / 500) * 500,
    max: Math.round((base * PRICING.spread.max) / 500) * 500,
  }
}

/** Геокодинг адреса внутри города. */
export async function geocode(query: string, near?: Point) {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    countrycodes: 'kz',
    limit: '5',
  })
  if (near) {
    const d = 0.6
    params.set('viewbox', `${near.lon - d},${near.lat + d},${near.lon + d},${near.lat - d}`)
    params.set('bounded', '0')
  }
  const json = await getJson<{ display_name: string; lat: string; lon: string }[]>(
    `https://nominatim.openstreetmap.org/search?${params}`,
    { headers: { 'User-Agent': 'keruen-hackathon/1.0 (contact: demo@keruen.kz)' } },
  )
  if (!json) return []
  return json.map((r) => ({
    name: r.display_name,
    lat: Number(r.lat),
    lon: Number(r.lon),
  }))
}

/** Адрес по координатам — для пина, который двигают пальцем на карте. */
export async function reverseGeocode(lat: number, lon: number) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: 'json',
    zoom: '18',
    'accept-language': 'ru',
  })
  const json = await getJson<{ display_name?: string; address?: Record<string, string> }>(
    `https://nominatim.openstreetmap.org/reverse?${params}`,
    { headers: { 'User-Agent': 'keruen-hackathon/1.0 (contact: demo@keruen.kz)' } },
  )
  if (!json) return null
  const a = json.address ?? {}
  // display_name тянет всю страну с индексом — для карточки заказа берём короткое.
  const short = [a.road && [a.road, a.house_number].filter(Boolean).join(' '), a.suburb ?? a.neighbourhood]
    .filter(Boolean)
    .join(', ')
  return short || json.display_name || null
}

/** Сколько порожних километров убирает стыковка: путь перевозчика до забора. */
export async function emptyKmSaved(carrierAt: Point, pickup: Point, dropoff: Point) {
  const [toPickup, loaded] = await Promise.all([
    routeBetween(carrierAt, pickup),
    routeBetween(pickup, dropoff),
  ])
  if (!toPickup || !loaded) return null
  // Без нас машина вернулась бы порожней тем же плечом.
  return {
    approach_km: toPickup.distance_km,
    loaded_km: loaded.distance_km,
    saved_km: loaded.distance_km, // обратное плечо, которое теперь не пустое
  }
}

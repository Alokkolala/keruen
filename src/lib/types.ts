export type PointKind = 'city' | 'settlement' | 'address'

export interface Point {
  id: string
  name: string
  kind: PointKind
  parent_id: string | null
  lat: number
  lon: number
}

export interface Carrier {
  id: string
  name: string
  vehicle: string
  body: string
  capacity_t: number
  rating: number
  base_id: string | null
  free_from: string | null
  free_at_id: string | null
  online: boolean
}

export type OrderStatus =
  | 'draft'
  | 'searching'
  | 'negotiating'
  | 'assigned'
  | 'in_transit'
  | 'done'
  | 'cancelled'

export interface Weather {
  temp_c: number
  precipitation_mm: number
  wind_ms: number
  description: string
}

export interface AgentStep {
  at: string
  text: string
  detail?: string
  state: 'done' | 'now' | 'wait'
}

export interface Order {
  id: string
  raw_text: string | null
  cargo: string | null
  weight_t: number | null
  from_id: string | null
  to_id: string | null
  from_address: string | null
  to_address: string | null
  loaders: number
  deadline: string | null
  status: OrderStatus
  distance_km: number | null
  duration_min: number | null
  fuel_cost: number | null
  price_min: number | null
  price_max: number | null
  price_final: number | null
  weather: Weather | null
  agent_log: AgentStep[]
  carrier_id: string | null
  empty_km: number | null
  created_at: string
}

export interface Leg {
  id: string
  order_id: string
  seq: number
  from_id: string
  to_id: string
  distance_km: number | null
  duration_min: number | null
  source: 'osrm' | 'estimate'
  loaded: boolean
}

export interface Offer {
  id: string
  order_id: string
  carrier_id: string
  price: number
  counter: number | null
  status: 'sent' | 'countered' | 'accepted' | 'declined'
  reason: string | null
  created_at: string
}

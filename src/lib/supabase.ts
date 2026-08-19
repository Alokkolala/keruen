import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && anonKey)

// Не бросаем на импорте: без ключей приложение показывает экран настройки,
// а не белый экран с ошибкой в консоли.
export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'anon', {
  realtime: { params: { eventsPerSecond: 10 } },
})

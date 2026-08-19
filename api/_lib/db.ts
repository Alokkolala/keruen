import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error('Нет SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY в окружении')
}

export const db = createClient(url, key, { auth: { persistSession: false } })

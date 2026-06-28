import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('[createServiceClient] Falta SUPABASE_SERVICE_ROLE_KEY en Vercel > Settings > Environment Variables')
  }
  return createSupabaseClient(url, key, { auth: { persistSession: false } })
}

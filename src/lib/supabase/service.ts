import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente con SERVICE_ROLE_KEY — bypasea RLS.
 * Usar SOLO en rutas de API server-side (nunca en el browser).
 */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

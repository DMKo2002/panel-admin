import { createBrowserClient } from '@supabase/ssr'

// Cookie a nivel .gounuri.com (no solo panel.gounuri.com) para compartir
// sesión con gounuri.com — si el usuario ya inició sesión ahí (mail o
// Google/Facebook), entra directo acá sin loguearse de nuevo. Solo en
// producción: en localhost un dominio con punto rompería el login local.
const COOKIE_DOMAIN = process.env.NODE_ENV === 'production' ? '.gounuri.com' : undefined

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: { domain: COOKIE_DOMAIN } }
  )
}

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Cookie a nivel .gounuri.com para compartir sesión con gounuri.com — ver
// nota en lib/supabase/client.ts. Solo en producción.
const COOKIE_DOMAIN = process.env.NODE_ENV === 'production' ? '.gounuri.com' : undefined

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { domain: COOKIE_DOMAIN },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // En Server Components no se puede setear cookies — ignorar
          }
        },
      },
    }
  )
}

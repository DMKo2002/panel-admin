import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Singleton: antes cada componente que llamaba a createClient() (ThemeProvider,
// DashboardRefresher, TutorialWelcomePopup, UpgradePlans, mi-cuenta,
// SuperadminClient, etc.) creaba su PROPIA instancia de GoTrueClient, cada
// una con su propio timer interno de auto-refresh de token corriendo en
// paralelo en la misma pestaña. Con varias de esas instancias vivas a la
// vez (y encima varias pestañas del panel abiertas, algo común), un
// refresh token roto terminaba siendo reintentado en simultáneo por todas
// ellas sin parar — ver incidente 2026-08-18 (cliente Caloria): ~9.000
// pedidos a /token en 2hs desde un solo usuario, que agotó el rate limit
// de Supabase para TODO el proyecto y de paso bloqueó logins de otros
// tenants. Con un único cliente por pestaña (como recomienda Supabase),
// solo corre un timer de auto-refresh — ver también AuthWatchdog.tsx, que
// corta la sesión apenas ese refresh falla de forma definitiva.
let browserClient: SupabaseClient | undefined

export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return browserClient
}

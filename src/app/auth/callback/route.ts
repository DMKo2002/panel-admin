// GET /auth/callback?code=...[&next=/ruta] — vuelta del login social.
// Dos casos usan esta misma ruta, distinguidos por el parámetro `next`:
//
// 1. Login (sin `next`, ver components/OAuthButtons.tsx en /login): login
//    directo en panel.gounuri.com, sin pasar por gounuri.com ni por ningún
//    handoff. Cambia el code por una sesión nueva (exchangeCodeForSession,
//    cookie host-only, ver lib/supabase/server.ts) y decide a dónde mandar:
//      - superadmin sin tenant propio -> /superadmin
//      - tiene tenant -> /dashboard
//      - cuenta nueva sin tenant todavía -> /onboarding (acá mismo, en Panel
//        Admin — ver esa página y /api/create-tenant). Para Google,
//        signInWithOAuth ya crea la cuenta si el mail no existía, así que
//        este es el camino normal de alta self-serve por Google, no un caso
//        raro. Historial: hasta el 19/8 mandaba a gounuri.com/onboarding
//        (mismo flujo pero en gounuri-web); el 20/8 a la mañana se cambió
//        por error a gounuri.com (home) al sacar el self-serve — pero el
//        self-serve por trial se mantiene, solo que ahora vive acá (ver
//        /registro), así que este caso vuelve a mandar a un onboarding, el
//        propio de Panel Admin.
//
// 2. Link de identidad (con `next=/dashboard/mi-cuenta`, ver esa página):
//    el usuario YA está logueado y solo está agregando Google a
//    su cuenta existente (linkIdentity() usa el mismo flujo PKCE que un
//    login, por eso pasa por acá también). Volvemos siempre a `next`, con
//    ?linked=1 si salió bien o ?linkError=<mensaje> si no.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/superadmin'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next')

  if (code) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)

      if (!error && data.user) {
        if (next) return NextResponse.redirect(`${origin}${next}?linked=1`)

        const service = createServiceClient()
        const { data: userRows } = await service
          .from('users')
          .select('tenant_id')
          .eq('id', data.user.id)
          .limit(1)

        const tenantId = userRows?.[0]?.tenant_id
        if (tenantId) return NextResponse.redirect(`${origin}/dashboard`)
        if (isSuperAdmin(data.user.email)) return NextResponse.redirect(`${origin}/superadmin`)
        return NextResponse.redirect(`${origin}/onboarding`)
      }

      console.error('[auth/callback] exchangeCodeForSession error:', error?.message)
      if (next) return NextResponse.redirect(`${origin}${next}?linkError=${encodeURIComponent(error?.message ?? 'Error desconocido')}`)
    } catch (err: any) {
      console.error('[auth/callback] excepción:', err?.message ?? err)
      if (next) return NextResponse.redirect(`${origin}${next}?linkError=${encodeURIComponent('Ocurrió un error inesperado.')}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`)
}

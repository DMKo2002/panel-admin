// GET /auth/callback?code=...[&next=/ruta] — vuelta de Google/Facebook.
// Dos casos usan esta misma ruta, distinguidos por el parámetro `next`:
//
// 1. Login (sin `next`, ver components/OAuthButtons.tsx en /login): login
//    directo en panel.gounuri.com, sin pasar por gounuri.com ni por ningún
//    handoff. Cambia el code por una sesión nueva (exchangeCodeForSession,
//    cookie host-only, ver lib/supabase/server.ts) y decide a dónde mandar:
//      - superadmin sin tenant propio -> /superadmin
//      - tiene tenant -> /dashboard
//      - cuenta nueva sin tenant todavía -> gounuri.com (home). Antes del
//        20/8 mandaba a gounuri.com/onboarding (alta self-serve) — se sacó
//        por el mismo motivo que /registro (ver ese archivo): ya no
//        exponemos ningún flujo de alta propia desde Panel Admin, el alta
//        es manual. Este caso además debería ser rarísimo en la práctica:
//        implica que alguien inició sesión con Google en panel.gounuri.com
//        con una cuenta que nunca tuvo tenant asignado.
//
// 2. Link de identidad (con `next=/dashboard/mi-cuenta`, ver esa página):
//    el usuario YA está logueado y solo está agregando Google/Facebook a
//    su cuenta existente (linkIdentity() usa el mismo flujo PKCE que un
//    login, por eso pasa por acá también). Volvemos siempre a `next`, con
//    ?linked=1 si salió bien o ?linkError=<mensaje> si no.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/superadmin'

const GOUNURI_URL = process.env.NEXT_PUBLIC_GOUNURI_URL ?? 'https://gounuri.com'

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
        return NextResponse.redirect(GOUNURI_URL)
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

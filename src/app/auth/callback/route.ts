// GET /auth/callback?code=... — vuelta de Google/Facebook tras
// signInWithOAuth (ver components/OAuthButtons.tsx). Mismo patrón que
// gounuri-web/src/app/auth/callback/route.ts. Cambia el code por una sesión
// (exchangeCodeForSession setea las cookies, ya con domain=.gounuri.com —
// ver lib/supabase/server.ts) y decide a dónde mandar:
//  - superadmin sin tenant propio -> /superadmin
//  - tiene tenant -> /dashboard
//  - cuenta nueva sin tenant todavía (nunca pasó por el onboarding de
//    gounuri.com) -> gounuri.com/onboarding, porque acá no hay flujo de
//    alta de tienda, eso vive del otro lado.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/superadmin'

const GOUNURI_URL = process.env.NEXT_PUBLIC_GOUNURI_URL ?? 'https://gounuri.com'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')

  if (code) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)

      if (!error && data.user) {
        const service = createServiceClient()
        const { data: userRows } = await service
          .from('users')
          .select('tenant_id')
          .eq('id', data.user.id)
          .limit(1)

        const tenantId = userRows?.[0]?.tenant_id
        if (tenantId) return NextResponse.redirect(`${origin}/dashboard`)
        if (isSuperAdmin(data.user.email)) return NextResponse.redirect(`${origin}/superadmin`)
        return NextResponse.redirect(`${GOUNURI_URL}/onboarding`)
      }
      console.error('[auth/callback] exchangeCodeForSession error:', error?.message)
    } catch (err: any) {
      console.error('[auth/callback] excepción:', err?.message ?? err)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`)
}

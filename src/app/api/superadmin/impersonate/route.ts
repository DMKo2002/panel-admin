import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { isSuperAdmin } from '@/lib/superadmin'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isSuperAdmin(user.email)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { tenantOwnerEmail, target } = await req.json()
  if (!tenantOwnerEmail) {
    return NextResponse.json({ error: 'Email requerido' }, { status: 400 })
  }

  // Usar service role para generar magic link
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // target: 'panel' (default, como siempre) entra al dashboard de panel-
  // admin. target: 'web' (2026-08-26) entra a gounuri.com/perfil/plan —
  // pedido de ARam para poder ver la pantalla de facturación de cualquier
  // tenant de test sin tener su contraseña, igual que ya se podía "Acceder
  // como" en el panel. Mismo mecanismo (magic link + /auth/confirm), pero
  // apuntando al otro sitio — ver gounuri-web/src/app/auth/confirm/page.tsx.
  //
  // Siempre redirigir a la URL de producción — nunca localhost. Fallback
  // apuntaba a un dominio .vercel.app viejo, de antes de configurar
  // panel.gounuri.com — si NEXT_PUBLIC_APP_URL faltara, el link de impersonar
  // mandaba al dueño de la tienda a una URL que ya no es la real.
  const panelUrl = process.env.NEXT_PUBLIC_APP_URL?.startsWith('http://localhost')
    ? 'https://panel.gounuri.com'
    : (process.env.NEXT_PUBLIC_APP_URL ?? 'https://panel.gounuri.com')
  const webUrl = process.env.NEXT_PUBLIC_GOUNURI_WEB_URL ?? 'https://gounuri.com'

  const redirectTo = target === 'web'
    ? `${webUrl}/auth/confirm?next=${encodeURIComponent('/perfil/plan')}`
    : `${panelUrl}/auth/confirm`

  const { data, error } = await serviceClient.auth.admin.generateLink({
    type: 'magiclink',
    email: tenantOwnerEmail,
    options: { redirectTo },
  })

  if (error || !data?.properties?.action_link) {
    return NextResponse.json({ error: error?.message ?? 'No se pudo generar el link' }, { status: 500 })
  }

  return NextResponse.json({ url: data.properties.action_link })
}

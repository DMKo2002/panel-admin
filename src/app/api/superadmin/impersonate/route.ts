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

  const { tenantOwnerEmail } = await req.json()
  if (!tenantOwnerEmail) {
    return NextResponse.json({ error: 'Email requerido' }, { status: 400 })
  }

  // Usar service role para generar magic link
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Siempre redirigir a la URL de producción — nunca localhost
  const panelUrl = process.env.NEXT_PUBLIC_APP_URL?.startsWith('http://localhost')
    ? 'https://panel-admin-tawny.vercel.app'
    : (process.env.NEXT_PUBLIC_APP_URL ?? 'https://panel-admin-tawny.vercel.app')

  const { data, error } = await serviceClient.auth.admin.generateLink({
    type: 'magiclink',
    email: tenantOwnerEmail,
    options: {
      redirectTo: `${panelUrl}/auth/confirm`,
    },
  })

  if (error || !data?.properties?.action_link) {
    return NextResponse.json({ error: error?.message ?? 'No se pudo generar el link' }, { status: 500 })
  }

  return NextResponse.json({ url: data.properties.action_link })
}

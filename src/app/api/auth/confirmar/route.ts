// POST /api/auth/confirmar — confirma el mail de /api/auth/registro y recién
// ahí deja al usuario con sesión (verifyOtp() setea las cookies vía el
// cliente server-side). Sin este paso no hay forma de loguearse ni de llegar
// al onboarding — es lo que "bloquea" la cuenta hasta confirmar.
//
// Mismo patrón que gounuri-web (ver conversación 2026-08-17 ahí): esto es un
// POST en vez de un GET que confirma solo con cargar la página, porque
// varios clientes de mail (Microsoft Safe Links, el proxy de Gmail, etc.)
// pre-visitan los links de un mail recién llegado para escanearlos por
// seguridad — como el link de confirmación es de un solo uso, ese escaneo
// automático lo "quemaría" antes de que el usuario real llegue a hacer
// click. /auth/verificar muestra un botón y recién llama a este POST cuando
// el usuario lo aprieta.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const TIPOS_VALIDOS = new Set(['signup', 'magiclink'])

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const token_hash = body?.token_hash
  const type = body?.type

  if (!token_hash || !type || !TIPOS_VALIDOS.has(type)) {
    return NextResponse.json({ error: 'Link inválido.' }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.verifyOtp({ token_hash, type: type as 'signup' | 'magiclink' })

    if (!error && data.user) {
      // Si por algún motivo el usuario ya tiene tenant (ej. reconfirmó un
      // link viejo después de completar el onboarding), mandarlo directo al
      // dashboard en vez de hacerlo pasar de nuevo por la elección de
      // template.
      const service = createServiceClient()
      const { data: userRows } = await service
        .from('users')
        .select('tenant_id')
        .eq('id', data.user.id)
        .limit(1)

      const redirectTo = userRows?.[0]?.tenant_id ? '/dashboard' : '/onboarding'
      return NextResponse.json({ ok: true, redirectTo })
    }
    console.error('[api/auth/confirmar] verifyOtp error:', error?.message)
  } catch (err: any) {
    console.error('[api/auth/confirmar] excepción:', err?.message ?? err)
  }

  return NextResponse.json({ error: 'El link ya no es válido.' }, { status: 400 })
}

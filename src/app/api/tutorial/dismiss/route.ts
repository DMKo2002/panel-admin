// POST /api/tutorial/dismiss — marca tutorial_dismissed = true para el
// usuario logueado ("No volver a mostrar" del popup de bienvenida).
//
// Va por API route + service client (no un UPDATE directo desde el cliente)
// a propósito: la tabla `users` no tiene política RLS de UPDATE (solo
// lectura e insert de la propia fila, ver CLAUDE.md) — agregar una política
// amplia de "puedo actualizar mi propia fila" sería riesgoso, porque esa
// misma fila tiene `role`, `tenant_id` y `permissions`. Acá el service
// client solo puede tocar esta única columna, para este único id (el del
// usuario autenticado, nunca uno arbitrario del body).

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const service = createServiceClient()
  const { error } = await service.from('users').update({ tutorial_dismissed: true }).eq('id', user.id)
  if (error) {
    console.error('[tutorial/dismiss]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

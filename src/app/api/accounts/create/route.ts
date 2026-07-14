import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { email, password } = await req.json()
  if (!email?.trim()) return NextResponse.json({ error: 'Falta el email' }, { status: 400 })
  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: _callerRows } = await service.from('users').select('tenant_id, role').eq('id', user.id).limit(1)
  const caller = _callerRows?.[0]
  if (!caller?.tenant_id) return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 })
  if (caller.role !== 'owner') {
    return NextResponse.json({ error: 'Solo el dueño de la tienda puede crear cuentas' }, { status: 403 })
  }

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
  })
  if (createError || !created?.user) {
    const msg = createError?.message ?? 'No se pudo crear la cuenta'
    const friendly = /already.*registered|already.*exists/i.test(msg) ? 'Ya existe una cuenta con ese email' : msg
    return NextResponse.json({ error: friendly }, { status: 500 })
  }

  const { error: linkError } = await service.from('users').upsert(
    { id: created.user.id, email: email.trim(), tenant_id: caller.tenant_id, role: 'staff' },
    { onConflict: 'id' }
  )
  if (linkError) {
    // Evitar dejar un auth user huérfano si no se pudo vincular al tenant
    await service.auth.admin.deleteUser(created.user.id)
    return NextResponse.json({ error: linkError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

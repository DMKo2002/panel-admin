import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { accountId } = await req.json()
  if (!accountId) return NextResponse.json({ error: 'Falta accountId' }, { status: 400 })

  const service = createServiceClient()

  const { data: _callerRows } = await service.from('users').select('tenant_id, role').eq('id', user.id).limit(1)
  const caller = _callerRows?.[0]
  if (!caller?.tenant_id) return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 })
  if (caller.role !== 'owner') {
    return NextResponse.json({ error: 'Solo el dueño de la tienda puede eliminar cuentas' }, { status: 403 })
  }
  if (accountId === user.id) {
    return NextResponse.json({ error: 'No podés eliminar tu propia cuenta' }, { status: 400 })
  }

  const { data: _targetRows } = await service.from('users').select('id, tenant_id, role').eq('id', accountId).limit(1)
  const target = _targetRows?.[0]
  if (!target || target.tenant_id !== caller.tenant_id) {
    return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
  }
  if (target.role === 'owner') {
    return NextResponse.json({ error: 'No se puede eliminar al dueño de la tienda' }, { status: 400 })
  }

  await service.from('users').delete().eq('id', accountId)

  const { error: authDeleteError } = await service.auth.admin.deleteUser(accountId)
  if (authDeleteError) {
    return NextResponse.json({
      error: 'Se quitó el acceso pero falló borrar el usuario de autenticación: ' + authDeleteError.message,
    }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

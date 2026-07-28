import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { GRANTABLE_SETTINGS_ROUTES } from '@/lib/settings-nav'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { accountId, permissions } = await req.json()
  if (!accountId) return NextResponse.json({ error: 'Falta la cuenta' }, { status: 400 })

  const service = createServiceClient()

  const { data: _callerRows } = await service.from('users').select('tenant_id, role').eq('id', user.id).limit(1)
  const caller = _callerRows?.[0]
  if (!caller?.tenant_id) return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 })
  if (caller.role !== 'owner') {
    return NextResponse.json({ error: 'Solo el dueño de la tienda puede editar permisos' }, { status: 403 })
  }

  // La cuenta a editar tiene que ser un 'staff' del mismo tenant — nunca se
  // tocan permisos de otra tienda ni del propio owner (que siempre tiene
  // acceso total, no pasa por esta tabla de permisos).
  const { data: _targetRows } = await service.from('users').select('tenant_id, role').eq('id', accountId).limit(1)
  const target = _targetRows?.[0]
  if (!target || target.tenant_id !== caller.tenant_id || target.role !== 'staff') {
    return NextResponse.json({ error: 'Cuenta inválida' }, { status: 403 })
  }

  const grantableKeys = new Set(GRANTABLE_SETTINGS_ROUTES.map(r => r.key))
  const cleanPermissions: Record<string, boolean> = {}
  if (permissions && typeof permissions === 'object') {
    for (const [key, value] of Object.entries(permissions)) {
      if (grantableKeys.has(key)) cleanPermissions[key] = value === true
    }
  }

  const { error } = await service.from('users').update({ permissions: cleanPermissions }).eq('id', accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

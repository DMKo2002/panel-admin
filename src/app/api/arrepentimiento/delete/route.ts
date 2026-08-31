import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { requestId } = await req.json()
  if (!requestId) return NextResponse.json({ error: 'Falta requestId' }, { status: 400 })

  const service = createServiceClient()

  const { data: _userRows } = await service.from('users').select('tenant_id').eq('id', user.id).limit(1)
  const tenantId = _userRows?.[0]?.tenant_id
  if (!tenantId) return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 })

  // Verificar que la solicitud pertenece al tenant del usuario
  const { data: request } = await service.from('withdrawal_requests')
    .select('id, tenant_id')
    .eq('id', requestId).eq('tenant_id', tenantId).limit(1)
  if (!request?.[0]) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })

  const { error: deleteError } = await service.from('withdrawal_requests').delete().eq('id', requestId).eq('tenant_id', tenantId)
  if (deleteError) {
    return NextResponse.json({ error: 'No se pudo eliminar la solicitud: ' + deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { orderId } = await req.json()
  if (!orderId) return NextResponse.json({ error: 'Falta orderId' }, { status: 400 })

  const service = createServiceClient()

  const { data: _userRows } = await service.from('users').select('tenant_id').eq('id', user.id).limit(1)
  const tenantId = _userRows?.[0]?.tenant_id
  if (!tenantId) return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 })

  // Verificar que el pedido pertenece al tenant del usuario
  const { data: order } = await service.from('orders')
    .select('id, tenant_id')
    .eq('id', orderId).eq('tenant_id', tenantId).limit(1)
  if (!order?.[0]) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

  // Borrar registros relacionados primero (no confirmamos que haya ON DELETE CASCADE)
  await service.from('order_items').delete().eq('order_id', orderId)
  await service.from('notifications_log').delete().eq('order_id', orderId)

  const { error: deleteError } = await service.from('orders').delete().eq('id', orderId).eq('tenant_id', tenantId)
  if (deleteError) {
    return NextResponse.json({ error: 'No se pudo eliminar el pedido: ' + deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { customerId } = await req.json()
  if (!customerId) return NextResponse.json({ error: 'Falta customerId' }, { status: 400 })

  const service = createServiceClient()

  const { data: _userRows } = await service.from('users').select('tenant_id').eq('id', user.id).limit(1)
  const tenantId = _userRows?.[0]?.tenant_id
  if (!tenantId) return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 })

  // Verificar que el cliente pertenece al tenant del usuario
  const { data: customer } = await service.from('customers')
    .select('id, tenant_id')
    .eq('id', customerId).eq('tenant_id', tenantId).limit(1)
  if (!customer?.[0]) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  // No permitir borrar clientes con pedidos asociados (evita romper el historial
  // de pedidos y posibles errores de foreign key)
  const { count } = await service.from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customerId)
  if (count && count > 0) {
    return NextResponse.json({
      error: `Este cliente tiene ${count} pedido${count > 1 ? 's' : ''} asociado${count > 1 ? 's' : ''}. Eliminá primero sus pedidos desde la sección Pedidos.`,
    }, { status: 409 })
  }

  const { error: deleteError } = await service.from('customers').delete().eq('id', customerId).eq('tenant_id', tenantId)
  if (deleteError) {
    return NextResponse.json({ error: 'No se pudo eliminar el cliente: ' + deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

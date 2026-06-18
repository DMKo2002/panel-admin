import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  try {
    // Verify the user is authenticated and belongs to the same tenant as the order
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
    if (!userRow?.tenant_id) return NextResponse.json({ error: 'Sin tenant' }, { status: 403 })

    const { order_id } = await req.json()
    if (!order_id) return NextResponse.json({ error: 'order_id requerido' }, { status: 400 })

    const service = createServiceClient()

    // Verify the order belongs to this tenant
    const { data: order } = await service.from('orders').select('id, tenant_id, payment_status').eq('id', order_id).single()
    if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    if (order.tenant_id !== userRow.tenant_id) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

    // Mark as paid + confirm the order
    const { error } = await service.from('orders').update({
      payment_status: 'paid',
      status: 'confirmed',
    }).eq('id', order_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

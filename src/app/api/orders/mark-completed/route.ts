import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Marca un pedido como 'delivered' ("Completado" en la tabla de Pedidos).
// A diferencia de UpdateOrderStatusButton (shipped/ready_pickup), esta es
// una acción interna rápida sin mail al cliente — mismo patrón que
// mark-paid/route.ts. Pedido por Yenine 2026-08-04.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: _userRows } = await supabase.from('users').select('tenant_id').eq('id', user.id).limit(1)
    const userRow = _userRows?.[0]
    if (!userRow?.tenant_id) return NextResponse.json({ error: 'Sin tenant' }, { status: 403 })

    const { order_id } = await req.json()
    if (!order_id) return NextResponse.json({ error: 'order_id requerido' }, { status: 400 })

    const service = createServiceClient()

    const { data: order } = await service
      .from('orders')
      .select('id, tenant_id, status')
      .eq('id', order_id)
      .single()

    if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    if (order.tenant_id !== userRow.tenant_id) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

    if (order.status === 'delivered') {
      return NextResponse.json({ ok: true, already_completed: true })
    }
    if (order.status === 'cancelled') {
      return NextResponse.json({ error: 'No se puede completar un pedido cancelado' }, { status: 400 })
    }

    const { error: updateErr } = await service.from('orders').update({
      status: 'delivered',
    }).eq('id', order_id)

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

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
      .select('id, tenant_id, payment_status')
      .eq('id', order_id)
      .single()

    if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    if (order.tenant_id !== userRow.tenant_id) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

    if (order.payment_status === 'paid') {
      return NextResponse.json({ ok: true, already_paid: true })
    }

    const { error: updateErr } = await service.from('orders').update({
      payment_status: 'paid',
      status: 'confirmed',
    }).eq('id', order_id)

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    const { data: items } = await service
      .from('order_items')
      .select('variant_id, quantity')
      .eq('order_id', order_id)

    if (items && items.length > 0) {
      for (const item of items) {
        if (!item.variant_id || !item.quantity) continue
        const { data: variant } = await service
          .from('variants')
          .select('stock')
          .eq('id', item.variant_id)
          .single()
        if (variant != null) {
          const newStock = Math.max(0, (variant.stock ?? 0) - item.quantity)
          await service.from('variants').update({ stock: newStock }).eq('id', item.variant_id)
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(req: NextRequest) {
  // Verificar sesión
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: _userRows } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).limit(1)
  const userRow = _userRows?.[0]
  if (!userRow?.tenant_id) return NextResponse.json({ error: 'Sin tenant' }, { status: 403 })

  const orderId = req.nextUrl.searchParams.get('order_id')
  if (!orderId) return NextResponse.json({ error: 'order_id requerido' }, { status: 400 })

  const service = createServiceClient()

  const { data: order, error } = await service
    .from('orders')
    .select(`
      id, total, subtotal, shipping_total, payment_method, payment_status,
      status, created_at, notes, shipping_method_label,
      shipping_address_street, shipping_address_city, shipping_address_province, shipping_address_zip,
      customers (full_name, last_name, email, phone, address_street, address_city, address_province),
      order_items (id, product_name, variant_desc, quantity, unit_price)
    `)
    .eq('id', orderId)
    .eq('tenant_id', userRow.tenant_id)
    .single()

  if (error || !order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

  return NextResponse.json(order)
}

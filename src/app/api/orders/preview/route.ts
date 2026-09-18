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
      id, total, subtotal, shipping_cost, payment_method, payment_status,
      status, created_at, notes, shipping_method, shipping_address,
      customers (full_name, last_name, email, phone, address_street, address_city, address_province),
      order_items (id, variant_id, product_name, variant_desc, quantity, unit_price)
    `)
    .eq('id', orderId)
    .eq('tenant_id', userRow.tenant_id)
    .single()

  if (error || !order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

  // Las columnas reales son shipping_cost/shipping_method/shipping_address (jsonb) —
  // se aplanan acá para no romper a los consumidores que esperan los campos
  // sueltos (shipping_total, shipping_method_label, shipping_address_*).
  const addr = (order as any).shipping_address ?? {}
  const flattened = {
    ...order,
    shipping_total: (order as any).shipping_cost ?? null,
    shipping_method_label: addr.method_name ?? (order as any).shipping_method ?? null,
    shipping_address_street: addr.street ?? null,
    shipping_address_city: addr.city ?? null,
    shipping_address_province: addr.province ?? null,
    shipping_address_zip: addr.zip ?? null,
  }

  return NextResponse.json(flattened)
}

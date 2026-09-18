import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail, emailPedidoModificado } from '@creart/tienda-core/email'
import { generateReciboPdfBuffer } from '@/lib/generateReciboPdf'

// Tercera opción del botón "Notificar" (junto a "Pedido enviado" y "Listo
// para retirar"): avisa al cliente el cambio ya guardado en el pedido, con
// el recibo actualizado adjunto. Solo tiene sentido si hubo una edición
// real después del último aviso — el front-end ya deshabilita el botón en
// ese caso, pero igual lo validamos acá.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: _userRows } = await supabase.from('users').select('tenant_id').eq('id', user.id).limit(1)
    const userRow = _userRows?.[0]
    if (!userRow?.tenant_id) return NextResponse.json({ error: 'Sin tenant' }, { status: 403 })

    const { orderId } = await req.json()
    if (!orderId) return NextResponse.json({ error: 'orderId requerido' }, { status: 400 })

    const service = createServiceClient()

    const { data: order } = await service
      .from('orders')
      .select('*, customers(full_name, email), order_items(*)')
      .eq('id', orderId)
      .eq('tenant_id', userRow.tenant_id)
      .single()

    if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    if (!order.items_edited_at) {
      return NextResponse.json({ error: 'Este pedido no tiene cambios pendientes de avisar' }, { status: 400 })
    }
    if (!order.customers?.email) {
      return NextResponse.json({ error: 'El pedido no tiene email de cliente' }, { status: 400 })
    }

    const { data: tenant } = await service.from('tenants').select('name').eq('id', order.tenant_id).single()
    const { data: config } = await service.from('store_config')
      .select('email_from_name')
      .eq('tenant_id', order.tenant_id)
      .single()

    const storeName = tenant?.name ?? 'Tienda'
    const addr = (order.shipping_address ?? {}) as any

    const html = emailPedidoModificado({
      storeName,
      orderId,
      customerName: order.customers.full_name ?? 'Cliente',
      items: (order.order_items ?? []).map((it: any) => ({
        productName: it.product_name,
        variantDesc: it.variant_desc ?? null,
        quantity: it.quantity,
        unitPrice: it.unit_price,
      })),
      subtotal: order.subtotal ?? 0,
      shippingCost: order.shipping_cost ?? 0,
      shippingPriceOnRequest: addr.price_on_request ?? false,
      total: order.total ?? 0,
      shippingLabel: addr.method_name ?? order.shipping_method ?? 'Envío',
    })

    const pdfBuffer = await generateReciboPdfBuffer(orderId).catch(() => null)
    const subject = `Actualizamos tu pedido — ${storeName}`

    const { ok: emailOk } = await sendEmail({
      to: order.customers.email,
      subject,
      html,
      fromName: (config as any)?.email_from_name ?? storeName,
      attachments: pdfBuffer ? [{ filename: `recibo-${orderId.slice(0, 6)}.pdf`, content: pdfBuffer }] : undefined,
    })

    await service.from('notifications_log').insert({
      tenant_id: order.tenant_id,
      order_id: orderId,
      channel: 'email',
      recipient: order.customers.email,
      subject,
      status: emailOk ? 'sent' : 'failed',
    })

    if (emailOk) {
      await service.from('orders').update({ items_edit_notified_at: new Date().toISOString() }).eq('id', orderId)
    }

    return NextResponse.json({ ok: emailOk })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenant_id = searchParams.get('tenant_id')
    const body = await req.json()

    console.log('Webhook MP recibido:', JSON.stringify(body))

    // MP envía distintos tipos de notificaciones
    if (body.type !== 'payment') {
      return NextResponse.json({ ok: true })
    }

    const payment_id = body.data?.id
    if (!payment_id) {
      return NextResponse.json({ ok: true })
    }

    // Este webhook lo llama Mercado Pago directamente — no hay sesión de usuario,
    // por lo tanto no hay forma de que el cliente anon pase RLS en `orders`,
    // `variants` u `order_items` (que no tienen policy pública de escritura).
    // Con el cliente anon estas escrituras fallaban en silencio (0 filas
    // afectadas, sin error) — el pedido nunca quedaba marcado como pagado.
    const supabase = createServiceClient()

    // Obtener token del tenant
    let accessToken = process.env.MP_ACCESS_TOKEN!
    let ignoreStock = false
    if (tenant_id) {
      const { data: cfg } = await supabase
        .from('store_config')
        .select('mp_access_token, ignore_stock')
        .eq('tenant_id', tenant_id)
        .single()
      if (cfg?.mp_access_token) accessToken = cfg.mp_access_token
      ignoreStock = (cfg as any)?.ignore_stock ?? false
    }

    // Consultar el pago a MP
    const client = new MercadoPagoConfig({ accessToken })
    const paymentClient = new Payment(client)
    const payment = await paymentClient.get({ id: payment_id })

    console.log('Pago MP:', payment.status, payment.external_reference)

    const order_id = payment.external_reference
    if (!order_id) return NextResponse.json({ ok: true })

    // Actualizar estado del pedido según el pago
    if (payment.status === 'approved') {
      // Chequear estado actual antes de tocar nada — MP puede reenviar el
      // mismo webhook más de una vez, y no queremos descontar stock dos veces
      // para el mismo pago.
      const { data: existingOrder } = await supabase
        .from('orders')
        .select('payment_status')
        .eq('id', order_id)
        .single()

      const alreadyPaid = existingOrder?.payment_status === 'paid'

      await supabase
        .from('orders')
        .update({
          payment_status: 'paid',
          status: 'confirmed',
          mp_payment_id: String(payment_id),
        })
        .eq('id', order_id)

      if (!alreadyPaid && !ignoreStock) {
        // Descuento de stock — mismo criterio que /api/mark-paid y transferMatch.ts
        const { data: items } = await supabase
          .from('order_items')
          .select('variant_id, quantity')
          .eq('order_id', order_id)

        if (items) {
          for (const item of items) {
            if (!item.variant_id || !item.quantity) continue
            const { data: variant } = await supabase
              .from('variants')
              .select('stock')
              .eq('id', item.variant_id)
              .single()
            if (variant != null) {
              const newStock = Math.max(0, (variant.stock ?? 0) - item.quantity)
              await supabase.from('variants').update({ stock: newStock }).eq('id', item.variant_id)
            }
          }
        }
      }

      // Registrar en notifications_log
      if (tenant_id) {
        await supabase.from('notifications_log').insert({
          tenant_id,
          order_id,
          channel: 'whatsapp',
          recipient: 'pendiente',
          subject: `Pago aprobado - Pedido ${order_id.slice(0, 6)}`,
          status: 'pending',
        })
      }

      console.log(`Pedido ${order_id} marcado como pagado`)
    }

    if (payment.status === 'rejected' || payment.status === 'cancelled') {
      await supabase
        .from('orders')
        .update({ payment_status: 'failed' })
        .eq('id', order_id)
    }

    if (payment.status === 'in_process' || payment.status === 'pending') {
      await supabase
        .from('orders')
        .update({ payment_status: 'pending' })
        .eq('id', order_id)
    }

    return NextResponse.json({ ok: true })

  } catch (error: any) {
    console.error('Error en webhook MP:', error)
    // Siempre retornar 200 a MP para que no reintente
    return NextResponse.json({ ok: true })
  }
}

// MP también hace GET para verificar el endpoint
export async function GET() {
  return NextResponse.json({ ok: true })
}

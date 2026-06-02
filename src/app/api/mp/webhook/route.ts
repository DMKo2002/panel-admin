import { NextRequest, NextResponse } from 'next/server'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { createClient } from '@/lib/supabase/server'

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

    const supabase = await createClient()

    // Obtener token del tenant
    let accessToken = process.env.MP_ACCESS_TOKEN!
    if (tenant_id) {
      const { data: cfg } = await supabase
        .from('store_config')
        .select('mp_access_token')
        .eq('tenant_id', tenant_id)
        .single()
      if (cfg?.mp_access_token) accessToken = cfg.mp_access_token
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
      await supabase
        .from('orders')
        .update({
          payment_status: 'paid',
          status: 'confirmed',
          mp_payment_id: String(payment_id),
        })
        .eq('id', order_id)

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

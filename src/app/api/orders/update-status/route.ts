import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail, emailPedidoEnviado } from '@creart/tienda-core/email'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { orderId, status, trackingCode } = await req.json()
  // status: 'shipped' | 'ready_pickup'
  if (!orderId || !['shipped', 'ready_pickup'].includes(status)) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }

  const service = createServiceClient()

  // Verificar que el pedido pertenece al tenant del usuario
  const { data: _userRows } = await supabase.from('users').select('tenant_id').eq('id', user.id).limit(1)
  const userRow = _userRows?.[0]
  const { data: order } = await service.from('orders')
    .select('*, customers(full_name, email)')
    .eq('id', orderId).eq('tenant_id', userRow?.tenant_id).single()

  if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

  // Actualizar estado
  await service.from('orders').update({
    status,
    ...(trackingCode ? { tracking_code: trackingCode } : {}),
  }).eq('id', orderId)

  // Enviar email al cliente
  const { data: tenant } = await service.from('tenants').select('name').eq('id', order.tenant_id).single()
  const { data: config } = await service.from('store_config')
    .select('notification_email, email_from_name, email_intro_pedido_enviado')
    .eq('tenant_id', order.tenant_id).single()

  const cfg = config as any
  const customerEmail = order.customers?.email
  const customerName  = order.customers?.full_name ?? 'Cliente'
  const storeName     = tenant?.name ?? 'Tienda'

  if (customerEmail) {
    const tipo = status === 'shipped' ? 'enviado' : 'listo_retiro'
    const subject = tipo === 'enviado'
      ? `Tu pedido está en camino — ${storeName}`
      : `Tu pedido está listo para retirar — ${storeName}`
    const html = emailPedidoEnviado({
      storeName, orderId, customerName, tipo,
      trackingCode: trackingCode ?? null,
      customIntro: cfg?.email_intro_pedido_enviado ?? null,
    })
    const { ok: emailOk } = await sendEmail({
      to: customerEmail,
      subject,
      html,
      fromName: cfg?.email_from_name ?? storeName,
    })
    await service.from('notifications_log').insert({
      tenant_id: order.tenant_id,
      order_id: orderId,
      channel: 'email',
      recipient: customerEmail,
      subject,
      status: emailOk ? 'sent' : 'failed',
    })
  }

  return NextResponse.json({ ok: true })
}

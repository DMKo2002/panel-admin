import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const RESEND_API_URL = 'https://api.resend.com/emails'

async function sendEmail({ to, subject, html, fromName }: { to: string; subject: string; html: string; fromName?: string }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return
  const sender = fromName ? `${fromName} <${process.env.EMAIL_FROM ?? 'onboarding@resend.dev'}>` : (process.env.EMAIL_FROM ?? 'onboarding@resend.dev')
  await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: sender, to, subject, html }),
  }).catch(console.error)
}

function emailEnviado({ storeName, orderId, customerName, tipo, trackingCode, customIntro }: {
  storeName: string; orderId: string; customerName: string
  tipo: 'enviado' | 'listo_retiro'; trackingCode?: string | null; customIntro?: string | null
}) {
  const shortId = orderId.slice(0, 8).toUpperCase()
  const isEnvio = tipo === 'enviado'
  const titulo = isEnvio ? 'Tu pedido está en camino' : 'Tu pedido está listo para retirar'
  const icono = isEnvio ? '📦' : '🏪'
  const defaultIntro = isEnvio
    ? 'Tu pedido fue despachado y está en camino. Pronto lo recibís en la dirección indicada.'
    : 'Tu pedido ya está listo para retirar en nuestro local. Pasá cuando quieras.'

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f4f1;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4f1;padding:40px 16px;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;">
  <tr><td style="background:#1c1c1c;padding:32px;text-align:center;">
    <p style="margin:0;color:#fff;font-size:20px;letter-spacing:5px;font-weight:300;">${storeName.toUpperCase()}</p>
  </td></tr>
  <tr><td style="padding:40px 40px 32px;">
    <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#aaa;">${icono} ${isEnvio ? 'Pedido enviado' : 'Listo para retirar'}</p>
    <h1 style="margin:0 0 6px;font-size:28px;font-weight:300;color:#1c1c1c;">${titulo}</h1>
    <p style="margin:0 0 28px;font-size:13px;color:#aaa;letter-spacing:1px;">Pedido #${shortId} · ${customerName.split(' ')[0]}</p>
    <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.7;">${customIntro ?? defaultIntro}</p>
    ${trackingCode ? `<div style="background:#f7f4f1;padding:14px 18px;margin-bottom:20px;">
      <p style="margin:0 0 4px;font-size:11px;color:#aaa;letter-spacing:1px;text-transform:uppercase;">Código de seguimiento</p>
      <p style="margin:0;font-size:16px;font-weight:600;color:#1c1c1c;letter-spacing:2px;">${trackingCode}</p>
    </div>` : ''}
  </td></tr>
  <tr><td style="padding:24px;text-align:center;border-top:1px solid #ede8e3;">
    <p style="margin:0;font-size:12px;color:#bbb;letter-spacing:1px;">${storeName.toUpperCase()} · GRACIAS POR TU COMPRA</p>
  </td></tr>
</table></td></tr></table></body></html>`
}

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
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
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
    const html = emailEnviado({
      storeName, orderId, customerName, tipo,
      trackingCode: trackingCode ?? null,
      customIntro: cfg?.email_intro_pedido_enviado ?? null,
    })
    await sendEmail({
      to: customerEmail,
      subject: tipo === 'enviado'
        ? `Tu pedido está en camino — ${storeName}`
        : `Tu pedido está listo para retirar — ${storeName}`,
      html,
      fromName: cfg?.email_from_name ?? storeName,
    })
  }

  return NextResponse.json({ ok: true })
}

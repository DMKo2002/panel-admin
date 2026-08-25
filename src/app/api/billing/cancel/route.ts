// POST /api/billing/cancel — "dar de baja del servicio".
//
// Cancela el preapproval de Mercado Pago del tenant (no le vuelven a
// cobrar), pero NO baja el plan al instante: el servicio sigue activo hasta
// next_billing_date (lo que ya pagó), igual que la promesa que ya hace
// gounuri-web/perfil/plan/PlanSelector.tsx ("tenés total libertad para
// cancelar cuando quieras"). El cron /api/cron/enforce (sección 5) es quien
// baja el plan a gratis cuando llega esa fecha — acá solo se marca la
// intención con billing_paused_by_user, para que ese vencimiento no se
// confunda con un cobro fallido (que sí dispara avisos).
//
// No reactiva solo: volver a suscribirse después de cancelar es un
// preapproval nuevo, con una autorización nueva (ver /api/billing/subscribe)
// — MP no permite reanudar un preapproval ya cancelado.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { cancelPreapproval, billingEnabled } from '@/lib/billing'
import { getPlatformPaymentSettings } from '@/lib/platformBilling'
import { sendEmail, emailBajaConfirmada } from '@/lib/email'

export async function POST(req: Request) {
  if (!billingEnabled()) {
    return NextResponse.json({ error: 'La facturación todavía no está habilitada' }, { status: 403 })
  }

  // Motivo opcional de baja (2026-08-25, ver billing_cancellation_feedback) —
  // req.json() puede fallar si viene sin body (por compatibilidad con
  // llamadas viejas que no lo mandaban), por eso el catch a string vacío.
  const { reason } = await req.json().catch(() => ({ reason: undefined as string | undefined }))

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const service = createServiceClient()
  const { data: _rows } = await service.from('users').select('tenant_id, role').eq('id', user.id).limit(1)
  const userRow = _rows?.[0]
  if (!userRow?.tenant_id) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
  if (userRow.role === 'staff') return NextResponse.json({ error: 'Solo el owner puede dar de baja el plan' }, { status: 403 })
  const tenantId = userRow.tenant_id

  // Aislamiento (2026-08-25) — ver /api/billing/subscribe y memoria de
  // proyecto "Gounuri billing/subscriptions".
  const { data: _tenantRows } = await service
    .from('tenants').select('legacy_manual_billing, mp_preapproval_id, next_billing_date').eq('id', tenantId).limit(1)
  const tenantRow = _tenantRows?.[0]
  if (tenantRow?.legacy_manual_billing) {
    return NextResponse.json(
      { error: 'Tu plan lo gestiona el equipo de Gounuri directamente — escribinos para darlo de baja.' },
      { status: 403 }
    )
  }
  if (!tenantRow?.mp_preapproval_id) {
    return NextResponse.json({ error: 'No tenés una suscripción de Mercado Pago activa para dar de baja.' }, { status: 400 })
  }

  try {
    await cancelPreapproval(tenantRow.mp_preapproval_id)
  } catch (e) {
    console.error('[billing/cancel]', e)
    return NextResponse.json({ error: 'No se pudo dar de baja la suscripción. Probá de nuevo.' }, { status: 500 })
  }

  await service.from('tenants').update({
    mp_preapproval_id: null,
    billing_paused_by_user: true,
  }).eq('id', tenantId)

  // Mails de baja (2026-08-25, pedido de David/Aram — hasta acá esta acción
  // no avisaba a nadie). Best-effort: un mail que falla no debe romper la
  // baja, que ya se procesó bien contra MP y la base.
  const activeUntil = tenantRow.next_billing_date ?? null
  const { data: tenantNameRow } = await service.from('tenants').select('name').eq('id', tenantId).limit(1).single()
  const tenantName = tenantNameRow?.name ?? tenantId

  if (typeof reason === 'string' && reason.trim()) {
    await service.from('billing_cancellation_feedback').insert({
      tenant_id: tenantId,
      tenant_name: tenantName,
      reason: reason.trim().slice(0, 2000),
    }).then(({ error }) => {
      if (error) console.error('[billing/cancel] error guardando motivo de baja:', error)
    })
  }

  if (user.email) {
    await sendEmail({
      to: user.email,
      subject: `Diste de baja tu plan — gounuri`,
      html: emailBajaConfirmada({ tenantName, activeUntil, panelUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://panel.gounuri.com' }),
    }).catch(e => console.error('[billing/cancel] error notificando al tenant:', e))
  }
  const settings = await getPlatformPaymentSettings(service)
  await sendEmail({
    to: settings.contactEmail,
    subject: `📉 Baja de suscripción — ${tenantName}`,
    html: `<p><strong>${tenantName}</strong> dio de baja su suscripción de Mercado Pago.</p><p>Sigue con acceso hasta: ${activeUntil ?? '(sin fecha registrada)'}</p>`,
  }).catch(e => console.error('[billing/cancel] error notificando a Gounuri:', e))

  return NextResponse.json({ ok: true, activeUntil })
}

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
import { cancelPreapproval } from '@/lib/billing'
import { getPlatformPaymentSettings } from '@/lib/platformBilling'
import { sendEmail, emailBajaConfirmada } from '@/lib/email'

export async function POST(req: Request) {
  const service = createServiceClient()

  // Gate movido de BILLING_ENABLED (env var) a platform_billing_settings
  // (2026-08-26, mismo criterio que gounuri-web desde el 2026-08-22) -- esta
  // ruta era código muerto hasta ahora, la activa por primera vez
  // /dashboard/suscripcion.
  const paymentSettings = await getPlatformPaymentSettings(service)
  if (!paymentSettings.mercadopagoEnabled) {
    return NextResponse.json({ error: 'El pago con Mercado Pago todavía no está habilitado' }, { status: 403 })
  }

  // Motivo opcional de baja (2026-08-26, mismo criterio que gounuri-web
  // desde el 2026-08-25 -- ver billing_cancellation_feedback) -- no bloquea
  // la baja si se deja vacío. category = opción elegida en el multiple
  // choice (muy_caro/no_me_gusto/solo_probando/otro, ver
  // SuscripcionSelector.tsx); reason = el texto libre opcional que se
  // muestra solo para algunas opciones.
  const CATEGORIES = ['muy_caro', 'no_me_gusto', 'solo_probando', 'otro']
  const { reason, category } = await req.json().catch(() => ({
    reason: undefined as string | undefined,
    category: undefined as string | undefined,
  }))
  const validCategory = typeof category === 'string' && CATEGORIES.includes(category) ? category : undefined

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: _rows } = await service.from('users').select('tenant_id, role').eq('id', user.id).limit(1)
  const userRow = _rows?.[0]
  if (!userRow?.tenant_id) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
  if (userRow.role === 'staff') return NextResponse.json({ error: 'Solo el owner puede dar de baja el plan' }, { status: 403 })
  const tenantId = userRow.tenant_id

  // Aislamiento (2026-08-25) — ver /api/billing/subscribe y memoria de
  // proyecto "Gounuri billing/subscriptions".
  const { data: _tenantRows } = await service
    .from('tenants').select('legacy_manual_billing, mp_preapproval_id, next_billing_date, manual_paid_until').eq('id', tenantId).limit(1)
  const tenantRow = _tenantRows?.[0]
  if (tenantRow?.legacy_manual_billing) {
    return NextResponse.json(
      { error: 'Tu plan lo gestiona el equipo de Gounuri directamente — escribinos para darlo de baja.' },
      { status: 403 }
    )
  }
  const hasMp = !!tenantRow?.mp_preapproval_id
  // Pago manual (transferencia, confirmado por superadmin en mark-plan-paid)
  // (2026-08-27, bug reportado por David: el botón "Cancelar suscripción"
  // estaba oculto para estos tenants porque acá abajo siempre devolvía 400).
  // No hay nada que cancelar en MP -- el pago manual nunca se auto-renueva
  // solo, así que "cancelar" acá es solo dejar constancia (feedback/mail) y
  // no volver a marcarlo como pagado; el acceso sigue igual hasta
  // manual_paid_until, lo mismo que ya promete el flujo de MP.
  const hasManual = !!tenantRow?.manual_paid_until
  if (!hasMp && !hasManual) {
    return NextResponse.json({ error: 'No tenés una suscripción activa para dar de baja.' }, { status: 400 })
  }

  if (hasMp) {
    try {
      await cancelPreapproval(tenantRow.mp_preapproval_id)
    } catch (e) {
      console.error('[billing/cancel]', e)
      return NextResponse.json({ error: 'No se pudo dar de baja la suscripción. Probá de nuevo.' }, { status: 500 })
    }
  }

  await service.from('tenants').update({
    ...(hasMp ? { mp_preapproval_id: null } : {}),
    billing_paused_by_user: true,
  }).eq('id', tenantId)

  // Mails de baja (2026-08-26, bug detectado por David en QA: esta ruta -- la
  // que realmente usa SuscripcionSelector.tsx desde que "cancelar
  // suscripción" se centralizó acá -- no avisaba a nadie, ni al tenant ni a
  // Gounuri; el mismo aviso ya existía en gounuri-web/api/billing/cancel
  // pero esa ruta quedó sin uso). Best-effort: la baja ya se procesó bien
  // contra MP y la base, un mail que falla no debe romperla.
  const activeUntil = tenantRow.manual_paid_until ?? tenantRow.next_billing_date ?? null
  const { data: tenantNameRow } = await service.from('tenants').select('name').eq('id', tenantId).limit(1).single()
  const tenantName = tenantNameRow?.name ?? tenantId

  if (validCategory || (typeof reason === 'string' && reason.trim())) {
    await service.from('billing_cancellation_feedback').insert({
      tenant_id: tenantId,
      tenant_name: tenantName,
      category: validCategory ?? null,
      reason: typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 2000) : null,
    }).then(({ error }) => {
      if (error) console.error('[billing/cancel] error guardando motivo de baja:', error)
    })
  }

  if (user.email) {
    await sendEmail({
      to: user.email,
      subject: 'Diste de baja tu plan — gounuri',
      html: emailBajaConfirmada({ tenantName, activeUntil, panelUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://panel.gounuri.com' }),
    }).catch(e => console.error('[billing/cancel] error notificando al tenant:', e))
  }
  await sendEmail({
    to: paymentSettings.contactEmail,
    subject: `📉 Baja de suscripción — ${tenantName}`,
    html: `<p><strong>${tenantName}</strong> dio de baja su suscripción${hasMp ? ' de Mercado Pago' : ' (pago manual/transferencia)'}.</p><p>Sigue con acceso hasta: ${activeUntil ?? '(sin fecha registrada)'}</p>`,
  }).catch(e => console.error('[billing/cancel] error notificando a Gounuri:', e))

  return NextResponse.json({ ok: true, activeUntil })
}

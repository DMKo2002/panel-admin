// GET /api/cron/billing-recurring — corre 1 vez por día (Vercel Cron, ver
// vercel.json). Cobra el mes a los tenants que eligieron pagar con "tarjeta
// directa" (billing_method = 'brick', tarjeta guardada — ver
// api/billing/card/setup) en vez de Preapproval de Mercado Pago.
//
// Reintentos: si un cobro falla, se reintenta a los 3 días. Después de 3
// intentos fallidos (~9 días) se suspende la tienda, mismo mecanismo que usa
// /api/cron/enforce para trial vencido o exceso de cupo.
//
// Seguridad: exige el header Authorization: Bearer ${CRON_SECRET}.

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { chargeSavedCard } from '@/lib/billing-card'
import { PLANS, type PlanDef } from '@/lib/plans'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const PANEL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://panel.gounuri.com'
const MAX_RETRIES = 3
const RETRY_DAYS = 3

async function ownerEmail(service: ReturnType<typeof createServiceClient>, tenantId: string): Promise<string | null> {
  const { data } = await service.from('users').select('email').eq('tenant_id', tenantId).eq('role', 'owner').limit(1)
  return data?.[0]?.email ?? null
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const service = createServiceClient()
  const now = new Date()
  const acciones: string[] = []

  const { data: due } = await service
    .from('tenant_billing_card')
    .select('tenant_id, mp_customer_id, mp_card_id, plan_id, retry_count')
    .eq('billing_method', 'brick')
    .not('mp_customer_id', 'is', null)
    .not('mp_card_id', 'is', null)
    .lte('next_charge_at', now.toISOString())

  for (const row of due ?? []) {
    const planId = row.plan_id as PlanDef['id']
    if (!(planId in PLANS) || planId === 'free') continue

    const { data: tenantRows } = await service.from('tenants').select('id, name').eq('id', row.tenant_id).limit(1)
    const tenant = tenantRows?.[0]
    if (!tenant) continue

    const email = await ownerEmail(service, row.tenant_id)
    if (!email) { acciones.push(`sin email de owner, salteado: ${tenant.name}`); continue }

    const charge = await chargeSavedCard({
      tenantId: row.tenant_id,
      customerId: row.mp_customer_id,
      cardId: row.mp_card_id,
      planId: planId as Exclude<PlanDef['id'], 'free'>,
      email,
    })

    await service.from('billing_charges').insert({
      tenant_id: row.tenant_id,
      amount: PLANS[planId].precioARS,
      status: charge.status,
      status_detail: charge.statusDetail ?? null,
      mp_payment_id: charge.paymentId ?? null,
    })

    if (charge.ok) {
      const nextCharge = new Date(now)
      nextCharge.setMonth(nextCharge.getMonth() + 1)
      await service.from('tenant_billing_card').update({
        next_charge_at: nextCharge.toISOString(),
        retry_count: 0,
        last_charge_status: 'approved',
        last_charge_at: now.toISOString(),
        updated_at: now.toISOString(),
      }).eq('tenant_id', row.tenant_id)

      await service.from('tenants').update({ plan_status: 'active' }).eq('id', row.tenant_id)
      await service.from('tenants')
        .update({ status: 'active', suspended_reason: null })
        .eq('id', row.tenant_id)
        .eq('suspended_reason', 'payment_failed')

      acciones.push(`cobrado ok: ${tenant.name}`)
      continue
    }

    // Falló el cobro
    const retryCount = (row.retry_count ?? 0) + 1
    if (retryCount <= MAX_RETRIES) {
      const nextRetry = new Date(now)
      nextRetry.setDate(nextRetry.getDate() + RETRY_DAYS)
      await service.from('tenant_billing_card').update({
        next_charge_at: nextRetry.toISOString(),
        retry_count: retryCount,
        last_charge_status: charge.status,
        updated_at: now.toISOString(),
      }).eq('tenant_id', row.tenant_id)
      await service.from('tenants').update({ plan_status: 'past_due' }).eq('id', row.tenant_id)
      acciones.push(`cobro falló (intento ${retryCount}/${MAX_RETRIES}): ${tenant.name}`)

      await sendEmail({
        to: email,
        subject: `No pudimos procesar el pago de tu plan — gounuri`,
        html: `
          <h2>Tu pago no pudo procesarse</h2>
          <p>Intentamos cobrar tu plan con la tarjeta guardada y no se pudo aprobar. Vamos a reintentar en ${RETRY_DAYS} días.</p>
          <p>Si querés evitar cualquier corte, actualizá tu tarjeta ahora:</p>
          <p><a href="${PANEL}/dashboard/uso">Actualizar método de pago</a></p>
        `,
      }).catch(() => {})
    } else {
      await service.from('tenant_billing_card').update({
        retry_count: retryCount,
        last_charge_status: charge.status,
        updated_at: now.toISOString(),
      }).eq('tenant_id', row.tenant_id)
      await service.from('tenants').update({
        plan_status: 'past_due',
        status: 'suspended',
        suspended_reason: 'payment_failed',
      }).eq('id', row.tenant_id)
      acciones.push(`suspendido payment_failed: ${tenant.name}`)

      await sendEmail({
        to: email,
        subject: `Tu tienda ${tenant.name} fue suspendida — no pudimos cobrar tu plan — gounuri`,
        html: `
          <h2>Tu tienda fue suspendida</h2>
          <p>Después de ${MAX_RETRIES} intentos no pudimos cobrar tu plan con la tarjeta guardada.</p>
          <p><strong>Tus datos y tu catálogo están intactos.</strong> Actualizá tu método de pago y la tienda vuelve a estar online al instante:</p>
          <p><a href="${PANEL}/dashboard/uso">Actualizar método de pago</a></p>
        `,
      }).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true, acciones })
}

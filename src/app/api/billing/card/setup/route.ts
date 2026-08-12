// POST /api/billing/card/setup — alternativa a /api/billing/subscribe que no
// pasa por el checkout alojado de Mercado Pago (Preapproval). El tenant
// tokeniza su tarjeta acá mismo con el Card Payment Brick (sin necesitar
// cuenta de MP) y esta ruta guarda la tarjeta y cobra el primer mes.
//
// Body: { plan: 'mini'|'standard'|'premium', token, payment_method_id,
//          issuer_id?, payerEmail }
// El resto de los meses los cobra el cron /api/cron/billing-recurring
// reusando la tarjeta guardada (no hace falta volver a tokenizar).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { billingEnabled } from '@/lib/billing'
import { getOrCreateCustomer, saveCard, chargeSavedCard } from '@/lib/billing-card'
import { PLANS } from '@/lib/plans'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  if (!billingEnabled()) {
    return NextResponse.json({ error: 'La facturación todavía no está habilitada' }, { status: 403 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { plan, token, payerEmail: payerEmailInput } = await req.json()
  if (plan !== 'mini' && plan !== 'standard' && plan !== 'premium') {
    return NextResponse.json({ error: 'Plan inválido' }, { status: 400 })
  }
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Faltan datos de la tarjeta' }, { status: 400 })
  }
  const payerEmail = typeof payerEmailInput === 'string' && EMAIL_RE.test(payerEmailInput.trim())
    ? payerEmailInput.trim()
    : user.email

  const service = createServiceClient()
  const { data: _rows } = await service.from('users').select('tenant_id, role').eq('id', user.id).limit(1)
  const userRow = _rows?.[0]
  if (!userRow?.tenant_id) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
  if (userRow.role === 'staff') return NextResponse.json({ error: 'Solo el owner puede cambiar el plan' }, { status: 403 })
  const tenantId = userRow.tenant_id

  try {
    // 1. Customer + tarjeta guardada — reusa el customer si ya existe (ej: el
    // tenant había cargado una tarjeta antes y ahora la está reemplazando).
    const { data: existingRows } = await service
      .from('tenant_billing_card')
      .select('mp_customer_id')
      .eq('tenant_id', tenantId)
      .limit(1)
    const existingCustomerId = existingRows?.[0]?.mp_customer_id as string | undefined

    const customerId = existingCustomerId ?? await getOrCreateCustomer(payerEmail)
    const cardId = await saveCard(customerId, token)

    // 2. Cobro del primer mes, ahora mismo.
    const charge = await chargeSavedCard({ tenantId, customerId, cardId, planId: plan, email: payerEmail })

    await service.from('billing_charges').insert({
      tenant_id: tenantId,
      amount: PLANS[plan].precioARS,
      status: charge.status,
      status_detail: charge.statusDetail ?? null,
      mp_payment_id: charge.paymentId ?? null,
    })

    if (!charge.ok) {
      // Guardamos la tarjeta igual (para no pedirla de nuevo), pero no
      // activamos el plan hasta que un cobro salga aprobado.
      await service.from('tenant_billing_card').upsert({
        tenant_id: tenantId,
        mp_customer_id: customerId,
        mp_card_id: cardId,
        billing_method: 'brick',
        plan_id: plan,
        last_charge_status: charge.status,
        updated_at: new Date().toISOString(),
      })
      return NextResponse.json(
        { error: 'El pago no fue aprobado. Probá con otra tarjeta.', status: charge.status, statusDetail: charge.statusDetail },
        { status: 402 }
      )
    }

    const now = new Date()
    const nextCharge = new Date(now)
    nextCharge.setMonth(nextCharge.getMonth() + 1)

    await service.from('tenant_billing_card').upsert({
      tenant_id: tenantId,
      mp_customer_id: customerId,
      mp_card_id: cardId,
      billing_method: 'brick',
      plan_id: plan,
      next_charge_at: nextCharge.toISOString(),
      retry_count: 0,
      last_charge_status: 'approved',
      last_charge_at: now.toISOString(),
      updated_at: now.toISOString(),
    })

    // Mismo efecto que produce el webhook de Preapproval al autorizar.
    await service.from('tenants').update({
      plan,
      plan_status: 'active',
      over_limit_since: null,
      trial_ends_at: null,
      trial_warned_at: null,
      limit_warned_at: null,
    }).eq('id', tenantId)

    await service.from('tenants')
      .update({ status: 'active', suspended_reason: null })
      .eq('id', tenantId)
      .in('suspended_reason', ['trial_expired', 'over_limit', 'payment_failed'])

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[billing/card/setup]', e)
    return NextResponse.json({ error: 'No se pudo procesar el pago. Probá de nuevo.' }, { status: 500 })
  }
}

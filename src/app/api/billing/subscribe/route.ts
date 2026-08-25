// POST /api/billing/subscribe — inicia el upgrade de plan.
// Body: { plan: 'mini' | 'standard' | 'premium', months?: 1|6|12 }
// Devuelve { init_point } para redirigir al checkout de MP donde el tenant
// carga su tarjeta (el registro gratis nunca pide tarjeta — solo acá).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createPreapproval, cancelPreapproval, billingEnabled } from '@/lib/billing'
import { isBillingTerm, type BillingTerm } from '@/lib/plans'

// now + N meses de calendario (no N*30 días) — mismo criterio que
// mark-plan-paid/route.ts para next_billing_date.
function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

export async function POST(req: Request) {
  if (!billingEnabled()) {
    return NextResponse.json({ error: 'La facturación todavía no está habilitada' }, { status: 403 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { plan, payerEmail: payerEmailInput, months: monthsInput } = await req.json()
  if (plan !== 'mini' && plan !== 'standard' && plan !== 'premium') {
    return NextResponse.json({ error: 'Plan inválido' }, { status: 400 })
  }
  // Plazo de pago: 1 (mensual), 6 (-10%) o 12 (-20%) — default 1 si no viene
  // o viene algo raro, nunca romper la suscripción por esto.
  const months: BillingTerm = isBillingTerm(monthsInput) ? monthsInput : 1

  // El email que autoriza en MP no tiene por qué ser el email de login del
  // Panel Admin — son cosas distintas (ver incidente 2026-08-12: el owner
  // logueado con un email quería pagar con una cuenta de MP de otro email, y
  // MP rechazaba todo con "el email no coincide con el de la suscripción").
  // Por eso el frontend puede mandar el email real de la cuenta de MP que se
  // va a usar; si no lo manda, se cae al email de login como antes.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const payerEmail = typeof payerEmailInput === 'string' && EMAIL_RE.test(payerEmailInput.trim())
    ? payerEmailInput.trim()
    : user.email

  const service = createServiceClient()
  const { data: _rows } = await service.from('users').select('tenant_id, role').eq('id', user.id).limit(1)
  const userRow = _rows?.[0]
  if (!userRow?.tenant_id) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
  if (userRow.role === 'staff') return NextResponse.json({ error: 'Solo el owner puede cambiar el plan' }, { status: 403 })
  const tenantId = userRow.tenant_id

  // Aislamiento (2026-08-25): tenants legacy (pre-suscripciones) nunca deben
  // poder disparar un cobro real de Mercado Pago desde acá — ver memoria de
  // proyecto "Gounuri billing/subscriptions".
  const { data: _tenantRows } = await service
    .from('tenants').select('legacy_manual_billing, mp_preapproval_id').eq('id', tenantId).limit(1)
  const tenantRow = _tenantRows?.[0]
  if (tenantRow?.legacy_manual_billing) {
    return NextResponse.json(
      { error: 'Tu plan lo gestiona el equipo de Gounuri directamente — escribinos para cualquier cambio.' },
      { status: 403 }
    )
  }

  // Si ya tenía un preapproval activo (por ejemplo, está cambiando de plazo
  // mensual → anual), cancelarlo primero — si no, quedaría con dos débitos
  // automáticos corriendo en paralelo. Si la cancelación falla de verdad
  // (no solo "ya estaba cancelado"), mejor frenar acá que arriesgar el doble
  // cobro.
  if (tenantRow?.mp_preapproval_id) {
    try {
      await cancelPreapproval(tenantRow.mp_preapproval_id)
    } catch (e) {
      console.error('[billing/subscribe] no se pudo cancelar el preapproval anterior antes de crear uno nuevo', e)
      return NextResponse.json(
        { error: 'No se pudo actualizar tu suscripción anterior. Probá de nuevo en un momento.' },
        { status: 500 }
      )
    }
  }

  try {
    const origin = new URL(req.url).origin
    const preapproval = await createPreapproval({
      tenantId,
      planId: plan,
      payerEmail,
      backUrl: `${origin}/dashboard/uso?sub=pendiente`,
      months,
    })
    // Guardar ya mismo el plazo elegido y el id — el webhook confirma la
    // activación después y va a volver a escribir estos mismos campos (es
    // idempotente), pero así el tenant ve el plazo elegido de inmediato sin
    // esperar al webhook.
    const now = new Date()
    await service.from('tenants').update({
      mp_preapproval_id: preapproval.id,
      billing_term: months,
      next_billing_date: addMonths(now, months).toISOString(),
      billing_paused_by_user: false,
    }).eq('id', tenantId)
    return NextResponse.json({ init_point: preapproval.init_point })
  } catch (e) {
    console.error('[billing/subscribe]', e)
    return NextResponse.json({ error: 'No se pudo iniciar la suscripción. Probá de nuevo.' }, { status: 500 })
  }
}

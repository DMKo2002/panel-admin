// POST /api/billing/notify-manual-intent — dispara un mail a GOUNURI cuando
// alguien clickea "Escribir por WhatsApp" en /dashboard/suscripcion con el
// método de transferencia (ver SuscripcionSelector.tsx).
//
// Portado de gounuri-web/src/app/api/billing/notify-manual-intent/route.ts
// (2026-08-26, ver memoria de proyecto "Gounuri billing/subscriptions") —
// misma lógica, adaptada a que acá PLANS es un Record (no un array PLANES)
// y priceForTerm toma el PlanDef entero, no el planId.
//
// No depende de que el tenant realmente termine de mandar ese WhatsApp — es
// una notificación server-side aparte, para que quien esté del otro lado se
// entere igual aunque el tenant cierre la app sin llegar a enviarlo.
// Best-effort a propósito: nunca debe romper el click del botón, así que
// siempre devuelve 200 salvo que ni siquiera se pueda identificar al tenant.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPlatformPaymentSettings } from '@/lib/platformBilling'
import { sendEmail } from '@/lib/email'
import { PLANS, priceForTerm, isPlanId, isBillingTerm } from '@/lib/plans'

const TERM_LABEL: Record<number, string> = { 1: 'mensual', 6: 'semestral', 12: 'anual' }

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { plan, months, via } = await req.json().catch(() => ({}))
  if (!isPlanId(plan)) return NextResponse.json({ error: 'Plan inválido' }, { status: 400 })
  const term = isBillingTerm(months) ? months : 1

  const service = createServiceClient()
  const { data: _rows } = await service.from('users').select('tenant_id').eq('id', user.id).limit(1)
  const tenantId = _rows?.[0]?.tenant_id
  if (!tenantId) return NextResponse.json({ ok: true, ignored: 'sin tienda' })

  const { data: _tenants } = await service.from('tenants').select('name').eq('id', tenantId).limit(1)
  const tenantName = _tenants?.[0]?.name ?? tenantId

  const planDef = PLANS[plan]
  const nombrePlan = planDef.nombre
  const monto = priceForTerm(planDef, term)

  // "Pago a confirmar" (2026-08-22, ver gounuri-web) — deja rastro en el
  // tenant de que declaró intención de pago, para que /superadmin lo pueda
  // filtrar/mostrar en vez de que esto viva solo en un mail. Se limpia en
  // /api/superadmin/mark-plan-paid cuando se confirma que la plata llegó.
  // Best-effort: si falla, no debe romper el click del botón.
  await service.from('tenants').update({
    manual_payment_pending_at: new Date().toISOString(),
    manual_payment_pending_plan: plan,
    manual_payment_pending_term: term,
  }).eq('id', tenantId).then(({ error }) => {
    if (error) console.error('[notify-manual-intent] error marcando pago pendiente:', error)
  })

  const settings = await getPlatformPaymentSettings(service)
  await sendEmail({
    to: settings.contactEmail,
    subject: `🏦 Intención de pago por transferencia — ${tenantName} → ${nombrePlan}`,
    html: `
      <p><strong>${tenantName}</strong> (${user.email}) quiere pasar al plan <strong>${nombrePlan}</strong> (${TERM_LABEL[term]}) por transferencia.</p>
      <p>Monto: $${monto.toLocaleString('es-AR')}</p>
      <p>Contactó por WhatsApp — todavía no confirmó el pago, esto es solo el aviso de intención.</p>
    `,
  }).catch(e => console.error('[notify-manual-intent] error enviando mail:', e))

  return NextResponse.json({ ok: true })
}

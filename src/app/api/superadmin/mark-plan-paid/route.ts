// POST /api/superadmin/mark-plan-paid — marca a mano un tenant como pagado
// (pilot Avellaneda 2026-08-18: pagan por transferencia, no por Mercado
// Pago, así que billing/webhook nunca los toca). Mismo efecto que el
// webhook cuando MP confirma un pago 'authorized' (ver
// panel-admin/src/app/api/billing/webhook, rama pre.status === 'authorized')
// más el registro de quién/cuándo/con qué nota para no perder el rastro de
// qué tenant pagó qué (ver manual_payment_migration.sql).
//
// 2026-08-19: se agregó plazo (1/6/12 meses, mismos descuentos que el
// checkout de MP — ver TERM_DISCOUNTS/priceForTerm en lib/plans.ts) —
// manual_paid_until queda como "pagado hasta" y /api/cron/enforce lo vence
// con el mismo criterio de gracia que el trial (ver PAID_TERM_GRACE_DAYS en
// lib/usage.ts) si nadie vuelve a marcarlo como pagado antes de esa fecha.
//
// Requiere las migraciones manual_payment_migration.sql y
// manual_payment_term_migration.sql aplicadas — si no, falla con el error de
// columna inexistente de Postgres (no hace fallback silencioso a propósito:
// mejor un 500 ruidoso que un "pagado" que no quedó registrado).

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { isSuperAdmin } from '@/lib/superadmin'
import { PLANS, getPlanForTenant, isBillingTerm, priceForTerm, type BillingTerm } from '@/lib/plans'
import { sendEmail, emailPagoConfirmado } from '@/lib/email'

// now + N meses de calendario (no N*30 días — un plazo de 12 meses tiene que
// vencer un año después, no 360 días después).
function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isSuperAdmin(user.email)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { tenantId, plan, note, term } = await req.json()
  if (!tenantId) return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 })
  if (plan && !(plan in PLANS)) {
    return NextResponse.json({ error: 'Plan inválido' }, { status: 400 })
  }
  const months: BillingTerm = isBillingTerm(term) ? term : 1

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const now = new Date()
  const paidUntil = addMonths(now, months)
  const planDef = getPlanForTenant(plan)
  const amount = priceForTerm(planDef, months)

  // Mismo patch que billing/webhook en la rama 'authorized': saca al tenant
  // del trial/gracia y limpia los warnings, para que el cron de enforce no
  // lo vuelva a tocar. manual_payment_warned_at se resetea a null en cada
  // pago — si el tenant ya había recibido el aviso de "tu plazo vence" en un
  // período anterior, no queremos que se salte el aviso del próximo vencimiento.
  const patch: Record<string, string | number | null> = {
    plan_status: 'active',
    trial_ends_at: null,
    trial_warned_at: null,
    limit_warned_at: null,
    over_limit_since: null,
    manual_payment_note: note?.trim() || null,
    manual_payment_at: now.toISOString(),
    manual_payment_by: user.email ?? null,
    manual_payment_term: months,
    manual_payment_amount: amount,
    manual_paid_until: paidUntil.toISOString(),
    manual_payment_warned_at: null,
  }
  if (plan) patch.plan = plan

  const { data: updatedTenant, error } = await serviceClient
    .from('tenants').update(patch).eq('id', tenantId).select('name').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Si estaba suspendida por trial vencido, exceso de cupo o vencimiento de
  // un plazo pago anterior, reactivarla — las suspensiones manuales
  // (suspended_reason null) no se tocan.
  await serviceClient.from('tenants')
    .update({ status: 'active', suspended_reason: null })
    .eq('id', tenantId)
    .in('suspended_reason', ['trial_expired', 'over_limit', 'manual_payment_expired'])

  // Mail de "pago confirmado" al dueño de la tienda (2026-08-22) — antes esto
  // quedaba solo en la base/superadmin, el tenant no se enteraba por ningún
  // lado. Best-effort + await (aunque adentro ya atrapa sus propios errores):
  // nunca debe hacer fallar el marcado como pagado, pero tampoco queremos que
  // el envío quede colgando cuando Vercel corta la ejecución al volver el
  // response.
  try {
    const { data: ownerRows } = await serviceClient
      .from('users').select('email').eq('tenant_id', tenantId).eq('role', 'owner').limit(1)
    const ownerEmail = ownerRows?.[0]?.email
    if (ownerEmail) {
      const panelUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://panel.gounuri.com'
      await sendEmail({
        to: ownerEmail,
        subject: '✅ Pago confirmado — tu tienda ya está activa',
        html: emailPagoConfirmado({
          tenantName: updatedTenant?.name ?? 'tu tienda',
          planNombre: planDef.nombre,
          months,
          amount,
          paidUntil: paidUntil.toISOString(),
          panelUrl,
        }),
      })
    }
  } catch (e) {
    console.error('[mark-plan-paid] error enviando mail de pago confirmado:', e)
  }

  return NextResponse.json({ ok: true, paidUntil: paidUntil.toISOString(), amount })
}

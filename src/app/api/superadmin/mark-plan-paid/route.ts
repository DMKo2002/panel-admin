// POST /api/superadmin/mark-plan-paid — marca a mano un tenant como pagado
// (pilot Avellaneda 2026-08-18: pagan por transferencia, no por Mercado
// Pago, así que billing/webhook nunca los toca). Mismo efecto que el
// webhook cuando MP confirma un pago 'authorized' (ver
// panel-admin/src/app/api/billing/webhook, rama pre.status === 'authorized')
// más el registro de quién/cuándo/con qué nota para no perder el rastro de
// qué tenant pagó qué (ver manual_payment_migration.sql).
//
// Requiere las migraciones manual_payment_migration.sql aplicadas — si no,
// falla con el error de columna inexistente de Postgres (no hace fallback
// silencioso a propósito: mejor un 500 ruidoso que un "pagado" que no quedó
// registrado).

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { isSuperAdmin } from '@/lib/superadmin'
import { PLANS } from '@/lib/plans'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isSuperAdmin(user.email)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { tenantId, plan, note } = await req.json()
  if (!tenantId) return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 })
  if (plan && !(plan in PLANS)) {
    return NextResponse.json({ error: 'Plan inválido' }, { status: 400 })
  }

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Mismo patch que billing/webhook en la rama 'authorized': saca al tenant
  // del trial/gracia y limpia los warnings, para que el cron de enforce no
  // lo vuelva a tocar.
  const patch: Record<string, string | null> = {
    plan_status: 'active',
    trial_ends_at: null,
    trial_warned_at: null,
    limit_warned_at: null,
    over_limit_since: null,
    manual_payment_note: note?.trim() || null,
    manual_payment_at: new Date().toISOString(),
    manual_payment_by: user.email ?? null,
  }
  if (plan) patch.plan = plan

  const { error } = await serviceClient.from('tenants').update(patch).eq('id', tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Si estaba suspendida por trial vencido o exceso de cupo, reactivarla —
  // las suspensiones manuales (suspended_reason null) no se tocan.
  await serviceClient.from('tenants')
    .update({ status: 'active', suspended_reason: null })
    .eq('id', tenantId)
    .in('suspended_reason', ['trial_expired', 'over_limit'])

  return NextResponse.json({ ok: true })
}

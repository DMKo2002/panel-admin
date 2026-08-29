// POST /api/superadmin/update-plan-prices — edita platform_plan_prices
// (mini/standard/premium). Ver /superadmin/planes.
//
// Mismo patrón de gate + service client que update-billing-settings/route.ts.
//
// A propósito esto NO toca Mercado Pago (decisión de ARam 2026-08-29): solo
// actualiza el precio de lista que se usa para altas nuevas y para lo que
// se muestra en pantalla. Las suscripciones de MP ya activas se ajustan a
// mano, directo en el dashboard de MP.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/superadmin'
import { PLANS } from '@/lib/plans'
import { sendEmail, emailCambioPrecioPlan } from '@/lib/email'

const PLAN_IDS = ['mini', 'standard', 'premium'] as const

// Avisa por mail a los owners de los tenants activos en un plan cuando su
// precio cambia (2026-08-29, pedido de ARam) -- best-effort, nunca debe
// hacer fallar el guardado del precio. Un tenant en trial no paga todavía
// -- no tiene sentido avisarle de un cambio de precio de lista.
async function notificarCambioPrecio(
  service: ReturnType<typeof createServiceClient>,
  planId: string,
  precioAnterior: number,
  precioNuevo: number,
) {
  try {
    const panelUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://panel.gounuri.com'
    const planNombre = PLANS[planId as keyof typeof PLANS]?.nombre ?? planId
    const { data: tenants, error } = await service
      .from('tenants')
      .select('id, name')
      .eq('plan', planId)
      .eq('plan_status', 'active')
    if (error || !tenants?.length) return

    const tenantIds = tenants.map(t => t.id)
    const { data: owners } = await service
      .from('users')
      .select('tenant_id, email')
      .eq('role', 'owner')
      .in('tenant_id', tenantIds)
    const emailByTenant = new Map((owners ?? []).map(o => [o.tenant_id, o.email as string]))

    for (const tenant of tenants) {
      const ownerEmail = emailByTenant.get(tenant.id)
      if (!ownerEmail) continue
      await sendEmail({
        to: ownerEmail,
        subject: `Aviso: el precio del plan ${planNombre} cambió — gounuri`,
        html: emailCambioPrecioPlan({
          tenantName: tenant.name,
          planNombre,
          precioAnterior,
          precioNuevo,
          panelUrl,
        }),
      }).catch(e => console.error('[update-plan-prices] error avisando a', ownerEmail, e))
    }
  } catch (e) {
    console.error('[update-plan-prices] error notificando cambio de precio:', e)
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isSuperAdmin(user.email)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const body = await req.json()

  for (const planId of PLAN_IDS) {
    const value = body[planId]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      return NextResponse.json({ error: `Precio inválido para el plan ${planId}` }, { status: 400 })
    }
  }

  const service = createServiceClient()
  const now = new Date().toISOString()
  const updatedBy = user.email ?? null

  // Precios ANTES de pisarlos -- para saber qué planes cambiaron de verdad
  // (y con qué valor viejo) y así avisar por mail solo a esos, no a todos
  // los tenants pagos cada vez que se guarda esta pantalla.
  const { data: beforeRows } = await service.from('platform_plan_prices').select('plan_id, precio_ars')
  const before = Object.fromEntries((beforeRows ?? []).map(r => [r.plan_id, r.precio_ars as number]))

  for (const planId of PLAN_IDS) {
    const { error } = await service
      .from('platform_plan_prices')
      .upsert({ plan_id: planId, precio_ars: body[planId], updated_at: now, updated_by: updatedBy }, { onConflict: 'plan_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Best-effort, en paralelo, después de que el guardado ya confirmó ok --
  // un mail que falla no debe hacer parecer que el precio no se guardó.
  const cambiados = PLAN_IDS.filter(planId => before[planId] !== undefined && before[planId] !== body[planId])
  await Promise.all(cambiados.map(planId => notificarCambioPrecio(service, planId, before[planId], body[planId])))

  return NextResponse.json({ ok: true, updatedAt: now, updatedBy })
}

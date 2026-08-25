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

export async function POST(req: Request) {
  if (!billingEnabled()) {
    return NextResponse.json({ error: 'La facturación todavía no está habilitada' }, { status: 403 })
  }

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

  return NextResponse.json({ ok: true, activeUntil: tenantRow.next_billing_date ?? null })
}

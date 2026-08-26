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
  // la baja si se deja vacío.
  const { reason } = await req.json().catch(() => ({ reason: undefined as string | undefined }))

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

  if (typeof reason === 'string' && reason.trim()) {
    const { data: tenantNameRow } = await service.from('tenants').select('name').eq('id', tenantId).limit(1).single()
    await service.from('billing_cancellation_feedback').insert({
      tenant_id: tenantId,
      tenant_name: tenantNameRow?.name ?? tenantId,
      reason: reason.trim().slice(0, 2000),
    }).then(({ error }) => {
      if (error) console.error('[billing/cancel] error guardando motivo de baja:', error)
    })
  }

  return NextResponse.json({ ok: true, activeUntil: tenantRow.next_billing_date ?? null })
}

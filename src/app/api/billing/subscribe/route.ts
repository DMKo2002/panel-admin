// POST /api/billing/subscribe — inicia el upgrade de plan.
// Body: { plan: 'mini' | 'standard' | 'premium', months?: 1|6|12 }
// Devuelve { init_point } para redirigir al checkout de MP donde el tenant
// carga su tarjeta (el registro gratis nunca pide tarjeta — solo acá).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createPreapproval, cancelPreapproval } from '@/lib/billing'
import { isBillingTerm, type BillingTerm } from '@/lib/plans'
import { getPlatformPaymentSettings } from '@/lib/platformBilling'

// now + N meses de calendario (no N*30 días) — mismo criterio que
// mark-plan-paid/route.ts para next_billing_date.
function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

// Descuento por referido (2026-09): 20% off los primeros 2 meses, SOLO si
// paga mes a mes — no se combina con el descuento por plazo de 6/12 meses
// (ver decisión de producto: mezclarlos tocaría fullPriceForTerm y el flujo
// de transferencia, que ya tuvo un bug de QA el 26/08 por mezclar MP y
// transferencia). Ver createPreapproval en lib/billing.ts para el porqué de
// que esto no "vuelve solo" a precio completo después de los 2 meses.
const REFERIDO_DESCUENTO_PCT = 20

export async function POST(req: Request) {
  const service = createServiceClient()

  // Gate movido de BILLING_ENABLED (env var) a platform_billing_settings
  // (2026-08-26, mismo criterio que gounuri-web desde el 2026-08-22 — ver
  // memoria de proyecto "Gounuri billing/subscriptions") -- esta ruta era
  // código muerto hasta ahora (solo la llamaba UpgradePlans.tsx, que no
  // renderiza ninguna página), la activa por primera vez
  // /dashboard/suscripcion.
  const paymentSettings = await getPlatformPaymentSettings(service)
  if (!paymentSettings.mercadopagoEnabled) {
    return NextResponse.json({ error: 'El pago con Mercado Pago todavía no está habilitado' }, { status: 403 })
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

  const { data: _rows } = await service.from('users').select('tenant_id, role').eq('id', user.id).limit(1)
  const userRow = _rows?.[0]
  if (!userRow?.tenant_id) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
  if (userRow.role === 'staff') return NextResponse.json({ error: 'Solo el owner puede cambiar el plan' }, { status: 403 })
  const tenantId = userRow.tenant_id

  // Aislamiento (2026-08-25): tenants legacy (pre-suscripciones) nunca deben
  // poder disparar un cobro real de Mercado Pago desde acá — ver memoria de
  // proyecto "Gounuri billing/subscriptions".
  const { data: _tenantRows } = await service
    .from('tenants')
    .select('legacy_manual_billing, mp_preapproval_id, referred_by, referido_descuento_hasta')
    .eq('id', tenantId).limit(1)
  const tenantRow = _tenantRows?.[0]
  if (tenantRow?.legacy_manual_billing) {
    return NextResponse.json(
      { error: 'Tu plan lo gestiona el equipo de Gounuri directamente — escribinos para cualquier cambio.' },
      { status: 403 }
    )
  }

  // Se registró con un código de invitación y todavía no usó el descuento
  // por referido (referido_descuento_hasta null = nunca se le aplicó) — solo
  // vale la primera vez que se suscribe pagando mes a mes, y SOLO en el plan
  // Business (2026-09-11, pedido de David: la promo de referidos es
  // únicamente para empujar a ese plan, no para Mini ni Premium).
  const aplicaDescuentoReferido = months === 1 && plan === 'standard'
    && Boolean(tenantRow?.referred_by) && !tenantRow?.referido_descuento_hasta

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
      backUrl: `${origin}/dashboard/facturacion/suscripcion?sub=pendiente`,
      months,
      discountPct: aplicaDescuentoReferido ? REFERIDO_DESCUENTO_PCT : undefined,
    })
    // Guardar ya mismo el plazo elegido y el id — el webhook confirma la
    // activación después y va a volver a escribir estos mismos campos (es
    // idempotente), pero así el tenant ve el plazo elegido de inmediato sin
    // esperar al webhook.
    //
    // 2026-09-13 (bug reportado por David en QA): referido_descuento_hasta
    // NO se toca acá -- si se marcara ya en este punto, con solo abrir el
    // checkout de MP y volver atrás sin pagar, el tenant quedaría marcado
    // como "ya usó su descuento" para siempre sin haber pagado nada. Se
    // marca recién cuando el webhook confirma pre.status === 'authorized'
    // (ver billing/webhook/route.ts) -- el único momento que de verdad
    // importa. discountPct de arriba sigue aplicándose igual: el MONTO del
    // preapproval ya sale con el 20% off desde que se crea, esto solo
    // corrige cuándo se marca "usado" el beneficio.
    const now = new Date()
    await service.from('tenants').update({
      mp_preapproval_id: preapproval.id,
      billing_term: months,
      next_billing_date: addMonths(now, months).toISOString(),
      billing_paused_by_user: false,
    }).eq('id', tenantId)
    return NextResponse.json({ init_point: preapproval.init_point, referidoDescuentoAplicado: aplicaDescuentoReferido })
  } catch (e) {
    console.error('[billing/subscribe]', e)
    return NextResponse.json({ error: 'No se pudo iniciar la suscripción. Probá de nuevo.' }, { status: 500 })
  }
}

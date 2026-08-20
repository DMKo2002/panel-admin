// GET /api/cron/enforce — corre 1 vez por día (Vercel Cron, ver vercel.json).
//
// Aplica el modelo de trial y gracia (2026-07-31):
//   · Trial vencido (7 días) → email de warning una sola vez (trial_warned_at).
//   · Trial vencido + 7 días de gracia sin pagar → suspende la tienda pública
//     (tenants.status = 'suspended', suspended_reason = 'trial_expired').
//   · Plan pago con exceso de cupo: warning a mitad de la gracia de 14 días
//     (limit_warned_at) y suspensión al vencer (suspended_reason = 'over_limit').
//   · Reactivación automática: si el tenant pagó (plan_status = 'active') o
//     volvió a estar dentro del cupo, se levanta la suspensión que puso el cron.
//     Las suspensiones manuales (suspended_reason null) no se tocan.
//
// 2026-08-19: se agregó el vencimiento de pagos manuales por transferencia
// (ver /api/superadmin/mark-plan-paid) — un tenant marcado como pagado por
// 1/6/12 meses tiene manual_paid_until; si se cumple esa fecha y nadie lo
// vuelve a marcar como pagado, mismo patrón de warning + gracia de 7 días
// (PAID_TERM_GRACE_DAYS) → suspensión (suspended_reason = 'manual_payment_expired').
//
// La suspensión funciona porque el middleware de tienda-core solo resuelve
// tenants con status = 'active' — la tienda pública deja de responder sola.
//
// Seguridad: exige el header Authorization: Bearer ${CRON_SECRET} (Vercel lo
// manda automáticamente si CRON_SECRET está seteado en el proyecto).

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getTenantUsage, GRACE_DAYS, TRIAL_GRACE_DAYS, PAID_TERM_GRACE_DAYS } from '@/lib/usage'
import { getPlanForTenant } from '@/lib/plans'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const PANEL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://panel.gounuri.com'
// Contacto para activar el plan — el pago sigue siendo 100% manual
// (transferencia, ver creart_avellaneda_pilot_plan en la memoria del
// proyecto), no hay checkout online acá. 2026-08-20: antes estos mails
// linkeaban a ${PANEL}/dashboard/uso, que desde el 19/8 solo redirige a
// /dashboard (se le sacó la activación self-serve) — quedaba un link
// muerto. Ahora piden que escriban por mail para coordinar.
const CONTACTO_EMAIL = 'info@gounuri.com'

async function ownerEmail(service: ReturnType<typeof createServiceClient>, tenantId: string): Promise<string | null> {
  const { data } = await service.from('users').select('email').eq('tenant_id', tenantId).eq('role', 'owner').limit(1)
  return data?.[0]?.email ?? null
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const service = createServiceClient()
  const now = Date.now()
  const acciones: string[] = []

  // ── 1. Trials vencidos ──────────────────────────────────────────────────────
  const { data: trialTenants } = await service
    .from('tenants')
    .select('id, name, plan, trial_ends_at, trial_warned_at, status')
    .eq('plan_status', 'trial')
    .not('trial_ends_at', 'is', null)
    .lte('trial_ends_at', new Date(now).toISOString())

  for (const t of trialTenants ?? []) {
    const vencidoHaceDias = Math.floor((now - new Date(t.trial_ends_at).getTime()) / 86_400_000)

    if (vencidoHaceDias >= TRIAL_GRACE_DAYS && t.status === 'active') {
      // Gracia agotada → suspender
      await service.from('tenants')
        .update({ status: 'suspended', suspended_reason: 'trial_expired' })
        .eq('id', t.id)
      acciones.push(`suspendido trial_expired: ${t.name}`)

      const email = await ownerEmail(service, t.id)
      if (email) {
        await sendEmail({
          to: email,
          subject: `Tu tienda ${t.name} fue suspendida — gounuri`,
          html: `
            <h2>Tu tienda fue suspendida</h2>
            <p>Terminó tu período de prueba y los ${TRIAL_GRACE_DAYS} días para activar tu plan.</p>
            <p><strong>Tus datos y tu catálogo están intactos.</strong> Escribinos y la reactivamos al instante:</p>
            <p><a href="mailto:${CONTACTO_EMAIL}">${CONTACTO_EMAIL}</a></p>
          `,
        }).catch(() => {})
      }
    } else if (t.status === 'active' && !t.trial_warned_at) {
      // Recién vencido → warning (una sola vez)
      await service.from('tenants').update({ trial_warned_at: new Date(now).toISOString() }).eq('id', t.id)
      acciones.push(`warning trial: ${t.name}`)

      const email = await ownerEmail(service, t.id)
      if (email) {
        const plan = getPlanForTenant(t.plan)
        await sendEmail({
          to: email,
          subject: `Tu prueba gratis terminó — activá tu plan (${TRIAL_GRACE_DAYS} días) — gounuri`,
          html: `
            <h2>Terminó tu período de prueba</h2>
            <p>Tu tienda <strong>${t.name}</strong> sigue online, pero tenés <strong>${TRIAL_GRACE_DAYS} días</strong> para activar tu plan.
            Pasado ese plazo la tienda se suspende (sin perder ningún dato).</p>
            <p>El pago se hace por transferencia — escribinos a
            <a href="mailto:${CONTACTO_EMAIL}">${CONTACTO_EMAIL}</a> y te pasamos los datos y el monto de tu plan
            ${plan.nombre} ($${plan.precioARS.toLocaleString('es-AR')}/mes).</p>
          `,
        }).catch(() => {})
      }
    }
  }

  // ── 2. Exceso de cupo (gracia de 14 días) ───────────────────────────────────
  const { data: overTenants } = await service
    .from('tenants')
    .select('id, name, over_limit_since, limit_warned_at, status, plan_status')
    .not('over_limit_since', 'is', null)

  for (const t of overTenants ?? []) {
    // Recomputar el uso real: si ya se regularizó, getTenantUsage limpia
    // over_limit_since solo y no hay nada más que hacer.
    let usage
    try {
      usage = await getTenantUsage(service, t.id)
    } catch {
      continue
    }
    if (!usage.overLimit) continue

    const diasExcedido = Math.floor((now - new Date(t.over_limit_since).getTime()) / 86_400_000)

    if (diasExcedido >= GRACE_DAYS && t.status === 'active') {
      await service.from('tenants')
        .update({ status: 'suspended', suspended_reason: 'over_limit' })
        .eq('id', t.id)
      acciones.push(`suspendido over_limit: ${t.name}`)

      const email = await ownerEmail(service, t.id)
      if (email) {
        await sendEmail({
          to: email,
          subject: `Tu tienda ${t.name} fue suspendida por exceso de límites — gounuri`,
          html: `
            <h2>Tu tienda fue suspendida</h2>
            <p>Pasaron los ${GRACE_DAYS} días de gracia y tu tienda sigue por encima de los límites del plan.</p>
            <p><strong>Tus datos están intactos.</strong> Subí de plan o liberá espacio y la tienda vuelve a estar online:</p>
            <p><a href="${PANEL}/dashboard/uso">Ver plan y uso</a></p>
          `,
        }).catch(() => {})
      }
    } else if (t.status === 'active' && !t.limit_warned_at && diasExcedido >= Math.floor(GRACE_DAYS / 2)) {
      // Warning a mitad de la gracia (una sola vez)
      await service.from('tenants').update({ limit_warned_at: new Date(now).toISOString() }).eq('id', t.id)
      acciones.push(`warning over_limit: ${t.name}`)

      const email = await ownerEmail(service, t.id)
      if (email) {
        const diasRestantes = GRACE_DAYS - diasExcedido
        await sendEmail({
          to: email,
          subject: `Tu tienda ${t.name} superó los límites del plan — quedan ${diasRestantes} días — gounuri`,
          html: `
            <h2>Superaste los límites de tu plan</h2>
            <p>Tu tienda sigue online, pero quedan <strong>${diasRestantes} días</strong> para regularizar el uso
            (liberar espacio, borrar productos o subir de plan). Pasado ese plazo la tienda se suspende.</p>
            <p><a href="${PANEL}/dashboard/uso">Ver plan y uso</a></p>
          `,
        }).catch(() => {})
      }
    }
  }

  // ── 3. Pagos manuales (transferencia) vencidos ──────────────────────────────
  // Mismo patrón que la sección 1 (trial), pero para tenants marcados como
  // pagados a mano por 1/6/12 meses desde /superadmin — ver comentario del
  // encabezado. Solo mira tenants con plan_status='active' Y manual_paid_until
  // seteado: un tenant en trial nunca entra acá (usa la sección 1), y un
  // tenant que paga por Mercado Pago no tiene manual_paid_until.
  const { data: paidTenants } = await service
    .from('tenants')
    .select('id, name, status, manual_paid_until, manual_payment_warned_at')
    .eq('plan_status', 'active')
    .not('manual_paid_until', 'is', null)
    .lte('manual_paid_until', new Date(now).toISOString())

  for (const t of paidTenants ?? []) {
    const vencidoHaceDias = Math.floor((now - new Date(t.manual_paid_until).getTime()) / 86_400_000)

    if (vencidoHaceDias >= PAID_TERM_GRACE_DAYS && t.status === 'active') {
      await service.from('tenants')
        .update({ status: 'suspended', suspended_reason: 'manual_payment_expired' })
        .eq('id', t.id)
      acciones.push(`suspendido manual_payment_expired: ${t.name}`)

      const email = await ownerEmail(service, t.id)
      if (email) {
        await sendEmail({
          to: email,
          subject: `Tu tienda ${t.name} fue suspendida — gounuri`,
          html: `
            <h2>Tu tienda fue suspendida</h2>
            <p>Venció el plazo pagado y los ${PAID_TERM_GRACE_DAYS} días de gracia para renovarlo.</p>
            <p><strong>Tus datos y tu catálogo están intactos.</strong> Escribinos a
            <a href="mailto:${CONTACTO_EMAIL}">${CONTACTO_EMAIL}</a> y la reactivamos al instante.</p>
          `,
        }).catch(() => {})
      }
    } else if (t.status === 'active' && !t.manual_payment_warned_at) {
      await service.from('tenants').update({ manual_payment_warned_at: new Date(now).toISOString() }).eq('id', t.id)
      acciones.push(`warning manual_payment_expired: ${t.name}`)

      const email = await ownerEmail(service, t.id)
      if (email) {
        await sendEmail({
          to: email,
          subject: `Venció tu plazo pagado — renovalo en ${PAID_TERM_GRACE_DAYS} días — gounuri`,
          html: `
            <h2>Venció tu plazo pagado</h2>
            <p>Tu tienda <strong>${t.name}</strong> sigue online, pero tenés <strong>${PAID_TERM_GRACE_DAYS} días</strong> para
            renovar. Pasado ese plazo la tienda se suspende (sin perder ningún dato). Escribinos a
            <a href="mailto:${CONTACTO_EMAIL}">${CONTACTO_EMAIL}</a> para renovar.</p>
          `,
        }).catch(() => {})
      }
    }
  }

  // ── 4. Reactivaciones ───────────────────────────────────────────────────────
  const { data: suspendidos } = await service
    .from('tenants')
    .select('id, name, plan_status, suspended_reason, manual_paid_until')
    .eq('status', 'suspended')
    .in('suspended_reason', ['trial_expired', 'over_limit', 'manual_payment_expired'])

  for (const t of suspendidos ?? []) {
    if (t.suspended_reason === 'trial_expired') {
      // El webhook de billing ya reactiva al pagar; esto es red de seguridad.
      if (t.plan_status === 'active') {
        await service.from('tenants')
          .update({ status: 'active', suspended_reason: null, trial_warned_at: null })
          .eq('id', t.id)
        acciones.push(`reactivado (pagó): ${t.name}`)
      }
    } else if (t.suspended_reason === 'over_limit') {
      let usage
      try {
        usage = await getTenantUsage(service, t.id)
      } catch {
        continue
      }
      if (!usage.overLimit) {
        await service.from('tenants')
          .update({ status: 'active', suspended_reason: null, limit_warned_at: null })
          .eq('id', t.id)
        acciones.push(`reactivado (regularizó): ${t.name}`)
      }
    } else if (t.suspended_reason === 'manual_payment_expired') {
      // mark-plan-paid ya reactiva al toque cuando lo marcan pagado de nuevo
      // (ver ese endpoint) — esto es red de seguridad, mismo criterio que
      // trial_expired arriba.
      if (t.manual_paid_until && new Date(t.manual_paid_until).getTime() > now) {
        await service.from('tenants')
          .update({ status: 'active', suspended_reason: null, manual_payment_warned_at: null })
          .eq('id', t.id)
        acciones.push(`reactivado (renovó): ${t.name}`)
      }
    }
  }

  return NextResponse.json({ ok: true, acciones })
}

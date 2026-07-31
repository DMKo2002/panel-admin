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
// La suspensión funciona porque el middleware de tienda-core solo resuelve
// tenants con status = 'active' — la tienda pública deja de responder sola.
//
// Seguridad: exige el header Authorization: Bearer ${CRON_SECRET} (Vercel lo
// manda automáticamente si CRON_SECRET está seteado en el proyecto).

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getTenantUsage, GRACE_DAYS, TRIAL_GRACE_DAYS } from '@/lib/usage'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const PANEL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://panel.gounuri.com'

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
            <p><strong>Tus datos y tu catálogo están intactos.</strong> Activá tu plan y la tienda vuelve a estar online al instante:</p>
            <p><a href="${PANEL}/dashboard/uso">Activar mi plan</a></p>
          `,
        }).catch(() => {})
      }
    } else if (t.status === 'active' && !t.trial_warned_at) {
      // Recién vencido → warning (una sola vez)
      await service.from('tenants').update({ trial_warned_at: new Date(now).toISOString() }).eq('id', t.id)
      acciones.push(`warning trial: ${t.name}`)

      const email = await ownerEmail(service, t.id)
      if (email) {
        await sendEmail({
          to: email,
          subject: `Tu prueba gratis terminó — activá tu plan (${TRIAL_GRACE_DAYS} días) — gounuri`,
          html: `
            <h2>Terminó tu período de prueba</h2>
            <p>Tu tienda <strong>${t.name}</strong> sigue online, pero tenés <strong>${TRIAL_GRACE_DAYS} días</strong> para activar tu plan.
            Pasado ese plazo la tienda se suspende (sin perder ningún dato).</p>
            <p><a href="${PANEL}/dashboard/uso">Activar mi plan</a></p>
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

  // ── 3. Reactivaciones ───────────────────────────────────────────────────────
  const { data: suspendidos } = await service
    .from('tenants')
    .select('id, name, plan_status, suspended_reason')
    .eq('status', 'suspended')
    .in('suspended_reason', ['trial_expired', 'over_limit'])

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
    }
  }

  return NextResponse.json({ ok: true, acciones })
}

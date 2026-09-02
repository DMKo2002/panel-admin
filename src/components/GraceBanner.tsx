// Banner de estado de cuenta para el dashboard principal.
// Server component — muestra trial, gracia post-trial, exceso de cupo o
// suspensión. Si todo está normal no renderiza nada.
//
// 2026-08-18: se había sacado el link "Ver plan y uso" (apuntaba a
// /dashboard/uso, que en ese momento redirigía) porque activar el plan era
// un paso 100% manual (transferencia + /superadmin, ver mark-plan-paid), sin
// nada self-serve del otro lado. 2026-08-22: eso cambió — gounuri.com/perfil/plan
// tenía un flujo real (Mercado Pago y/o transferencia), así que el banner
// volvió a linkear en vez de solo pedir que lo contacten.
//
// 2026-09-02, bug reportado por ARam: ese link a gounuri.com/perfil/plan
// manda a un login DISTINTO del de Panel Admin (gounuri.com y
// panel.gounuri.com son sesiones separadas — ver
// project_gounuri_billing_subscriptions en memoria) — un tenant que ya está
// logueado en Panel Admin, viendo este banner en su propio dashboard, caía
// en una pantalla de login en vez de ir directo a activar el plan. Desde
// 2026-08-26 existe /dashboard/facturacion/suscripcion DENTRO de Panel
// Admin (mismo contenido, portado de gounuri-web/PlanSelector.tsx — ver
// SuscripcionSelector.tsx) pero este banner nunca se actualizó para
// apuntar ahí. Se cambia a un link interno (misma sesión, sin login extra).
import Link from 'next/link'
import { AlertTriangle, Clock } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/service'
import { getTenantUsage, GRACE_DAYS, TRIAL_GRACE_DAYS } from '@/lib/usage'

const SUSCRIPCION_URL = '/dashboard/facturacion/suscripcion'

export default async function GraceBanner({ tenantId }: { tenantId: string }) {
  let usage
  try {
    const service = createServiceClient()
    usage = await getTenantUsage(service, tenantId)
  } catch {
    return null // sin service key o sin migraciones: no romper el dashboard
  }

  const { accountState, trialDaysLeft, trialGraceDaysLeft, overLimit, graceDaysLeft } = usage

  const contactanos = (
    <Link href={SUSCRIPCION_URL} className="font-medium underline underline-offset-2">
      Activá tu plan.
    </Link>
  )

  // ── Suspensión ──────────────────────────────────────────────────────────────
  if (accountState === 'suspended') {
    return (
      <div className="mx-8 mt-6 flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <strong>Tu tienda pública está suspendida</strong>
          {usage.suspendedReason === 'trial_expired' && ' porque venció tu período de prueba'}
          {usage.suspendedReason === 'over_limit' && ' porque superaste los límites de tu plan'}
          . Tus datos están intactos — activá un plan para volver a publicarla. {contactanos}
        </p>
      </div>
    )
  }

  // ── Trial vencido, en gracia ────────────────────────────────────────────────
  if (accountState === 'trial_grace') {
    const dias = trialGraceDaysLeft ?? 0
    return (
      <div className="mx-8 mt-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Tu período de prueba terminó.{' '}
          {dias > 0 ? (
            <>
              Tenés <strong>{dias} {dias === 1 ? 'día' : 'días'}</strong> para activar tu plan antes de que la
              tienda se suspenda.{' '}
            </>
          ) : (
            <>Venció la gracia de {TRIAL_GRACE_DAYS} días — tu tienda puede suspenderse en cualquier momento.{' '}</>
          )}
          {contactanos}
        </p>
      </div>
    )
  }

  // ── Exceso de cupo (plan pago o trial) ──────────────────────────────────────
  if (overLimit) {
    return (
      <div className="mx-8 mt-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          {graceDaysLeft !== null && graceDaysLeft > 0 ? (
            <>
              Tu tienda superó los límites del plan. Tenés <strong>{graceDaysLeft} {graceDaysLeft === 1 ? 'día' : 'días'}</strong> para
              liberar espacio o subir de plan antes de que se suspenda.{' '}
            </>
          ) : (
            <>
              Venció el período de gracia de {GRACE_DAYS} días — tu tienda puede suspenderse en cualquier momento.{' '}
            </>
          )}
          {contactanos}
        </p>
      </div>
    )
  }

  // ── Trial vigente (informativo, últimos días en amarillo) ───────────────────
  if (accountState === 'trial' && trialDaysLeft !== null) {
    const urgente = trialDaysLeft <= 3
    return (
      <div className={`mx-8 mt-6 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
        urgente ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-zinc-200 bg-white text-zinc-600'
      }`}>
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Estás en tu período de prueba: {' '}
          <strong>{trialDaysLeft} {trialDaysLeft === 1 ? 'día restante' : 'días restantes'}</strong> del plan {usage.plan.nombre}.
        </p>
      </div>
    )
  }

  return null
}

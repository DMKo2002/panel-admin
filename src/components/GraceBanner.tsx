// Banner de estado de cuenta para el dashboard principal.
// Server component — muestra trial, gracia post-trial, exceso de cupo o
// suspensión. Si todo está normal no renderiza nada.
//
// 2026-08-18: sacamos el link "Ver plan y uso" (apuntaba a /dashboard/uso,
// que ahora redirige — ver ese archivo). El banner se deja igual para que el
// tenant siga enterándose si está en trial o suspendido, pero ya no hay
// self-serve del otro lado del link: activar el plan ahora es un paso manual
// (transferencia + /superadmin, ver mark-plan-paid), así que el texto invita
// a contactarnos en vez de ofrecer un botón que no lleva a ningún lado.
import { AlertTriangle, Clock } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/service'
import { getTenantUsage, GRACE_DAYS, TRIAL_GRACE_DAYS } from '@/lib/usage'

export default async function GraceBanner({ tenantId }: { tenantId: string }) {
  let usage
  try {
    const service = createServiceClient()
    usage = await getTenantUsage(service, tenantId)
  } catch {
    return null // sin service key o sin migraciones: no romper el dashboard
  }

  const { accountState, trialDaysLeft, trialGraceDaysLeft, overLimit, graceDaysLeft } = usage

  const contactanos = <strong className="font-medium">Contactanos para activarlo.</strong>

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

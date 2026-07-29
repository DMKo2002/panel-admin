// Banner de período de gracia para el dashboard principal.
// Server component — se renderiza solo si el tenant superó un límite del plan.
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/service'
import { getTenantUsage, GRACE_DAYS } from '@/lib/usage'

export default async function GraceBanner({ tenantId }: { tenantId: string }) {
  let usage
  try {
    const service = createServiceClient()
    usage = await getTenantUsage(service, tenantId)
  } catch {
    return null // sin service key o sin migraciones: no romper el dashboard
  }

  if (!usage.overLimit) return null

  const { graceDaysLeft } = usage

  return (
    <div className="mx-8 mt-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        {graceDaysLeft !== null && graceDaysLeft > 0 ? (
          <>
            Tu tienda superó los límites del plan. Tenés <strong>{graceDaysLeft} {graceDaysLeft === 1 ? 'día' : 'días'}</strong> para
            regularizar el uso antes de que pueda desactivarse.{' '}
          </>
        ) : (
          <>
            Venció el período de gracia de {GRACE_DAYS} días — tu tienda puede desactivarse en cualquier momento.{' '}
          </>
        )}
        <Link href="/dashboard/uso" className="font-medium underline underline-offset-2">
          Ver plan y uso
        </Link>
      </p>
    </div>
  )
}

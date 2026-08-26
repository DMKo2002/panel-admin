// /dashboard/facturacion/suscripcion -- pantalla de facturación/suscripción DENTRO de
// Panel Admin (2026-08-26, pedido de ARam -- ver memoria de proyecto
// "Gounuri billing/subscriptions"). Mismo patrón de resolución de tenant que
// dashboard/uso/page.tsx; el contenido (cards de plan, resumen arriba de
// todo, historial de pago) vive en SuscripcionSelector.tsx, portado de
// gounuri-web/src/app/perfil/plan/PlanSelector.tsx.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPlatformPaymentSettings } from '@/lib/platformBilling'
import SuscripcionSelector from '@/components/SuscripcionSelector'

export default async function SuscripcionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { data: _userRows } = await service.from('users').select('tenant_id').eq('id', user.id).limit(1)
  const tenantId = _userRows?.[0]?.tenant_id
  if (!tenantId) return <div className="p-8 text-zinc-500">Tenant no encontrado.</div>

  const { data: _tenantRows } = await service
    .from('tenants')
    .select('name, plan, plan_status, status, billing_term, next_billing_date, trial_ends_at, mp_preapproval_id, billing_paused_by_user, legacy_manual_billing')
    .eq('id', tenantId)
    .limit(1)
  const tenant = _tenantRows?.[0]
  if (!tenant) return <div className="p-8 text-zinc-500">Tenant no encontrado.</div>

  // Mismo criterio que gounuri-web/perfil/plan: en trial (plan_status sigue
  // en 'trial' hasta que el webhook confirma el primer pago) o suspendida,
  // el botón del plan actual tiene que permitir "activarlo", no aparecer
  // deshabilitado como si ya estuviera pago.
  const trialing = tenant.plan_status === 'trial' || tenant.status === 'suspended'
  const currentPlan = tenant.plan ?? 'standard'

  const paymentSettings = await getPlatformPaymentSettings(service)

  const { data: _charges } = await service
    .from('billing_charges')
    .select('id, amount, status, created_at, mp_payment_id, mp_preapproval_id')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(12)
  const paymentHistory = (_charges ?? []).map(c => ({
    id: String(c.id),
    amount: c.amount ?? 0,
    status: c.status ?? '',
    created_at: c.created_at,
    mpPaymentId: c.mp_payment_id ?? null,
    mpPreapprovalId: c.mp_preapproval_id ?? null,
  }))

  return (
    <div>
      <div className="px-4 sm:px-8 py-6 border-b border-zinc-200 bg-white">
        <h1 className="text-xl font-semibold text-zinc-900">Suscripción</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Esta vista sirve para elegir el plan a suscribir, ver tu vencimiento y tu historial de pago.</p>
      </div>

      <div className="px-4 sm:px-8 py-6 max-w-5xl">
        <SuscripcionSelector
          currentPlan={currentPlan}
          trialing={trialing}
          paymentSettings={paymentSettings}
          billingTerm={tenant.billing_term ?? null}
          nextBillingDate={tenant.next_billing_date ?? null}
          trialEndsAt={tenant.trial_ends_at ?? null}
          mpPreapprovalId={tenant.mp_preapproval_id ?? null}
          billingPausedByUser={tenant.billing_paused_by_user ?? false}
          legacyManualBilling={tenant.legacy_manual_billing ?? false}
          paymentHistory={paymentHistory}
        />
      </div>
    </div>
  )
}

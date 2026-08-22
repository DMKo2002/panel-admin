// "Plan y uso" — restaurado 2026-08-22. Se había sacado el 2026-08-18 (ver
// historial git) porque en ese momento el pago se manejaba 100% a mano
// (transferencia + superadmin, ver mark-plan-paid) y no tenía sentido
// ofrecerle a cada tenant una pantalla de self-serve billing que no podía
// operar solo. Eso cambió el mismo día 2026-08-22: gounuri.com/perfil/plan
// ahora tiene un flujo real de cambio de plan (Mercado Pago y/o
// transferencia con CBU/alias, configurable desde superadmin — ver
// gounuri-web/src/app/perfil/plan). Btw sigue viviendo en gounuri.com, no acá
// (Panel Admin es la operación día a día de la tienda, gounuri.com es la
// cuenta/facturación del dueño) — esta página muestra el USO real (mismos
// números que ve superadmin, ver /superadmin) y linkea para cambiar de plan
// en vez de duplicar todo el checkout acá.
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { ExternalLink, Package, HardDrive, Eye, ShoppingCart } from 'lucide-react'
import { getTenantUsage } from '@/lib/usage'

const GOUNURI_PLAN_URL = 'https://www.gounuri.com/perfil/plan'

const PLAN_STATUS_LABELS: Record<string, string> = {
  trial:     'Prueba gratis',
  active:    'Activo',
  past_due:  'Pago pendiente',
  canceled:  'Cancelado',
}
const PLAN_STATUS_COLORS: Record<string, string> = {
  trial:     'bg-amber-50 text-amber-700 border-amber-200',
  active:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  past_due:  'bg-red-50 text-red-700 border-red-200',
  canceled:  'bg-zinc-100 text-zinc-500 border-zinc-200',
}

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

export default async function UsoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: _userRows } = await supabase.from('users').select('tenant_id').eq('id', user.id).limit(1)
  const tenantId = _userRows?.[0]?.tenant_id
  if (!tenantId) return <div className="p-8 text-zinc-500">Tenant no encontrado.</div>

  const service = createServiceClient()
  const [usage, { data: _tenantRows }] = await Promise.all([
    getTenantUsage(service, tenantId),
    service.from('tenants').select('plan_status, manual_paid_until, manual_payment_term, manual_payment_amount').eq('id', tenantId).limit(1),
  ])
  const tenantRow = _tenantRows?.[0]
  const planStatus = tenantRow?.plan_status ?? null
  const manualPaidUntil = tenantRow?.manual_paid_until ?? null

  return (
    <div>
      <div className="px-4 sm:px-8 py-6 border-b border-zinc-200 bg-white">
        <h1 className="text-xl font-semibold text-zinc-900">Plan y uso</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Tu plan actual y cuánto estás usando de tu cupo.</p>
      </div>

      <div className="px-4 sm:px-8 py-6 space-y-6 max-w-3xl">

        {/* Plan actual */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-lg font-semibold text-zinc-900">{usage.plan.nombre}</p>
                {planStatus && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${PLAN_STATUS_COLORS[planStatus] ?? 'bg-zinc-100 text-zinc-500 border-zinc-200'}`}>
                    {PLAN_STATUS_LABELS[planStatus] ?? planStatus}
                  </span>
                )}
              </div>
              {usage.accountState === 'trial' && usage.trialDaysLeft !== null && (
                <p className="text-sm text-zinc-500 mt-1">
                  Te quedan <strong>{usage.trialDaysLeft} {usage.trialDaysLeft === 1 ? 'día' : 'días'}</strong> de prueba gratis.
                </p>
              )}
              {usage.accountState === 'trial_grace' && (
                <p className="text-sm text-red-600 mt-1">Tu período de prueba terminó — activá un plan para no perder tu tienda pública.</p>
              )}
              {planStatus === 'active' && manualPaidUntil && (
                <p className="text-sm text-zinc-500 mt-1">
                  Pagado hasta el <strong>{new Date(manualPaidUntil).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</strong>
                  {tenantRow?.manual_payment_amount ? ` (${formatPrice(tenantRow.manual_payment_amount)}${tenantRow.manual_payment_term && tenantRow.manual_payment_term > 1 ? ` · ${tenantRow.manual_payment_term} meses` : ''})` : ''}.
                </p>
              )}
              {planStatus === 'active' && !manualPaidUntil && (
                <p className="text-sm text-zinc-500 mt-1">Tu suscripción se renueva automáticamente con Mercado Pago.</p>
              )}
              {usage.accountState === 'suspended' && (
                <p className="text-sm text-red-600 mt-1">Tu tienda pública está suspendida — activá un plan para reactivarla.</p>
              )}
            </div>
            <a
              href={GOUNURI_PLAN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
            >
              Cambiar de plan <ExternalLink size={14} />
            </a>
          </div>
          <p className="mt-3 text-xs text-zinc-400">
            El cambio de plan y el pago (Mercado Pago o transferencia) se manejan desde tu cuenta en gounuri.com, no desde acá.
          </p>
        </div>

        {/* Uso vs. cupo del plan */}
        <div>
          <h2 className="text-sm font-semibold text-zinc-700 mb-3">Uso de este mes</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UsageCard
              icon={<Package size={16} className="text-blue-600" />}
              iconBg="bg-blue-50"
              label="Productos"
              value={`${usage.productCount} / ${usage.plan.maxProductos}`}
              pct={usage.productPct}
            />
            <UsageCard
              icon={<HardDrive size={16} className="text-violet-600" />}
              iconBg="bg-violet-50"
              label="Almacenamiento"
              value={usage.storageError ? 'No disponible' : `${Math.round(usage.storageBytes / (1024 * 1024))} MB / ${usage.plan.storageMB} MB`}
              pct={usage.storageError ? 0 : usage.storagePct}
            />
            <UsageCard
              icon={<Eye size={16} className="text-amber-600" />}
              iconBg="bg-amber-50"
              label="Visitas"
              value={`${usage.visitCount} / ${usage.plan.visitasMes}`}
              pct={usage.visitPct}
            />
            <UsageCard
              icon={<ShoppingCart size={16} className="text-emerald-600" />}
              iconBg="bg-emerald-50"
              label="Pedidos"
              value={String(usage.orderCount)}
              pct={null}
            />
          </div>
          {usage.overLimit && (
            <p className="mt-3 text-sm text-red-600">
              Superaste el cupo de tu plan {usage.graceDaysLeft !== null && usage.graceDaysLeft > 0 ? `— tenés ${usage.graceDaysLeft} ${usage.graceDaysLeft === 1 ? 'día' : 'días'} de gracia antes de que se suspenda tu tienda` : ''}. Subí de plan para seguir tranquilo.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function UsageCard({ icon, iconBg, label, value, pct }: {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string
  /** null = sin límite/informativo (no se pinta barra de progreso) */
  pct: number | null
}) {
  const clamped = pct !== null ? Math.min(100, Math.max(0, pct)) : null
  const barColor = clamped !== null && clamped >= 100 ? 'bg-red-500' : clamped !== null && clamped >= 80 ? 'bg-amber-500' : 'bg-zinc-900'
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4">
      <div className="flex items-center gap-2">
        <div className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${iconBg}`}>{icon}</div>
        <p className="text-xs text-zinc-500">{label}</p>
      </div>
      <p className="text-lg font-semibold text-zinc-900 mt-2">{value}</p>
      {clamped !== null && (
        <div className="mt-2 h-1.5 w-full rounded-full bg-zinc-100 overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${clamped}%` }} />
        </div>
      )}
    </div>
  )
}

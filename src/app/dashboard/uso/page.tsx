import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { HardDrive, Shirt, ShoppingCart, Eye } from 'lucide-react'
import UsageRing from '@/components/UsageRing'
import { formatStorage } from '@/lib/plans'
import { getTenantUsage, GRACE_DAYS } from '@/lib/usage'
import { billingEnabled } from '@/lib/billing'
import { ArrowUpRight } from 'lucide-react'
import type { TutorialStep } from '@/components/tutorial/TutorialProvider'
import TutorialRegister from '@/components/tutorial/TutorialRegister'
import TutorialHint from '@/components/tutorial/TutorialHint'
import PageTutorialButton from '@/components/tutorial/PageTutorialButton'

export const dynamic = 'force-dynamic'

const GOUNURI_URL = process.env.NEXT_PUBLIC_GOUNURI_URL ?? 'https://gounuri.com'

const USO_STEPS: TutorialStep[] = [
  {
    id: 'uso-metrics',
    target: '[data-tutorial="uso-metrics"]',
    title: 'Consumo de tu plan',
    content: 'Almacenamiento y productos tienen un límite según tu plan — si te acercás o lo superás, vas a ver un aviso arriba. Pedidos son siempre ilimitados y sin comisión en todos los planes; visitas se miden pero todavía no bloquean nada.',
  },
  {
    id: 'uso-upgrade',
    target: '[data-tutorial="uso-upgrade"]',
    title: 'Cambiar de plan',
    content: 'El pago y el cambio de plan se hacen en gounuri.com, no acá — apretá el botón y te llevamos directo. Si superás un límite, tenés unos días de gracia para regularizar antes de que la tienda pública se suspenda — tus datos nunca se pierden.',
  },
]

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

export default async function UsoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { data: _rows } = await service.from('users').select('tenant_id').eq('id', user.id).limit(1)
  const tenantId = _rows?.[0]?.tenant_id
  if (!tenantId) return <div className="p-8 text-zinc-500">No se encontró el tenant.</div>

  const {
    plan, storageBytes, storageError, storagePct,
    productCount, productPct, orderCount,
    visitCount, visitPct,
    overLimit, nearLimit, graceDaysLeft,
    accountState, trialDaysLeft, trialGraceDaysLeft, suspendedReason,
  } = await getTenantUsage(service, tenantId)

  return (
    <div>
      <TutorialRegister pageKey="uso" steps={USO_STEPS} />
      <div className="px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Plan y uso</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Consumo de recursos de tu tienda en el período actual</p>
          <PageTutorialButton pageKey="uso" />
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-1.5 text-sm font-medium text-zinc-900">
          Plan {plan.nombre}
          {accountState === 'trial' && <span className="text-xs font-normal text-zinc-500">· prueba gratis</span>}
        </span>
      </div>

      <div className="p-8">
        {accountState === 'suspended' && (
          <div className="mb-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            <strong>Tu tienda pública está suspendida</strong>
            {suspendedReason === 'trial_expired' && ' porque venció tu período de prueba'}
            {suspendedReason === 'over_limit' && ' porque superaste los límites de tu plan'}
            . Tus datos y tu catálogo están intactos: activá un plan para volver a publicarla.
          </div>
        )}
        {accountState === 'trial' && trialDaysLeft !== null && (
          <div className="mb-6 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
            Estás en tu período de prueba gratis del plan {plan.nombre}:{' '}
            <strong>{trialDaysLeft} {trialDaysLeft === 1 ? 'día restante' : 'días restantes'}</strong>.
            Al finalizar vas a tener 7 días para activarlo antes de que la tienda se suspenda.
          </div>
        )}
        {accountState === 'trial_grace' && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Tu período de prueba terminó.{' '}
            {trialGraceDaysLeft !== null && trialGraceDaysLeft > 0 ? (
              <>
                Tenés <strong>{trialGraceDaysLeft} {trialGraceDaysLeft === 1 ? 'día' : 'días'}</strong> para activar
                tu plan — pasado ese plazo la tienda se suspende (los datos no se pierden).
              </>
            ) : (
              <>La gracia venció: tu tienda puede suspenderse en cualquier momento. Activá un plan para regularizar.</>
            )}
          </div>
        )}
        {overLimit && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {graceDaysLeft !== null && graceDaysLeft > 0 ? (
              <>
                Superaste un límite de tu plan. Tenés <strong>{graceDaysLeft} {graceDaysLeft === 1 ? 'día' : 'días'}</strong> para
                liberar espacio o subir de plan — pasado ese plazo tu tienda puede desactivarse. Mientras tanto sigue funcionando con normalidad.
              </>
            ) : graceDaysLeft !== null && graceDaysLeft <= 0 ? (
              <>
                Venció el período de gracia de {GRACE_DAYS} días: tu tienda puede desactivarse en cualquier momento.
                Liberá espacio o subí de plan para regularizar tu cuenta.
              </>
            ) : (
              <>Superaste un límite de tu plan. Liberá espacio o subí de plan para evitar que tu tienda se desactive.</>
            )}
          </div>
        )}
        {nearLimit && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Estás cerca del límite de tu plan.
          </div>
        )}

        <div data-tutorial="uso-metrics" className="grid gap-4 sm:grid-cols-2">
          {/* Almacenamiento */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                <HardDrive className="h-4 w-4 text-zinc-500" />
                Almacenamiento
                <TutorialHint pageKey="uso" step={USO_STEPS[0]} />
              </div>
              {storageError ? (
                <p className="mt-2 text-sm text-zinc-400">
                  Medición no disponible — falta ejecutar <code className="text-xs">tenant_storage_migration.sql</code>
                </p>
              ) : (
                <p className="mt-2 text-2xl font-semibold text-zinc-900">
                  {formatBytes(storageBytes)}
                  <span className="ml-1 text-sm font-normal text-zinc-500">/ {formatStorage(plan.storageMB)}</span>
                </p>
              )}
              <p className="mt-1 text-xs text-zinc-500">Fotos de productos y assets de la tienda</p>
            </div>
            {!storageError && <UsageRing pct={storagePct} />}
          </div>

          {/* Productos */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                <Shirt className="h-4 w-4 text-zinc-500" />
                Productos
              </div>
              <p className="mt-2 text-2xl font-semibold text-zinc-900">
                {productCount}
                <span className="ml-1 text-sm font-normal text-zinc-500">/ {plan.maxProductos}</span>
              </p>
              <p className="mt-1 text-xs text-zinc-500">Productos publicados en el catálogo</p>
            </div>
            <UsageRing pct={productPct} />
          </div>

          {/* Pedidos — ilimitados, solo informativo */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                <ShoppingCart className="h-4 w-4 text-zinc-500" />
                Pedidos este mes
              </div>
              <p className="mt-2 text-2xl font-semibold text-zinc-900">{orderCount}</p>
              <p className="mt-1 text-xs text-zinc-500">Sin límite ni comisiones por venta, en todos los planes</p>
            </div>
            <span className="rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700">
              Ilimitados
            </span>
          </div>

          {/* Visitas — se miden, todavía sin bloqueo */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                <Eye className="h-4 w-4 text-zinc-500" />
                Visitas este mes
              </div>
              <p className="mt-2 text-2xl font-semibold text-zinc-900">
                {visitCount.toLocaleString('es-AR')}
                <span className="ml-1 text-sm font-normal text-zinc-500">/ {plan.visitasMes.toLocaleString('es-AR')}</span>
              </p>
              <p className="mt-1 text-xs text-zinc-500">Vistas de página en tu tienda pública</p>
            </div>
            <UsageRing pct={visitPct} />
          </div>
        </div>

        <p className="mt-6 text-xs text-zinc-400">
          El almacenamiento se calcula sobre las imágenes subidas. Consejo: subí fotos comprimidas (menos de 500 KB) para aprovechar mejor tu plan.
        </p>

        {billingEnabled() && (
          <div data-tutorial="uso-upgrade" className="flex items-center gap-1.5 mt-6">
            <TutorialHint pageKey="uso" step={USO_STEPS[1]} />
            <div className="flex-1">
              {/* El pago y el cambio de plan se hacen en gounuri.com, no acá
                  (2026-08-12) — más prolijo tener un solo lugar donde se
                  factura, en vez de duplicar el flujo de pago en el Panel
                  Admin. UpgradePlans.tsx se deja intacto sin usarse por si
                  hace falta reactivar la tarjeta directa más adelante. */}
              <div className="rounded-xl border border-zinc-200 bg-white p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">Cambiar de plan</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    El pago se gestiona en gounuri.com — mensual, o con descuento pagando 6 (-10%) o 12 meses (-20%) de una vez.
                  </p>
                </div>
                <a
                  href={`${GOUNURI_URL}/perfil/plan?plan=${plan.id}`}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 shrink-0"
                >
                  Ir a cambiar de plan
                  <ArrowUpRight size={15} />
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

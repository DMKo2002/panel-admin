import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { HardDrive, Shirt, ShoppingCart, Eye } from 'lucide-react'
import UsageRing from '@/components/UsageRing'
import { formatStorage } from '@/lib/plans'
import { getTenantUsage, GRACE_DAYS } from '@/lib/usage'

export const dynamic = 'force-dynamic'

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
    overLimit, nearLimit, graceDaysLeft,
  } = await getTenantUsage(service, tenantId)

  return (
    <div>
      <div className="px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Plan y uso</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Consumo de recursos de tu tienda en el período actual</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-1.5 text-sm font-medium text-zinc-900">
          Plan {plan.nombre}
        </span>
      </div>

      <div className="p-8">
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

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Almacenamiento */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                <HardDrive className="h-4 w-4 text-zinc-500" />
                Almacenamiento
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

          {/* Visitas — medición pendiente */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                <Eye className="h-4 w-4 text-zinc-500" />
                Visitas este mes
              </div>
              <p className="mt-2 text-2xl font-semibold text-zinc-400">—</p>
              <p className="mt-1 text-xs text-zinc-500">
                Límite del plan: {plan.visitasMes.toLocaleString('es-AR')} · medición próximamente
              </p>
            </div>
          </div>
        </div>

        <p className="mt-6 text-xs text-zinc-400">
          El almacenamiento se calcula sobre las imágenes subidas. Consejo: subí fotos comprimidas (menos de 500 KB) para aprovechar mejor tu plan.
        </p>
      </div>
    </div>
  )
}

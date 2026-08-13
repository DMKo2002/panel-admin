import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TrendingUp, ShoppingCart, Package, Tag, Award } from 'lucide-react'
import {
  getMonthRange,
  fetchOrdersForRange,
  fetchSalesItemsForRange,
  aggregateRevenueByDay,
  aggregateByCategory,
  aggregateByProduct,
} from '@/lib/stats'
import RevenueChart from '@/components/stats/RevenueChart'
import MonthSelector from '@/components/stats/MonthSelector'
import StatsTabs from '@/components/stats/StatsTabs'

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

export default async function EstadisticasPage({
  searchParams,
}: {
  searchParams: { mes?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: _userRows } = await supabase.from('users').select('tenant_id').eq('id', user.id).limit(1)
  const tenantId = _userRows?.[0]?.tenant_id
  if (!tenantId) return <div className="p-8 text-zinc-500">Tenant no encontrado.</div>

  const range = getMonthRange(searchParams.mes)

  const [orders, items] = await Promise.all([
    fetchOrdersForRange(supabase, tenantId, range),
    fetchSalesItemsForRange(supabase, tenantId, range),
  ])

  const revenueByDay = aggregateRevenueByDay(orders, range)
  const categories = aggregateByCategory(items)
  const products = aggregateByProduct(items)

  const totalRevenue = orders.reduce((acc, o) => acc + (o.total ?? 0), 0)
  const orderCount = orders.length
  const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0
  const itemsSold = items.reduce((acc, i) => acc + i.quantity, 0)

  const topCategory = categories[0]
  const topProduct = products[0]

  return (
    <div>
      <div className="px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Estadísticas</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Resumen de ventas del período</p>
        </div>
        <MonthSelector
          basePath="/dashboard/estadisticas"
          label={range.label}
          prevParam={range.prevParam}
          nextParam={range.nextParam}
          isCurrentMonth={range.isCurrentMonth}
        />
      </div>

      <div className="px-8 pt-4 bg-white">
        <StatsTabs />
      </div>

      <div className="px-8 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            icon={<TrendingUp size={18} className="text-primary-600" />}
            iconBg="bg-primary-50"
            label="Ingresos"
            value={formatPrice(totalRevenue)}
            sub={`${orderCount} pedidos`}
          />
          <StatCard
            icon={<ShoppingCart size={18} className="text-amber-600" />}
            iconBg="bg-amber-50"
            label="Ticket promedio"
            value={formatPrice(avgOrderValue)}
            sub="Por pedido"
          />
          <StatCard
            icon={<Package size={18} className="text-blue-600" />}
            iconBg="bg-blue-50"
            label="Items vendidos"
            value={String(itemsSold)}
            sub={`${products.length} productos distintos`}
          />
          <StatCard
            icon={<Tag size={18} className="text-emerald-600" />}
            iconBg="bg-emerald-50"
            label="Categorías activas"
            value={String(categories.length)}
            sub="Con ventas en el período"
          />
        </div>

        {/* Chart */}
        <RevenueChart data={revenueByDay} monthLabel={range.label} />

        {/* Top category / top product */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-zinc-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Tag size={16} className="text-emerald-600" />
              <h2 className="text-sm font-semibold text-zinc-700">Categoría más vendida</h2>
            </div>
            {topCategory ? (
              <div>
                <p className="text-lg font-semibold text-zinc-900">{topCategory.categoryName}</p>
                <p className="text-sm text-zinc-500 mt-1">
                  {topCategory.quantity} items · {formatPrice(topCategory.netSales)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-zinc-400">Sin ventas en el período</p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-zinc-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Award size={16} className="text-amber-600" />
              <h2 className="text-sm font-semibold text-zinc-700">Producto más vendido</h2>
            </div>
            {topProduct ? (
              <div>
                <p className="text-lg font-semibold text-zinc-900">{topProduct.productName}</p>
                <p className="text-sm text-zinc-500 mt-1">
                  {topProduct.quantity} items · {formatPrice(topProduct.netSales)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-zinc-400">Sin ventas en el período</p>
            )}
          </div>
        </div>

        {/* Top 5 categorías */}
        {categories.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-zinc-700 mb-3">Categorías más vendidas</h2>
            <div className="bg-white rounded-xl border border-zinc-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100">
                    <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Categoría</th>
                    <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Items vendidos</th>
                    <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Venta neta</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.slice(0, 5).map((c, i) => (
                    <tr key={c.categoryId ?? c.categoryName} className="border-b border-zinc-50 last:border-0">
                      <td className="px-4 py-3 text-zinc-700">{c.categoryName}</td>
                      <td className="px-4 py-3 text-zinc-700">{c.quantity}</td>
                      <td className="px-4 py-3 font-medium text-zinc-900">{formatPrice(c.netSales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon, iconBg, label, value, sub }: {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string
  sub: string
}) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-zinc-500">{label}</p>
          <p className="text-lg font-semibold text-zinc-900 truncate">{value}</p>
        </div>
      </div>
      <p className="text-xs text-zinc-400 mt-2">{sub}</p>
    </div>
  )
}

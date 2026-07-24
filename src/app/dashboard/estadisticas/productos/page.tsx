import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  getMonthRange,
  fetchOrdersForRange,
  fetchSalesItemsForRange,
  aggregateRevenueByDay,
  aggregateByProduct,
} from '@/lib/stats'
import RevenueChart from '@/components/stats/RevenueChart'
import MonthSelector from '@/components/stats/MonthSelector'
import StatsTabs from '@/components/stats/StatsTabs'
import ProductsTable from '@/components/stats/ProductsTable'

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

export default async function EstadisticasProductosPage({
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
  const products = aggregateByProduct(items)
  const itemsSold = items.reduce((acc, i) => acc + i.quantity, 0)
  const netSales = items.reduce((acc, i) => acc + i.subtotal, 0)

  return (
    <div>
      <div className="px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Estadísticas</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Ventas por producto</p>
        </div>
        <MonthSelector
          basePath="/dashboard/estadisticas/productos"
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
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Items vendidos" value={String(itemsSold)} sub={`${products.length} productos distintos`} />
          <StatCard label="Venta neta" value={formatPrice(netSales)} sub="Sin envío" />
          <StatCard label="Pedidos" value={String(orders.length)} sub={range.label} />
        </div>

        {/* Chart */}
        <RevenueChart data={revenueByDay} monthLabel={range.label} />

        {/* Tabla de productos más vendidos */}
        <ProductsTable products={products} />
      </div>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-lg font-semibold text-zinc-900 mt-1">{value}</p>
      <p className="text-xs text-zinc-400 mt-2">{sub}</p>
    </div>
  )
}

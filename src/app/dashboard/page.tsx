import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OrderStatusBadge, PaymentStatusBadge, CustomerTypeBadge } from '@/components/Badge'
import { ShoppingCart, Package, Users, TrendingUp } from 'lucide-react'

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userRow } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  const tenantId = userRow?.tenant_id
  if (!tenantId) return <div className="p-8 text-zinc-500">Tenant no encontrado.</div>

  // Queries paralelas para las stats
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [
    { data: ordersToday },
    { data: ordersPending },
    { data: products },
    { data: customers },
    { data: recentOrders },
  ] = await Promise.all([
    supabase.from('orders').select('total').eq('tenant_id', tenantId).gte('created_at', today.toISOString()),
    supabase.from('orders').select('id').eq('tenant_id', tenantId).eq('status', 'pending'),
    supabase.from('products').select('id, active').eq('tenant_id', tenantId),
    supabase.from('customers').select('id, type').eq('tenant_id', tenantId),
    supabase.from('orders')
      .select('id, status, payment_method, payment_status, total, created_at, customers(full_name, type)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  const salesTotal = ordersToday?.reduce((acc, o) => acc + (o.total ?? 0), 0) ?? 0
  const activeProducts = products?.filter(p => p.active).length ?? 0
  const wholesaleCustomers = customers?.filter(c => c.type === 'wholesale').length ?? 0

  return (
    <div>
      {/* Header */}
      <div className="px-8 py-6 border-b border-zinc-200 bg-white">
        <h1 className="text-xl font-semibold text-zinc-900">Dashboard</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          {new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="px-8 py-6 space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            icon={<TrendingUp size={18} className="text-violet-600" />}
            iconBg="bg-violet-50"
            label="Ventas hoy"
            value={formatPrice(salesTotal)}
            sub={`${ordersToday?.length ?? 0} pedidos`}
          />
          <StatCard
            icon={<ShoppingCart size={18} className="text-amber-600" />}
            iconBg="bg-amber-50"
            label="Pedidos pendientes"
            value={String(ordersPending?.length ?? 0)}
            sub="Requieren atención"
          />
          <StatCard
            icon={<Package size={18} className="text-blue-600" />}
            iconBg="bg-blue-50"
            label="Productos activos"
            value={String(activeProducts)}
            sub={`${products?.length ?? 0} en total`}
          />
          <StatCard
            icon={<Users size={18} className="text-emerald-600" />}
            iconBg="bg-emerald-50"
            label="Clientes"
            value={String(customers?.length ?? 0)}
            sub={`${wholesaleCustomers} mayoristas`}
          />
        </div>

        {/* Últimos pedidos */}
        <div>
          <h2 className="text-sm font-semibold text-zinc-700 mb-3">Últimos pedidos</h2>
          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Pedido</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Cliente</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Total</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Tipo</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Pago</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders?.map((order: any) => (
                  <tr key={order.id} className="border-b border-zinc-50 hover:bg-zinc-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">#{order.id.slice(0, 6)}</td>
                    <td className="px-4 py-3 text-zinc-700">{order.customers?.full_name ?? 'Sin nombre'}</td>
                    <td className="px-4 py-3 font-medium text-zinc-900">{formatPrice(order.total)}</td>
                    <td className="px-4 py-3"><CustomerTypeBadge type={order.customers?.type ?? 'retail'} /></td>
                    <td className="px-4 py-3 text-zinc-500 capitalize">{order.payment_method === 'mercadopago' ? 'MercadoPago' : 'Transferencia'}</td>
                    <td className="px-4 py-3"><OrderStatusBadge status={order.status} /></td>
                  </tr>
                ))}
                {(!recentOrders || recentOrders.length === 0) && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-400 text-sm">Aún no hay pedidos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

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
      <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${iconBg} mb-3`}>
        {icon}
      </div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-2xl font-semibold text-zinc-900 mt-0.5">{value}</p>
      <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>
    </div>
  )
}

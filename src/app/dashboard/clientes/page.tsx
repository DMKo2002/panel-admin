import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import DeleteCustomerButton from '@/components/DeleteCustomerButton'

function fmt(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function TypeBadge({ type }: { type: string }) {
  const isWholesale = type === 'wholesale' || type === 'mayorista'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
      isWholesale ? 'bg-violet-50 text-violet-700' : 'bg-zinc-100 text-zinc-600'
    }`}>
      {isWholesale ? 'Mayorista' : 'Minorista'}
    </span>
  )
}

export default async function ClientesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Todo lo demas con service client para bypassear RLS
  let tenantId: string | null = null
  let customers: any[] = []
  let orders: any[] = []
  let pageError: string | null = null
  try {
    const service = createServiceClient()

    const { data: _userRows, error: userError } = await service
      .from('users').select('tenant_id').eq('id', user.id).limit(1)
    const userRow = _userRows?.[0]
    if (userError) throw new Error('Error leyendo usuario: ' + userError.message + ' (' + userError.code + ')')
    tenantId = userRow?.tenant_id ?? null
    if (!tenantId) throw new Error('El usuario ' + user.email + ' no tiene tenant_id asignado')

    // Traer clientes del tenant
    const { data: customersData } = await service
      .from('customers')
      .select('id, full_name, last_name, email, phone, type, company_name, created_at, active, woo_orders_count, woo_total_spent')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    customers = customersData ?? []

    // Traer pedidos del tenant para agregar stats por cliente
    const { data: ordersData } = await service
      .from('orders')
      .select('id, customer_id, total, payment_status, status, created_at')
      .eq('tenant_id', tenantId)
    orders = ordersData ?? []
  } catch (e: any) {
    pageError = e.message ?? 'Error cargando clientes'
  }

  if (pageError) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold text-zinc-900 mb-2">Clientes</h1>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <strong>Error:</strong> {pageError}
        </div>
      </div>
    )
  }

  // Calcular stats por cliente
  type CustomerStats = {
    totalSpent: number
    orderCount: number
    pendingCount: number
    lastOrderDate: string | null
  }

  const statsMap = new Map<string, CustomerStats>()

  for (const order of orders) {
    const cid = order.customer_id
    if (!cid) continue
    const existing = statsMap.get(cid) ?? { totalSpent: 0, orderCount: 0, pendingCount: 0, lastOrderDate: null }
    existing.orderCount += 1
    if (order.payment_status === 'paid') existing.totalSpent += order.total ?? 0
    if (order.payment_status === 'pending') existing.pendingCount += 1
    if (!existing.lastOrderDate || order.created_at > existing.lastOrderDate) {
      existing.lastOrderDate = order.created_at
    }
    statsMap.set(cid, existing)
  }

  const totalClients = customers.length
  const totalRevenue = Array.from(statsMap.values()).reduce((s, c) => s + c.totalSpent, 0)
  const withPending = Array.from(statsMap.values()).filter(c => c.pendingCount > 0).length

  return (
    <div>
      {/* Header */}
      <div className="px-8 py-6 border-b border-zinc-200 bg-white">
        <h1 className="text-xl font-semibold text-zinc-900">Clientes</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{totalClients} clientes registrados</p>
      </div>

      {/* KPIs */}
      <div className="px-8 py-5 grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider mb-1">Total clientes</p>
          <p className="text-2xl font-bold text-zinc-900">{totalClients}</p>
        </div>
        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider mb-1">Revenue total pagado</p>
          <p className="text-2xl font-bold text-zinc-900">{fmt(totalRevenue)}</p>
        </div>
        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider mb-1">Con pagos pendientes</p>
          <p className="text-2xl font-bold text-amber-600">{withPending}</p>
        </div>
      </div>

      {/* Tabla */}
      <div className="px-8 pb-8">
        <div className="bg-white rounded-xl border border-zinc-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Cliente</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Tipo</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Empresa</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Pedidos</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Total gastado</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Pend. pago</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Último pedido</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Registrado</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {customers?.map(c => {
                const stats = statsMap.get(c.id) ?? { totalSpent: 0, orderCount: 0, pendingCount: 0, lastOrderDate: null }
                return (
                  <tr key={c.id} className="border-b border-zinc-50 hover:bg-zinc-50 transition-colors last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-800">{c.full_name}{c.last_name ? ` ${c.last_name}` : ''}</p>
                      <p className="text-xs text-zinc-400">{c.email}</p>
                      {c.phone && <p className="text-xs text-zinc-300">{c.phone}</p>}
                    </td>
                    <td className="px-4 py-3"><TypeBadge type={c.type ?? 'retail'} /></td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{c.company_name ?? '—'}</td>
                    <td className="px-4 py-3">
                      {stats.orderCount > 0 ? (
                        <span className="text-sm font-semibold text-zinc-900">{stats.orderCount}</span>
                      ) : c.woo_orders_count > 0 ? (
                        <span className="text-sm font-semibold text-zinc-400" title="Historial WooCommerce">
                          {c.woo_orders_count}
                          <span className="ml-1 text-[10px] font-normal text-zinc-300">woo</span>
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {stats.totalSpent > 0 ? (
                        <span className="text-sm font-semibold text-emerald-600">{fmt(stats.totalSpent)}</span>
                      ) : c.woo_total_spent > 0 ? (
                        <span className="text-sm font-semibold text-zinc-400" title="Historial WooCommerce">
                          {fmt(c.woo_total_spent)}
                          <span className="ml-1 text-[10px] font-normal text-zinc-300">woo</span>
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {stats.pendingCount > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                          {stats.pendingCount} pendiente{stats.pendingCount > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-400">
                      {stats.lastOrderDate ? fmtDate(stats.lastOrderDate) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-400">
                      {fmtDate(c.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <DeleteCustomerButton
                        customerId={c.id}
                        customerName={`${c.full_name}${c.last_name ? ` ${c.last_name}` : ''}`}
                      />
                    </td>
                  </tr>
                )
              })}
              {(!customers || customers.length === 0) && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-zinc-400 text-sm">
                    Todavía no hay clientes registrados en la tienda
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

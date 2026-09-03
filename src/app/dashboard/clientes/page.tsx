import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import CsvImportExportButtons from '@/components/CsvImportExportButtons'
import ClientesTable, { type ClienteRow } from '@/components/ClientesTable'

function fmt(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
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

  // Lista con stats ya resueltas, para el buscador + filtro de historial de
  // compra (2026-09-03, pedido de ARam) -- ver ClientesTable.tsx.
  const customersWithStats: ClienteRow[] = customers.map(c => {
    const stats = statsMap.get(c.id) ?? { totalSpent: 0, orderCount: 0, pendingCount: 0, lastOrderDate: null }
    return {
      id: c.id,
      full_name: c.full_name,
      last_name: c.last_name,
      email: c.email,
      phone: c.phone,
      type: c.type,
      company_name: c.company_name,
      created_at: c.created_at,
      orderCount: stats.orderCount,
      totalSpent: stats.totalSpent,
      pendingCount: stats.pendingCount,
      lastOrderDate: stats.lastOrderDate,
      woo_orders_count: c.woo_orders_count ?? 0,
      woo_total_spent: c.woo_total_spent ?? 0,
    }
  })

  return (
    <div>
      {/* Header */}
      <div className="px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Clientes</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{totalClients} clientes registrados</p>
        </div>
        <div className="relative">
          <CsvImportExportButtons
            exportUrl="/api/clientes/export"
            importUrl="/api/clientes/import"
            entityLabel="clientes"
          />
        </div>
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

      {/* Buscador + filtro de historial de compra + tabla (2026-09-03,
          pedido de ARam) -- ver ClientesTable.tsx */}
      <ClientesTable customers={customersWithStats} />
    </div>
  )
}

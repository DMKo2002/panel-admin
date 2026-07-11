import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { isSuperAdmin } from '@/lib/superadmin'
import { OrderStatusBadge, PaymentStatusBadge, CustomerTypeBadge } from '@/components/Badge'
import { Download, FileText, Package } from 'lucide-react'
import MarkPaidButton from '@/components/MarkPaidButton'
import UpdateOrderStatusButton from '@/components/UpdateOrderStatusButton'
import CancelOrderButton from '@/components/CancelOrderButton'

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: { status?: string; payment?: string }
}) {
  // Auth check con cliente normal
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Obtener tenant_id con service client
  let tenantId: string | null = null
  let orders: any[] = []
  let serviceError: string | null = null
  try {
    const service = createServiceClient()
    const { data: _userRows } = await service
      .from('users').select('tenant_id').eq('id', user.id).limit(1)
    tenantId = _userRows?.[0]?.tenant_id ?? null
  } catch (e: any) {
    serviceError = e.message
  }

  if (!tenantId && !serviceError) {
    if (isSuperAdmin(user.email)) redirect('/superadmin')
    return <div className="p-8 text-zinc-500 text-sm">No se encontro tenant para este usuario.</div>
  }

  if (!serviceError && tenantId) try {
    const service = createServiceClient()

    let query = service
      .from('orders')
      .select('*, customers(full_name, type, email)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (searchParams.status) query = query.eq('status', searchParams.status)
    if (searchParams.payment) query = query.eq('payment_status', searchParams.payment)

    const { data } = await query
    orders = data ?? []
  } catch (e: any) {
    serviceError = e.message ?? 'Error cargando pedidos'
  }

  const statusOptions = [
    { value: '', label: 'Todos' },
    { value: 'pending', label: 'Pendiente' },
    { value: 'confirmed', label: 'Confirmado' },
    { value: 'shipped', label: 'Enviado' },
    { value: 'delivered', label: 'Entregado' },
    { value: 'cancelled', label: 'Cancelado' },
  ]

  if (serviceError) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold text-zinc-900 mb-2">Pedidos</h1>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <strong>Error de configuración:</strong> {serviceError}
          <p className="mt-1 text-red-600">Agregá <code className="bg-red-100 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code> en Vercel → Settings → Environment Variables y redesplegá.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="sticky top-0 z-10 px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Pedidos</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{orders.length} pedidos encontrados</p>
        </div>
        <button className="btn-secondary">
          <Download size={15} />
          Exportar CSV
        </button>
      </div>

      {/* Filtros */}
      <div className="px-8 py-4 bg-white border-b border-zinc-100 flex gap-3">
        {statusOptions.map(opt => (
          <a
            key={opt.value}
            href={opt.value ? `/dashboard/pedidos?status=${opt.value}` : '/dashboard/pedidos'}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              (searchParams.status ?? '') === opt.value
                ? 'bg-violet-50 text-violet-700 font-medium'
                : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50'
            }`}
          >
            {opt.label}
          </a>
        ))}
      </div>

      <div className="px-8 py-6">
        <div className="bg-white rounded-xl border border-zinc-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">#</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Cliente</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Total</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Tipo</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Pago</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Estado pago</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Estado</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Fecha</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Recibo</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Pago</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Notificar</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {orders?.map((order: any) => (
                <tr key={order.id} className="border-b border-zinc-50 hover:bg-zinc-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">#{order.id.slice(0, 6)}</td>
                  <td className="px-4 py-3">
                    <p className="text-zinc-800 font-medium">{order.customers?.full_name ?? '—'}</p>
                    <p className="text-zinc-400 text-xs">{order.customers?.email}</p>
                  </td>
                  <td className="px-4 py-3 font-medium text-zinc-900">{formatPrice(order.total)}</td>
                  <td className="px-4 py-3"><CustomerTypeBadge type={order.customers?.type ?? 'retail'} /></td>
                  <td className="px-4 py-3 text-zinc-500">{order.payment_method === 'mercadopago' ? 'MercadoPago' : 'Transferencia'}</td>
                  <td className="px-4 py-3"><PaymentStatusBadge status={order.payment_status} /></td>
                  <td className="px-4 py-3"><OrderStatusBadge status={order.status} /></td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{formatDate(order.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <a
                        href={`/api/pdf?order_id=${order.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
                      >
                        <FileText size={13} />
                        Recibo
                      </a>
                      <a
                        href={`/api/pdf/envio?order_id=${order.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
                      >
                        <Package size={13} />
                        Envío
                      </a>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <MarkPaidButton
                      orderId={order.id}
                      paymentStatus={order.payment_status}
                      paymentMethod={order.payment_method}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <UpdateOrderStatusButton
                      orderId={order.id}
                      currentStatus={order.status}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <CancelOrderButton
                      orderId={order.id}
                      currentStatus={order.status}
                    />
                  </td>
                </tr>
              ))}
              {(!orders || orders.length === 0) && (
                <tr><td colSpan={12} className="px-4 py-12 text-center text-zinc-400">No hay pedidos con ese filtro</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { OrderStatusBadge, PaymentStatusBadge, CustomerTypeBadge } from '@/components/Badge'
import { Download, FileText } from 'lucide-react'
import MarkPaidButton from '@/components/MarkPaidButton'
import UpdateOrderStatusButton from '@/components/UpdateOrderStatusButton'

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

  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  const tenantId = userRow?.tenant_id
  if (!tenantId) return null

  // Datos con service role para bypassear RLS en customers
  const service = createServiceClient()
  let query = service
    .from('orders')
    .select('*, customers(full_name, type, email)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (searchParams.status) query = query.eq('status', searchParams.status)
  if (searchParams.payment) query = query.eq('payment_status', searchParams.payment)

  const { data: orders } = await query

  const statusOptions = [
    { value: '', label: 'Todos' },
    { value: 'pending', label: 'Pendiente' },
    { value: 'confirmed', label: 'Confirmado' },
    { value: 'shipped', label: 'Enviado' },
    { value: 'delivered', label: 'Entregado' },
    { value: 'cancelled', label: 'Cancelado' },
  ]

  return (
    <div>
      <div className="px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Pedidos</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{orders?.length ?? 0} pedidos encontrados</p>
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
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Acciones</th>
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
                      {/* Ver recibo (inline) */}
                      <a
                        href={`/api/pdf?order_id=${order.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Ver recibo"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
                      >
                        <FileText size={13} />
                        Recibo
                      </a>
                      {/* Etiqueta de envío (inline) */}
                      <a
                        href={`/api/pdf/envio?order_id=${order.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Ver etiqueta de envío"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
                      >
                        <FileText size={13} />
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
                </tr>
              ))}
              {(!orders || orders.length === 0) && (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-zinc-400">No hay pedidos con ese filtro</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

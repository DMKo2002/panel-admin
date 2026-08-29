import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import UpdateWithdrawalStatusButton from '@/components/UpdateWithdrawalStatusButton'

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default async function ArrepentimientoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let requests: any[] = []
  let pageError: string | null = null
  try {
    const service = createServiceClient()

    const { data: _userRows, error: userError } = await service
      .from('users').select('tenant_id').eq('id', user.id).limit(1)
    const userRow = _userRows?.[0]
    if (userError) throw new Error('Error leyendo usuario: ' + userError.message)
    const tenantId = userRow?.tenant_id ?? null
    if (!tenantId) throw new Error('El usuario ' + user.email + ' no tiene tenant_id asignado')

    const { data: requestsData } = await service
      .from('withdrawal_requests')
      .select('id, order_number, customer_name, customer_email, customer_phone, reason, tracking_code, status, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    requests = requestsData ?? []
  } catch (e: any) {
    pageError = e.message ?? 'Error cargando las solicitudes'
  }

  if (pageError) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold text-zinc-900 mb-2">Arrepentimiento</h1>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <strong>Error:</strong> {pageError}
        </div>
      </div>
    )
  }

  const total = requests.length
  const pendientes = requests.filter(r => r.status === 'pendiente').length
  const enProceso = requests.filter(r => r.status === 'en_proceso').length

  return (
    <div>
      {/* Header */}
      <div className="px-8 py-6 border-b border-zinc-200 bg-white">
        <h1 className="text-xl font-semibold text-zinc-900">Arrepentimiento</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Solicitudes de tus clientes a través del Botón de Arrepentimiento de tu tienda (Res. 424/2020)</p>
      </div>

      {/* KPIs */}
      <div className="px-8 py-5 grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider mb-1">Total solicitudes</p>
          <p className="text-2xl font-bold text-zinc-900">{total}</p>
        </div>
        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider mb-1">Pendientes</p>
          <p className="text-2xl font-bold text-amber-600">{pendientes}</p>
        </div>
        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider mb-1">En proceso</p>
          <p className="text-2xl font-bold text-blue-600">{enProceso}</p>
        </div>
      </div>

      {/* Tabla */}
      <div className="px-8 pb-8">
        <div className="bg-white rounded-xl border border-zinc-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Código</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Cliente</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Pedido</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Motivo</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Recibido</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(r => (
                <tr key={r.id} className="border-b border-zinc-50 hover:bg-zinc-50 transition-colors last:border-0">
                  <td className="px-4 py-3 text-xs font-mono text-zinc-500">{r.tracking_code}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-800">{r.customer_name}</p>
                    {r.customer_email && <p className="text-xs text-zinc-400">{r.customer_email}</p>}
                    {r.customer_phone && <p className="text-xs text-zinc-300">{r.customer_phone}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{r.order_number ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500 max-w-xs truncate" title={r.reason ?? ''}>{r.reason ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-zinc-400">{fmtDate(r.created_at)}</td>
                  <td className="px-4 py-3">
                    <UpdateWithdrawalStatusButton requestId={r.id} currentStatus={r.status} />
                  </td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-zinc-400 text-sm">
                    Todavía no recibiste ninguna solicitud de arrepentimiento
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

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import CreateAccountForm from '@/components/CreateAccountForm'
import DeleteAccountButton from '@/components/DeleteAccountButton'

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export default async function CuentasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { data: _callerRows } = await service.from('users').select('tenant_id, role').eq('id', user.id).limit(1)
  const caller = _callerRows?.[0]
  if (!caller?.tenant_id) redirect('/dashboard')
  if (caller.role !== 'owner') redirect('/dashboard')

  const { data: accountsData } = await service
    .from('users')
    .select('id, email, role, created_at')
    .eq('tenant_id', caller.tenant_id)
    .order('created_at', { ascending: true })
  const accounts = accountsData ?? []

  return (
    <div>
      <div className="px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Cuentas</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Accesos al panel para vos y tu equipo</p>
        </div>
        <CreateAccountForm />
      </div>

      <div className="px-8 py-6">
        <div className="bg-white rounded-xl border border-zinc-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Email</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Rol</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Acceso</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Creada</th>
                <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map(a => (
                <tr key={a.id} className="border-b border-zinc-50 hover:bg-zinc-50 transition-colors last:border-0">
                  <td className="px-4 py-3 text-zinc-800 font-medium">
                    {a.email}
                    {a.id === user.id && <span className="ml-2 text-xs text-zinc-400 font-normal">(vos)</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      a.role === 'owner' ? 'bg-violet-50 text-violet-700' : 'bg-zinc-100 text-zinc-600'
                    }`}>
                      {a.role === 'owner' ? 'Dueño' : 'Empleado'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {a.role === 'owner' ? 'Acceso total' : 'Pedidos, Clientes, Productos, Categorías, Precios'}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">{fmtDate(a.created_at)}</td>
                  <td className="px-4 py-3">
                    {a.role !== 'owner' && <DeleteAccountButton accountId={a.id} accountEmail={a.email} />}
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-zinc-400 text-sm">
                    No hay cuentas todavía
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

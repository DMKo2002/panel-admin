import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardShell from '@/components/DashboardShell'
import ThemeProvider from '@/components/ThemeProvider'
import { isSuperAdmin } from '@/lib/superadmin'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import TutorialWelcomePopup from '@/components/tutorial/TutorialWelcomePopup'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const superAdmin = isSuperAdmin(user.email)

  const { data: _userRows } = await supabase
    .from('users')
    .select('tenant_id, role, permissions')
    .eq('id', user.id)
    .limit(1)
  const userRow = _userRows?.[0]

  let storeName  = 'Mi tienda'
  let storeDomain = ''
  let tenantStatus: string | null = null

  if (userRow?.tenant_id) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name, domain, status')
      .eq('id', userRow.tenant_id)
      .single()

    if (tenant) {
      storeName    = tenant.name
      storeDomain  = tenant.domain ?? ''
      tenantStatus = tenant.status ?? null
    }
  }

  // Cuenta pendiente de aprobación
  if (tenantStatus === 'pending') {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-100 mb-5">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-amber-600">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-zinc-900 mb-2">Tu cuenta está siendo revisada</h1>
          <p className="text-sm text-zinc-500 leading-relaxed mb-6">
            Recibimos tu registro para <strong className="text-zinc-700">{storeName}</strong>.
            Te avisamos por email en cuanto esté activada tu cuenta.
          </p>
          <div className="bg-white border border-zinc-200 rounded-xl p-4 text-left text-sm text-zinc-600 space-y-2">
            <p className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-xs font-bold">✓</span>
              Cuenta creada
            </p>
            <p className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs">⏳</span>
              Esperando aprobación
            </p>
            <p className="flex items-center gap-2 opacity-40">
              <span className="w-5 h-5 rounded-full bg-zinc-100 text-zinc-400 flex items-center justify-center text-xs">○</span>
              Acceso al panel
            </p>
          </div>
          <form action="/api/auth/signout" method="post" className="mt-6">
            <button type="submit" className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors">
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <TutorialProvider>
      <ThemeProvider />
      <DashboardShell storeName={storeName} storeDomain={storeDomain} isSuperAdmin={superAdmin} role={userRow?.role} permissions={userRow?.permissions}>
        {children}
      </DashboardShell>
      <TutorialWelcomePopup />
    </TutorialProvider>
  )
}

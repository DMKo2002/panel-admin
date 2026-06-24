import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/Sidebar'
import ThemeProvider from '@/components/ThemeProvider'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userRow } = await supabase
    .from('users')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  let storeName = 'Mi tienda'
  let storeDomain = ''

  if (userRow?.tenant_id) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name, domain')
      .eq('id', userRow.tenant_id)
      .single()

    if (tenant) {
      storeName = tenant.name
      storeDomain = tenant.domain ?? ''
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50">
      <ThemeProvider />
      <Sidebar storeName={storeName} storeDomain={storeDomain} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}

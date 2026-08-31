import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/superadmin'

// Título de pestaña distinto al de Panel Admin (2026-08-26, pedido de
// ARam) -- para poder diferenciar a simple vista la pestaña del
// superadmin de la del panel de un tenant cuando están las dos abiertas.
export const metadata: Metadata = {
  title: 'Panel Superadmin',
}

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !isSuperAdmin(user.email)) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-primary-600 flex items-center justify-center text-xs font-bold">
              SA
            </div>
            <span className="text-sm font-semibold text-zinc-100">gounuri Superadmin</span>
          </div>
          <nav className="flex items-center gap-4 text-xs">
            <a href="/superadmin" className="text-zinc-400 hover:text-zinc-100 transition-colors">
              Tenants
            </a>
            <a href="/superadmin/clientes" className="text-zinc-400 hover:text-zinc-100 transition-colors">
              Clientes Gounuri
            </a>
            <a href="/superadmin/pagos" className="text-zinc-400 hover:text-zinc-100 transition-colors">
              Pagos GOUNURI
            </a>
            <a href="/superadmin/planes" className="text-zinc-400 hover:text-zinc-100 transition-colors">
              Precios
            </a>
          </nav>
        </div>
        <a
          href="/dashboard"
          className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          Volver a mi panel
        </a>
      </header>
      <main className="px-8 py-8">{children}</main>
    </div>
  )
}

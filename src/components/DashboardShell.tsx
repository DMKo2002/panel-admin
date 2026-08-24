'use client'

// Envuelve Sidebar + el contenido de /dashboard. Antes el layout armaba el
// flex [Sidebar fijo w-56][main] directo, sin ninguna adaptación a mobile —
// en una pantalla chica el sidebar solo ya comía casi todo el ancho. Esto
// agrega la topbar con el botón de 3 rayitas que abre el sidebar como drawer
// (mismo criterio que el menú mobile de gounuri-web).

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'
import type { StaffPermissions } from '@/lib/settings-nav'

export default function DashboardShell({
  storeName,
  storeDomain,
  isSuperAdmin,
  role,
  permissions,
  children,
}: {
  storeName: string
  storeDomain: string
  isSuperAdmin?: boolean
  role?: string | null
  permissions?: StaffPermissions | null
  children: React.ReactNode
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  // key={pathname} fuerza que React remonte este div en cada cambio de
  // ruta, así la animación CSS de entrada (animate-page-enter, ver
  // globals.css) se dispara de nuevo cada vez — antes el contenido
  // cambiaba de un salto seco, sin ninguna transición entre una página
  // del panel y otra.
  const pathname = usePathname()

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50">
      <Sidebar
        storeName={storeName}
        storeDomain={storeDomain}
        isSuperAdmin={isSuperAdmin}
        role={role}
        permissions={permissions}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar — solo mobile, en desktop el sidebar ya está siempre visible */}
        <div className="md:hidden flex items-center gap-3 px-4 h-14 flex-shrink-0 border-b border-zinc-200 bg-white">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
            className="-ml-2 p-2 rounded-lg text-zinc-600 hover:bg-zinc-50"
          >
            <Menu size={20} />
          </button>
          <p className="text-sm font-semibold text-zinc-900 truncate">{storeName}</p>
        </div>

        <main className="flex-1 overflow-y-auto">
          <div key={pathname} className="animate-page-enter">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

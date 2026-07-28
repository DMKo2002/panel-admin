'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, ShoppingCart, Shirt,
  FolderOpen, LogOut, Store, ShieldCheck, Users, ArrowLeft, BarChart3
} from 'lucide-react'
import clsx from 'clsx'
import { SETTINGS_ROUTES } from '@/lib/settings-nav'

// Los ítems de "Configuración" (General, Pagos, Envíos, Catálogo, Contacto,
// Notificaciones, Apariencia, Legal, Cuentas) viven en src/lib/settings-nav.ts
// — única fuente de verdad, compartida con src/proxy.ts para que el bloqueo
// real de rutas y lo que se ve acá nunca queden desincronizados.
const navItems = [
  { label: 'Dashboard',       href: '/dashboard',                icon: LayoutDashboard, staffBlocked: false },
  { label: 'Estadísticas',    href: '/dashboard/estadisticas',   icon: BarChart3,        staffBlocked: false },
  { label: 'Pedidos',         href: '/dashboard/pedidos',        icon: ShoppingCart,     staffBlocked: false },
  { label: 'Clientes',        href: '/dashboard/clientes',       icon: Users,            staffBlocked: false },
  { label: 'Productos',       href: '/dashboard/productos',      icon: Shirt,            staffBlocked: false },
  { label: 'Categorías',      href: '/dashboard/categorias',     icon: FolderOpen,       staffBlocked: false },
  ...SETTINGS_ROUTES.map(r => ({ label: r.label, href: r.href, icon: r.icon, staffBlocked: r.staffBlocked })),
]

interface SidebarProps {
  storeName: string
  storeDomain: string
  isSuperAdmin?: boolean
  role?: string | null
}

export default function Sidebar({ storeName, storeDomain, isSuperAdmin, role }: SidebarProps) {
  const isStaff = role === 'staff'
  const visibleItems = navItems.filter(item => !(isStaff && item.staffBlocked))
  const general = visibleItems.filter(i => ['/dashboard', '/dashboard/estadisticas', '/dashboard/pedidos', '/dashboard/clientes'].includes(i.href))
  const catalogo = visibleItems.filter(i => ['/dashboard/productos', '/dashboard/categorias'].includes(i.href))
  const config = visibleItems.filter(i => !general.includes(i) && !catalogo.includes(i))
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [hasSuperadminTokens, setHasSuperadminTokens] = useState(false)

  useEffect(() => {
    setHasSuperadminTokens(!!sessionStorage.getItem('superadmin_tokens'))
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function handleReturnToSuperadmin() {
    const raw = sessionStorage.getItem('superadmin_tokens')
    if (!raw) { router.push('/superadmin'); return }
    const tokens = JSON.parse(raw)
    sessionStorage.removeItem('superadmin_tokens')
    await fetch('/api/auth/set-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tokens),
    })
    window.location.href = '/superadmin'
  }

  return (
    <aside className="w-56 flex-shrink-0 h-screen bg-white border-r border-zinc-200 flex flex-col">
      <div className="px-4 py-4 border-b border-zinc-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
            <Store size={16} className="text-primary-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900 truncate">{storeName}</p>
            <p className="text-xs text-zinc-400 truncate">{storeDomain}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-0.5">
        <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider px-2 mb-2">General</p>
        {general.map(item => <NavLink key={item.href} item={item} pathname={pathname} />)}

        {catalogo.length > 0 && (
          <>
            <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider px-2 mt-4 mb-2">Catálogo</p>
            {catalogo.map(item => <NavLink key={item.href} item={item} pathname={pathname} />)}
          </>
        )}

        {config.length > 0 && (
          <>
            <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider px-2 mt-4 mb-2">Configuración</p>
            {config.map(item => <NavLink key={item.href} item={item} pathname={pathname} />)}
          </>
        )}
      </nav>

      <div className="px-3 py-3 border-t border-zinc-100 space-y-0.5">
        {hasSuperadminTokens && (
          <button
            onClick={handleReturnToSuperadmin}
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-primary-600 hover:text-primary-700 hover:bg-primary-50 transition-colors font-medium"
          >
            <ArrowLeft size={16} />
            Volver al Superadmin
          </button>
        )}
        {isSuperAdmin && !hasSuperadminTokens && (
          <Link
            href="/superadmin"
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-primary-600 hover:text-primary-700 hover:bg-primary-50 transition-colors font-medium"
          >
            <ShieldCheck size={16} />
            Superadmin
          </Link>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50 transition-colors"
        >
          <LogOut size={16} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}

function NavLink({ item, pathname }: { item: typeof navItems[0]; pathname: string }) {
  const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      className={clsx(
        'flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm transition-colors',
        active ? 'bg-primary-50 text-primary-700 font-medium' : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'
      )}
    >
      <Icon size={16} className={active ? 'text-primary-600' : 'text-zinc-400'} />
      {item.label}
    </Link>
  )
}

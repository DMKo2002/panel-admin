'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, ShoppingCart, Shirt,
  Bell, Settings, LogOut, Store, FolderOpen, Palette
} from 'lucide-react'
import clsx from 'clsx'

const navItems = [
  { label: 'Dashboard',       href: '/dashboard',                icon: LayoutDashboard },
  { label: 'Pedidos',         href: '/dashboard/pedidos',        icon: ShoppingCart },
  { label: 'Productos',       href: '/dashboard/productos',      icon: Shirt },
  { label: 'Categorías',      href: '/dashboard/categorias',     icon: FolderOpen },
  { label: 'Notificaciones',   href: '/dashboard/notificaciones',  icon: Bell },
  { label: 'Mi tienda',        href: '/dashboard/tienda',          icon: Settings },
  { label: 'Personalización',  href: '/dashboard/personalizacion', icon: Palette },
]

interface SidebarProps {
  storeName: string
  storeDomain: string
}

export default function Sidebar({ storeName, storeDomain }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-56 flex-shrink-0 h-screen bg-white border-r border-zinc-200 flex flex-col">

      {/* Marca del local */}
      <div className="px-4 py-4 border-b border-zinc-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
            <Store size={16} className="text-violet-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900 truncate">{storeName}</p>
            <p className="text-xs text-zinc-400 truncate">{storeDomain}</p>
          </div>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider px-2 mb-2">
          General
        </p>
        {navItems.slice(0, 2).map(item => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}

        <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider px-2 mt-4 mb-2">
          Catálogo
        </p>
        {navItems.slice(2, 4).map(item => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}

        <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider px-2 mt-4 mb-2">
          Configuración
        </p>
        {navItems.slice(4).map(item => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>

      {/* Logout */}
      <div className="px-3 py-3 border-t border-zinc-100">
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
        active
          ? 'bg-violet-50 text-violet-700 font-medium'
          : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'
      )}
    >
      <Icon size={16} className={active ? 'text-violet-600' : 'text-zinc-400'} />
      {item.label}
    </Link>
  )
}

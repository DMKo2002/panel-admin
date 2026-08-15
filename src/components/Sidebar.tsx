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
import { SETTINGS_ROUTES, hasSettingsPermission, type StaffPermissions } from '@/lib/settings-nav'

// Los ítems de "Configuración de la tienda" (General, Contacto, Cobranzas,
// Envíos, Catálogo, Apariencia, Legal, Notificaciones) más Dominio, SEO,
// Google Analytics, Cuentas y Plan y uso viven en src/lib/settings-nav.ts
// — única fuente de verdad, compartida con src/proxy.ts para que el bloqueo
// real de rutas y lo que se ve acá nunca queden desincronizados. `key`
// definido = ítem gateado por permissions (staff); sin key = siempre visible.
const navItems = [
  { label: 'Dashboard',              href: '/dashboard',              icon: LayoutDashboard, key: undefined as string | undefined },
  { label: 'Pedidos',                href: '/dashboard/pedidos',      icon: ShoppingCart,     key: undefined as string | undefined },
  { label: 'Informes & Estadísticas', href: '/dashboard/estadisticas', icon: BarChart3,       key: undefined as string | undefined },
  { label: 'Productos',              href: '/dashboard/productos',    icon: Shirt,            key: undefined as string | undefined },
  { label: 'Categorías',             href: '/dashboard/categorias',   icon: FolderOpen,       key: undefined as string | undefined },
  { label: 'Clientes',               href: '/dashboard/clientes',     icon: Users,            key: undefined as string | undefined },
  ...SETTINGS_ROUTES.map(r => ({ label: r.label, href: r.href, icon: r.icon, key: r.key as string | undefined })),
]

// Grupos visuales del Panel, de arriba a abajo: Inicio, un bloque general
// sin encabezado, Configuración de la tienda, otro bloque sin encabezado,
// y por último — pegado a "Cerrar sesión" — Cuentas y Plan y uso.
const INICIO_HREFS = ['/dashboard', '/dashboard/dominio']
const GENERAL_HREFS = ['/dashboard/pedidos', '/dashboard/estadisticas']
const CONFIG_HREFS = SETTINGS_ROUTES
  .filter(r => !['dominio', 'seo', 'google-analytics', 'cuentas', 'uso'].includes(r.key))
  .map(r => r.href)
const TIENDA_HREFS = ['/dashboard/productos', '/dashboard/categorias']
const MARKETING_HREFS = ['/dashboard/clientes', '/dashboard/seo', '/dashboard/google-analytics']
const FOOTER_HREFS = ['/dashboard/cuentas', '/dashboard/uso']

interface SidebarProps {
  storeName: string
  storeDomain: string
  isSuperAdmin?: boolean
  role?: string | null
  permissions?: StaffPermissions | null
  // Drawer en mobile — en desktop (md+) el sidebar siempre se ve, estos dos
  // props no hacen nada ahí. Ver DashboardShell.tsx para el botón que abre.
  mobileOpen?: boolean
  onClose?: () => void
}

export default function Sidebar({ storeName, storeDomain, isSuperAdmin, role, permissions, mobileOpen = false, onClose }: SidebarProps) {
  const isStaff = role === 'staff'
  const visibleItems = navItems.filter(item => !isStaff || !item.key || hasSettingsPermission(permissions, item.key))
  const inicio = visibleItems.filter(i => INICIO_HREFS.includes(i.href))
  const general = visibleItems.filter(i => GENERAL_HREFS.includes(i.href))
  const config = visibleItems.filter(i => CONFIG_HREFS.includes(i.href))
  const tienda = visibleItems.filter(i => TIENDA_HREFS.includes(i.href))
  const marketing = visibleItems.filter(i => MARKETING_HREFS.includes(i.href))
  const footer = visibleItems.filter(i => FOOTER_HREFS.includes(i.href))
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
    <>
      {/* Fondo oscuro atrás del drawer en mobile — tocarlo cierra el menú.
          En desktop no se renderiza nada porque mobileOpen nunca se prende ahí. */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={clsx(
          'w-64 md:w-56 flex-shrink-0 h-screen bg-white border-r border-zinc-200 flex flex-col',
          'fixed inset-y-0 left-0 z-40 transition-transform duration-200 ease-out',
          'md:static md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
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

        <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3 space-y-0.5">
          {inicio.length > 0 && (
            <>
              <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider px-2 mb-2">Inicio</p>
              {inicio.map(item => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onClose} />)}
            </>
          )}

          {general.map(item => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onClose} />)}

          {config.length > 0 && (
            <>
              <div className="h-4" />
              <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider px-2 mb-2">Configuración de la tienda</p>
              {config.map(item => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onClose} />)}
            </>
          )}

          {tienda.length > 0 && (
            <>
              <div className="h-4" />
              <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider px-2 mb-2">Tienda</p>
              {tienda.map(item => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onClose} />)}
            </>
          )}

          {marketing.length > 0 && (
            <>
              <div className="h-4" />
              <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider px-2 mb-2">Marketing</p>
              {marketing.map(item => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onClose} />)}
            </>
          )}
        </nav>

        <div className="px-3 py-3 border-t border-zinc-100">
          {footer.length > 0 && (
            <div className="space-y-0.5 mb-3">
              {footer.map(item => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onClose} />)}
            </div>
          )}
          <div className="space-y-0.5">
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
        </div>
      </aside>
    </>
  )
}

function NavLink({ item, pathname, onNavigate }: { item: typeof navItems[0]; pathname: string; onNavigate?: () => void }) {
  const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
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

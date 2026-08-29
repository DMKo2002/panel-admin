'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, ShoppingCart, Shirt,
  FolderOpen, LogOut, Store, ShieldCheck, Users, ArrowLeft, BarChart3, UserCircle2, Crown, Pencil, Check, X,
  ChevronUp, CreditCard
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
  // .filter(!hidden): "Arrepentimiento" sigue en SETTINGS_ROUTES (bloqueo a
  // staff y permiso granular intactos) pero ya no se ve como ítem propio acá
  // -- 2026-08-29, pedido de ARam, ver comentario en settings-nav.ts.
  ...SETTINGS_ROUTES.filter(r => !r.hidden).map(r => ({ label: r.label, href: r.href, icon: r.icon, key: r.key as string | undefined })),
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
// 'uso' (Plan y uso) volvió al footer el 2026-08-22 — ver comentario en
// settings-nav.ts.
const FOOTER_HREFS = ['/dashboard/cuentas', '/dashboard/uso']

interface SidebarProps {
  storeName: string
  storeDomain: string
  isSuperAdmin?: boolean
  role?: string | null
  permissions?: StaffPermissions | null
  // Promoción "Founders" (2026-08-24) — precio Business para siempre,
  // límites de Premium. Badge visible SOLO acá, en el Panel Admin del propio
  // dueño de la tienda (ver dashboard/layout.tsx) — no en Superadmin (que
  // tiene su propio badge en la tabla) ni en la tienda pública.
  isFounder?: boolean
  // Drawer en mobile — en desktop (md+) el sidebar siempre se ve, estos dos
  // props no hacen nada ahí. Ver DashboardShell.tsx para el botón que abre.
  mobileOpen?: boolean
  onClose?: () => void
}

export default function Sidebar({ storeName, storeDomain, isSuperAdmin, role, permissions, isFounder, mobileOpen = false, onClose }: SidebarProps) {
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

  // Menú de cuenta (2026-08-25, pedido de ARam) — antes "Cuentas", "Plan y
  // uso", "Volver al Superadmin", "Mi cuenta" y "Cerrar sesión" eran 5 ítems
  // sueltos apilados al pie del sidebar; con Facturación sumándose eran
  // demasiados. Ahora un solo ícono de cuenta abre un menú que despliega
  // hacia arriba (mismo patrón que el menú de cuenta de Claude Desktop) con
  // todo agrupado, en este orden: Mi cuenta, Cuentas de Admin, Plan y Uso,
  // Facturación, Volver al superadmin, Cerrar sesión.
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!accountMenuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [accountMenuOpen])

  // "Cuentas de Admin" y "Plan y Uso" siguen gateados por el mismo permiso
  // granular de siempre (ver footer/hasSettingsPermission más arriba) — acá
  // solo se sacan del array ya filtrado, no se duplica la lógica de permisos.
  const cuentasItem = footer.find(i => i.href === '/dashboard/cuentas')
  const usoItem = footer.find(i => i.href === '/dashboard/uso')
  // Facturación es la misma "cuenta/facturación del dueño en gounuri.com"
  // que Plan y Uso enlaza — mismo permiso ('uso'), un acceso más directo.
  const showFacturacion = !isStaff || hasSettingsPermission(permissions, 'uso')

  // Editar el nombre de la tienda (2026-08-24, pedido de David — antes no
  // había NINGÚN lugar del Panel Admin para hacerlo). displayName arranca
  // del prop storeName (viene de dashboard/layout.tsx) y se pisa local acá
  // apenas guarda, para no depender de un refresh completo del layout
  // (server component) para verlo reflejado.
  const [displayName, setDisplayName] = useState(storeName)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(storeName)
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  function startEditingName() {
    setNameInput(displayName)
    setNameError(null)
    setEditingName(true)
  }

  function cancelEditingName() {
    setEditingName(false)
    setNameInput(displayName)
    setNameError(null)
  }

  async function handleSaveName() {
    const trimmed = nameInput.trim()
    if (!trimmed) { setNameError('El nombre no puede estar vacío'); return }
    if (trimmed === displayName) { setEditingName(false); return }
    setSavingName(true)
    setNameError(null)
    const res = await fetch('/api/nombre-tienda', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.error) {
      setNameError(data.error ?? 'No se pudo guardar el nombre')
      setSavingName(false)
      return
    }
    setDisplayName(trimmed)
    setSavingName(false)
    setEditingName(false)
    router.refresh()
  }

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
            <div className="min-w-0 flex-1">
              {editingName ? (
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveName()
                      if (e.key === 'Escape') cancelEditingName()
                    }}
                    maxLength={60}
                    disabled={savingName}
                    className="min-w-0 flex-1 text-sm font-semibold text-zinc-900 border border-zinc-300 rounded px-1.5 py-0.5 focus:outline-none focus:border-primary-500 disabled:opacity-50"
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={savingName}
                    title="Guardar"
                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={cancelEditingName}
                    disabled={savingName}
                    title="Cancelar"
                    className="p-1 text-zinc-400 hover:bg-zinc-100 rounded transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <p className="text-sm font-semibold text-zinc-900 truncate">{displayName}</p>
                  {!isStaff && (
                    <button
                      onClick={startEditingName}
                      title="Editar nombre de la tienda"
                      className="p-0.5 text-zinc-400 hover:text-zinc-600 transition-colors flex-shrink-0"
                    >
                      <Pencil size={11} />
                    </button>
                  )}
                </div>
              )}
              <p className="text-xs text-zinc-400 truncate">{storeDomain}</p>
              {nameError && <p className="text-[11px] text-red-500 mt-0.5">{nameError}</p>}
            </div>
          </div>
          {isFounder && (
            <div
              title="Precio Business para siempre, con los límites de uso de Premium"
              className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200"
            >
              <Crown size={11} />
              Founder
            </div>
          )}
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

        <div ref={accountMenuRef} className="relative px-3 py-3 border-t border-zinc-100">
          {accountMenuOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-2 bg-white border border-zinc-200 rounded-xl shadow-lg py-1.5 space-y-0.5 z-50">
              <Link
                href="/dashboard/mi-cuenta"
                onClick={() => { setAccountMenuOpen(false); onClose?.() }}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
              >
                <UserCircle2 size={16} className="text-zinc-400" />
                Mi cuenta
              </Link>
              {cuentasItem && (
                <Link
                  href={cuentasItem.href}
                  onClick={() => { setAccountMenuOpen(false); onClose?.() }}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
                >
                  <Users size={16} className="text-zinc-400" />
                  Cuentas de Admin
                </Link>
              )}
              {usoItem && (
                <Link
                  href={usoItem.href}
                  onClick={() => { setAccountMenuOpen(false); onClose?.() }}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
                >
                  <usoItem.icon size={16} className="text-zinc-400" />
                  Plan y Uso
                </Link>
              )}
              {showFacturacion && (
                // Antes abría gounuri.com/perfil/plan en pestaña nueva --
                // 2026-08-26, pedido de ARam: la facturación/suscripción
                // ahora vive DENTRO de Panel Admin (ver
                // src/app/dashboard/facturacion/suscripcion/page.tsx), así
                // que es navegación interna como el resto del menú.
                <Link
                  href="/facturacion/suscripcion"
                  onClick={() => { setAccountMenuOpen(false); onClose?.() }}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
                >
                  <CreditCard size={16} className="text-zinc-400" />
                  Facturación
                </Link>
              )}
              {hasSuperadminTokens && (
                <button
                  onClick={() => { setAccountMenuOpen(false); handleReturnToSuperadmin() }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-primary-600 hover:bg-primary-50 hover:text-primary-700 transition-colors"
                >
                  <ArrowLeft size={16} />
                  Volver al Superadmin
                </button>
              )}
              {isSuperAdmin && !hasSuperadminTokens && (
                <Link
                  href="/superadmin"
                  onClick={() => setAccountMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-primary-600 hover:bg-primary-50 hover:text-primary-700 transition-colors"
                >
                  <ShieldCheck size={16} />
                  Superadmin
                </Link>
              )}
              <div className="my-1 border-t border-zinc-100" />
              <button
                onClick={() => { setAccountMenuOpen(false); handleLogout() }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
              >
                <LogOut size={16} />
                Cerrar sesión
              </button>
            </div>
          )}

          <button
            onClick={() => setAccountMenuOpen(o => !o)}
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
          >
            <UserCircle2 size={18} className="text-zinc-400" />
            <span className="flex-1 text-left truncate">Cuenta</span>
            <ChevronUp size={14} className={clsx('text-zinc-400 transition-transform', accountMenuOpen && 'rotate-180')} />
          </button>
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

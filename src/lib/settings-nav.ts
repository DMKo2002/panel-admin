// Fuente única de verdad para la navegación de "Configuración" en el Panel
// Admin y para qué rutas están bloqueadas a cuentas role='staff'.
//
// Antes había dos listas mantenidas a mano por separado (STAFF_BLOCKED_PREFIXES
// en src/proxy.ts + el flag staffBlocked en src/components/Sidebar.tsx), con
// riesgo real de que alguien agregue una página nueva y se olvide de bloquearla
// en uno de los dos lugares. Ahora ambos leen de acá.
//
// staffBlocked: true = por ahora ningún 'staff' puede entrar. Es un booleano
// binario (todo o nada) — permisos granulares por cuenta individual son un
// paso futuro (ver Cuentas), pero cuando eso exista, esta lista sigue siendo
// el default/piso mínimo de bloqueo para cuentas sin permisos explícitos.
import type { LucideIcon } from 'lucide-react'
import { Settings, CreditCard, Truck, Tags, Phone, Bell, Palette, FileText, KeyRound } from 'lucide-react'

export interface SettingsRoute {
  key: string
  label: string
  href: string
  icon: LucideIcon
  staffBlocked: boolean
}

export const SETTINGS_ROUTES: SettingsRoute[] = [
  { key: 'general',        label: 'General',           href: '/dashboard/general',        icon: Settings,   staffBlocked: true },
  { key: 'pagos',          label: 'Pagos y Finanzas',  href: '/dashboard/pagos',          icon: CreditCard, staffBlocked: true },
  { key: 'envios',         label: 'Envíos',            href: '/dashboard/envios',         icon: Truck,      staffBlocked: true },
  { key: 'catalogo-config',label: 'Catálogo',          href: '/dashboard/catalogo-config',icon: Tags,       staffBlocked: true },
  { key: 'contacto',       label: 'Contacto y Redes',  href: '/dashboard/contacto',       icon: Phone,      staffBlocked: true },
  { key: 'notificaciones', label: 'Notificaciones',    href: '/dashboard/notificaciones', icon: Bell,       staffBlocked: true },
  { key: 'apariencia',     label: 'Apariencia',        href: '/dashboard/apariencia',     icon: Palette,    staffBlocked: true },
  { key: 'legal',          label: 'Legal',             href: '/dashboard/legal',          icon: FileText,   staffBlocked: true },
  { key: 'cuentas',        label: 'Cuentas',           href: '/dashboard/cuentas',        icon: KeyRound,   staffBlocked: true },
]

// Usado por src/proxy.ts (matcher de prefijos de ruta)
export const STAFF_BLOCKED_PREFIXES = SETTINGS_ROUTES.filter(r => r.staffBlocked).map(r => r.href)

// Permisos granulares por cuenta staff (columna users.permissions, JSONB).
// 'cuentas' queda afuera a propósito: gestionar accesos es siempre exclusivo
// del owner, nunca delegable via permiso — así una cuenta staff no puede
// terminar dándose a sí misma (ni a otra) más acceso del que tiene.
export type StaffPermissions = Record<string, boolean>
export const GRANTABLE_SETTINGS_ROUTES = SETTINGS_ROUTES.filter(r => r.key !== 'cuentas')

// true solo si el permiso está explícitamente en true. null/undefined/false
// (incluida la ausencia total de la clave) siempre bloquean — fail-closed,
// mismo criterio que los GRANT de store_config documentados en CLAUDE.md.
export function hasSettingsPermission(permissions: StaffPermissions | null | undefined, key: string): boolean {
  if (key === 'cuentas') return false
  return permissions?.[key] === true
}

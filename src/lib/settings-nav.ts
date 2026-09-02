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
import { Settings, CreditCard, Truck, Tags, Phone, Bell, Palette, FileText, KeyRound, Search, Globe, BarChart3, PieChart, Undo2 } from 'lucide-react'

export interface SettingsRoute {
  key: string
  label: string
  href: string
  icon: LucideIcon
  staffBlocked: boolean
  // true = no aparece como ítem propio en el Sidebar, pero sigue existiendo
  // acá para todo lo demás (bloqueo a staff vía STAFF_BLOCKED_PREFIXES,
  // permiso granular vía GRANTABLE_SETTINGS_ROUTES) -- 2026-08-29, pedido de
  // ARam: "Arrepentimiento" quedaba muy visible como ítem propio del menú;
  // se mudó a un botón adentro de Legal (ver legal/page.tsx) en vez de
  // sacarla de la lista, así el bloqueo a staff no se pierde.
  hidden?: boolean
}

// Orden = orden real en el Panel (ver Sidebar.tsx: Inicio agarra 'dominio',
// el bloque de Configuración de la tienda agarra general..notificaciones,
// y el footer agarra 'cuentas'/'uso'). Este array sigue siendo la única
// fuente de verdad de rutas/keys/permisos — acá solo se reordenó y se
// renombraron un par de labels, nada de lógica cambió.
export const SETTINGS_ROUTES: SettingsRoute[] = [
  { key: 'general',        label: 'General',              href: '/dashboard/general',          icon: Settings,   staffBlocked: true },
  { key: 'contacto',       label: 'Contacto y Redes',     href: '/dashboard/contacto',         icon: Phone,      staffBlocked: true },
  { key: 'pagos',          label: 'Cobranzas & Finanzas', href: '/dashboard/pagos',            icon: CreditCard, staffBlocked: true },
  { key: 'envios',         label: 'Envíos',                href: '/dashboard/envios',           icon: Truck,      staffBlocked: true },
  { key: 'catalogo-config',label: 'Catálogo',              href: '/dashboard/catalogo-config',  icon: Tags,       staffBlocked: true },
  { key: 'apariencia',     label: 'Apariencia',            href: '/dashboard/apariencia',       icon: Palette,    staffBlocked: true },
  { key: 'legal',          label: 'Legal',                 href: '/dashboard/legal',            icon: FileText,   staffBlocked: true },
  { key: 'arrepentimiento', label: 'Arrepentimiento',       href: '/dashboard/arrepentimiento',  icon: Undo2,      staffBlocked: true, hidden: true },
  { key: 'notificaciones', label: 'Notificaciones',        href: '/dashboard/notificaciones',   icon: Bell,       staffBlocked: true },
  { key: 'dominio',        label: 'Dominio',               href: '/dashboard/dominio',          icon: Globe,      staffBlocked: true },
  { key: 'seo',            label: 'SEO',                   href: '/dashboard/seo',              icon: Search,     staffBlocked: true },
  { key: 'google-analytics', label: 'Google Analytics',    href: '/dashboard/google-analytics', icon: BarChart3, staffBlocked: true },
  { key: 'cuentas',        label: 'Cuentas',               href: '/dashboard/cuentas',          icon: KeyRound,   staffBlocked: true },
  // 'uso' (Plan y uso) se sacó de acá el 2026-08-18 (self-serve no existía
  // todavía) y se repuso el 2026-08-22, ahora que gounuri.com/perfil/plan
  // tiene un flujo real de cambio de plan — ver /dashboard/uso/page.tsx.
  { key: 'uso',            label: 'Plan y uso',            href: '/dashboard/uso',              icon: PieChart,   staffBlocked: true },
]

// URL externa de gounuri.com/perfil/plan — YA NO SE USA para navegación
// interna de Panel Admin (2026-09-02: /dashboard/uso/page.tsx y el menú de
// cuenta en Sidebar.tsx mandaban acá y era un bug -- gounuri.com tiene un
// login separado del de Panel Admin, así que un tenant ya logueado caía en
// una pantalla de login en vez de ir a /dashboard/facturacion/suscripcion,
// que es donde vive ese flujo DENTRO de Panel Admin desde el 2026-08-26.
// Ver project_grace_banner_activar_plan_link en memoria. Se deja el export
// sin borrar por si algo externo a Panel Admin todavía lo necesita (ver
// mismo valor hardcodeado, por separado, en api/cron/enforce/route.ts para
// el mail de aviso de vencimiento -- ese sí es un link para abrir desde el
// mail, sin sesión de Panel Admin todavía, así que no aplica el mismo fix).
export const GOUNURI_PLAN_URL = 'https://www.gounuri.com/perfil/plan'

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

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { isSuperAdmin } from '@/lib/superadmin'
import { SETTINGS_ROUTES, hasSettingsPermission, type StaffPermissions } from '@/lib/settings-nav'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function redirectTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  return NextResponse.redirect(url)
}

// Rutas viejas (ahora redirects del lado del cliente) — se dejan bloqueadas
// acá también por las dudas de que alguien llegue antes de que corra el
// redirect. Nunca son otorgables via permisos.
const LEGACY_STAFF_BLOCKED_PREFIXES = [
  '/dashboard/tienda',
  '/dashboard/personalizacion',
  '/dashboard/test-mp',
]

// Cookie a nivel .gounuri.com para compartir sesión con gounuri.com — ver
// nota en lib/supabase/client.ts. Solo en producción.
const COOKIE_DOMAIN = process.env.NODE_ENV === 'production' ? '.gounuri.com' : undefined

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { domain: COOKIE_DOMAIN },
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  // 1. Sin sesion -> login
  if (!user && path.startsWith('/dashboard')) return redirectTo(request, '/login')
  // Rutas publicas: no redirigir si no hay sesion
  const publicPaths = ['/login', '/registro', '/reset-password', '/update-password']
  if (!user && publicPaths.some(pp => path.startsWith(pp))) return supabaseResponse
  if (!user && path === '/onboarding') return redirectTo(request, '/login')

  // 2. Ya logueado -> no volver al login
  if (user && ['/login', '/registro', '/reset-password'].some(pp => path.startsWith(pp))) return redirectTo(request, '/dashboard')

  // 3. Con sesion -> verificar tenant
  if (user && (path.startsWith('/dashboard') || path === '/onboarding')) {
    // Si no hay service role key configurada, dejamos pasar (el layout maneja auth)
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('[middleware] SUPABASE_SERVICE_ROLE_KEY no configurada - saltando verificacion de tenant')
      return supabaseResponse
    }

    const { data: _userRows, error: queryError } = await serviceClient()
      .from('users')
      .select('tenant_id, role, permissions')
      .eq('id', user.id)
      .limit(1)

    // Si la query fallo (key mal configurada, red, etc.) dejamos pasar
    if (queryError) {
      console.error('[middleware] Error consultando users:', queryError.message)
      return supabaseResponse
    }

    const userRow = _userRows?.[0]
    const hasTenant = !!userRow?.tenant_id

    if (!hasTenant && path.startsWith('/dashboard')) {
      // Superadmins sin tenant van a /superadmin, no a onboarding
      return redirectTo(request, isSuperAdmin(user.email) ? '/superadmin' : '/onboarding')
    }
    if (hasTenant && path === '/onboarding') return redirectTo(request, '/dashboard')

    // Cuentas 'staff' (empleados): acceso granular por cuenta a las páginas
    // de Configuración (users.permissions), 'cuentas' y las rutas legacy
    // siempre bloqueadas sin excepción.
    if (hasTenant && userRow?.role === 'staff') {
      if (LEGACY_STAFF_BLOCKED_PREFIXES.some(p => path.startsWith(p))) {
        return redirectTo(request, '/dashboard')
      }
      const matchedRoute = SETTINGS_ROUTES.find(r => path.startsWith(r.href))
      if (matchedRoute && !hasSettingsPermission(userRow.permissions as StaffPermissions | null, matchedRoute.key)) {
        return redirectTo(request, '/dashboard')
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/dashboard', '/dashboard/:path*', '/superadmin/:path*', '/superadmin', '/onboarding', '/login', '/registro', '/reset-password', '/update-password'],
}

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { isSuperAdmin } from '@/lib/superadmin'
import { STAFF_BLOCKED_PREFIXES as SETTINGS_STAFF_BLOCKED_PREFIXES } from '@/lib/settings-nav'

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

// Secciones bloqueadas para cuentas con role='staff' (empleados con acceso
// limitado a Pedidos, Clientes, Productos, Categorias y Precios).
// La lista vive en src/lib/settings-nav.ts — única fuente de verdad,
// compartida con el Sidebar para que nunca queden desincronizados.
// /dashboard/tienda y /dashboard/personalizacion son rutas viejas (ahora
// redirects) — se dejan bloqueadas acá también por las dudas de que alguien
// llegue a ellas antes de que el redirect del cliente corra.
const STAFF_BLOCKED_PREFIXES = [
  ...SETTINGS_STAFF_BLOCKED_PREFIXES,
  '/dashboard/tienda',
  '/dashboard/personalizacion',
  '/dashboard/test-mp',
]

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
      .select('tenant_id, role')
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

    // Cuentas 'staff' (empleados) no pueden acceder a secciones sensibles
    if (hasTenant && userRow?.role === 'staff' && STAFF_BLOCKED_PREFIXES.some(p => path.startsWith(p))) {
      return redirectTo(request, '/dashboard')
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/dashboard', '/dashboard/:path*', '/superadmin/:path*', '/superadmin', '/onboarding', '/login', '/registro', '/reset-password', '/update-password'],
}

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { isSuperAdmin } from '@/lib/superadmin'

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

  // 1. Sin sesión → login
  if (!user && path.startsWith('/dashboard')) return redirectTo(request, '/login')
  // Rutas públicas: no redirigir si no hay sesión
  const publicPaths = ['/login', '/registro', '/reset-password', '/update-password']
  if (!user && publicPaths.some(pp => path.startsWith(pp))) return supabaseResponse
  if (!user && path === '/onboarding') return redirectTo(request, '/login')

  // 2. Ya logueado → no volver al login
  if (user && ['/login', '/registro', '/reset-password'].some(pp => path.startsWith(pp))) return redirectTo(request, '/dashboard')

  // 3. Con sesión → verificar tenant
  if (user && (path.startsWith('/dashboard') || path === '/onboarding')) {
    // Si no hay service role key configurada, dejamos pasar (el layout maneja auth)
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('[middleware] SUPABASE_SERVICE_ROLE_KEY no configurada — saltando verificación de tenant')
      return supabaseResponse
    }

    const { data: _userRows, error: queryError } = await serviceClient()
      .from('users')
      .select('tenant_id')
      .eq('id', user.id)
      .limit(1)

    // Si la query falló (key mal configurada, red, etc.) dejamos pasar
    if (queryError) {
      console.error('[middleware] Error consultando users:', queryError.message)
      return supabaseResponse
    }

    const hasTenant = !!_userRows?.[0]?.tenant_id

    if (!hasTenant && path.startsWith('/dashboard')) {
      // Superadmins sin tenant van a /superadmin, no a onboarding
      return redirectTo(request, isSuperAdmin(user.email) ? '/superadmin' : '/onboarding')
    }
    if (hasTenant && path === '/onboarding') return redirectTo(request, '/dashboard')
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/dashboard', '/dashboard/:path*', '/superadmin/:path*', '/superadmin', '/onboarding', '/login', '/registro', '/reset-password', '/update-password'],
}

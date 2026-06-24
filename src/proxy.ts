import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

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
  if (!user && path === '/onboarding') return redirectTo(request, '/login')

  // 2. Ya logueado → no volver al login
  if (user && path === '/login') return redirectTo(request, '/dashboard')

  // 3. Con sesión → verificar tenant
  if (user && (path.startsWith('/dashboard') || path === '/onboarding')) {
    // Si no hay service role key configurada, dejamos pasar (el layout maneja auth)
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('[middleware] SUPABASE_SERVICE_ROLE_KEY no configurada — saltando verificación de tenant')
      return supabaseResponse
    }

    const { data: userRow, error: queryError } = await serviceClient()
      .from('users')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    // Si la query falló (key mal configurada, red, etc.) dejamos pasar
    // Es mejor que dejar al usuario atrapado en onboarding
    if (queryError) {
      console.error('[middleware] Error consultando users:', queryError.message)
      return supabaseResponse
    }

    const hasTenant = !!userRow?.tenant_id

    if (!hasTenant && path.startsWith('/dashboard')) return redirectTo(request, '/onboarding')
    if (hasTenant && path === '/onboarding') return redirectTo(request, '/dashboard')
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding', '/login'],
}

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

// Cliente service-role para el middleware — bypasea RLS en Edge Runtime
// El anon-key + RLS no propaga la sesión correctamente en middleware de Next.js
function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function redirect(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  return NextResponse.redirect(url)
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  // Cliente SSR para auth (lee session del cookie)
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

  // 1. Sin sesión → solo puede ir al login
  if (!user && path.startsWith('/dashboard')) return redirect(request, '/login')
  if (!user && path === '/onboarding') return redirect(request, '/login')

  // 2. Con sesión en login → ir al dashboard
  if (user && path === '/login') return redirect(request, '/dashboard')

  // 3 & 4. Con sesión → verificar tenant usando service role (bypasea RLS)
  if (user && (path.startsWith('/dashboard') || path === '/onboarding')) {
    const { data: userRow } = await serviceClient()
      .from('users')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    const hasTenant = !!userRow?.tenant_id

    if (!hasTenant && path.startsWith('/dashboard')) return redirect(request, '/onboarding')
    if (hasTenant && path === '/onboarding') return redirect(request, '/dashboard')
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/onboarding',
    '/login',
  ],
}

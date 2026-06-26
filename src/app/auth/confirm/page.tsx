'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthConfirmPage() {
  const router = useRouter()

  useEffect(() => {
    const hash = window.location.hash.slice(1) // quitar el #
    const params = new URLSearchParams(hash)
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')

    if (access_token && refresh_token) {
      // Tenemos tokens del magic link — los enviamos al servidor directamente
      // sin pasar por onAuthStateChange (que puede dispararse con sesión vieja)
      fetch('/api/auth/set-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token, refresh_token }),
      }).then(() => {
        // Avisar al superadmin (otras pestañas) que restaure su sesión
        try {
          const bc = new BroadcastChannel('creart_session_restore')
          bc.postMessage({ type: 'impersonation_done' })
          bc.close()
        } catch {}
        window.location.href = '/dashboard'
      })
      return
    }

    // Sin tokens en el hash: usar sesión existente o ir al login
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      router.replace(session ? '/dashboard' : '/login')
    })
  }, [router])

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-zinc-400 text-sm">Iniciando sesión...</p>
      </div>
    </div>
  )
}

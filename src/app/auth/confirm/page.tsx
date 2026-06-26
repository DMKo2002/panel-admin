'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Página intermediaria que procesa el hash token del magic link
// y redirige al dashboard una vez establecida la sesión
export default function AuthConfirmPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const hash = window.location.hash
    const hasMagicToken = hash.includes('access_token=')

    if (!hasMagicToken) {
      // Sin token de magic link: usar sesión existente o ir al login
      supabase.auth.getSession().then(({ data: { session } }) => {
        router.replace(session ? '/dashboard' : '/login')
      })
      return
    }

    // Hay token de magic link: esperar el SIGNED_IN con el usuario nuevo
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        subscription.unsubscribe()
        // Full page reload para que el server lea las cookies nuevas (no SPA navigation)
        window.location.href = '/dashboard'
      }
    })

    return () => subscription.unsubscribe()
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

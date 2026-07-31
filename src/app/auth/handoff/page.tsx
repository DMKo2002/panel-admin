'use client'

// Handoff de sesión desde gounuri.com: el onboarding manda access_token y
// refresh_token en el fragment de la URL (#...) — el fragment nunca viaja al
// server ni queda en logs. Acá se setea la sesión y se entra al dashboard.

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function AuthHandoffPage() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')

    if (!access_token || !refresh_token) {
      window.location.replace('/login')
      return
    }

    // Limpiar los tokens de la barra de direcciones antes de nada
    window.history.replaceState(null, '', '/auth/handoff')

    const supabase = createClient()
    supabase.auth.setSession({ access_token, refresh_token }).then(({ error: err }) => {
      if (err) {
        setError('No se pudo iniciar sesión. Ingresá con tu email y contraseña.')
        setTimeout(() => window.location.replace('/login'), 2500)
        return
      }
      window.location.replace('/dashboard')
    })
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="text-center">
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <>
            <Loader2 size={24} className="animate-spin text-zinc-400 mx-auto" />
            <p className="mt-3 text-sm text-zinc-500">Entrando a tu panel...</p>
          </>
        )}
      </div>
    </div>
  )
}

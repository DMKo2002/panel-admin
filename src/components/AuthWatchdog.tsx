'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// Corta en seco el loop de refresh token roto en el momento en que el
// propio SDK de Supabase lo detecta — ver incidente 2026-08-18 (cliente
// Caloria) y el comentario en lib/supabase/client.ts. El evento
// SIGNED_OUT se dispara apenas el auto-refresh interno falla de forma
// DEFINITIVA (ej. refresh_token_not_found) — antes eso pasaba en
// silencio y la pestaña se quedaba viva, sin sesión útil, con el SDK
// reintentando en segundo plano. Acá, apenas se dispara, forzamos una
// navegación dura a /login (no router.push: queremos que el browser
// tire el estado de JS actual, no que Next intente renderizar de nuevo
// con una sesión que ya no existe).
export default function AuthWatchdog() {
  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT') return
      const path = window.location.pathname
      const protegida = path.startsWith('/dashboard') || path.startsWith('/superadmin') || path === '/onboarding'
      if (protegida) window.location.href = '/login'
    })

    return () => subscription.unsubscribe()
  }, [])

  return null
}

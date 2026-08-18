'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// v2 — 18/08/2026, mismo día. La v1 de este archivo redirigía duro a
// /login apenas el SDK disparaba SIGNED_OUT. Eso resultó ser DEMASIADO
// agresivo: con varias pestañas del panel abiertas (uso normal en un
// local, ver incidente Caloria), Supabase rota el refresh token en cada
// uso — la pestaña que NO hizo el último refresh se queda con un token
// viejo y, cuando le toca renovar a ella, falla con
// refresh_token_not_found aunque la SESIÓN en sí siga viva (la rotó otra
// pestaña, no el usuario). Eso disparaba el redirect duro en esa pestaña
// de la nada — el "flash: entro, desaparece la pantalla y vuelve a
// aparecer" que reportó Caloria — y como se re-logueaban ahí mismo, se
// generaba un login nuevo cada vez, sin resolver nada de fondo.
//
// Acá el único objetivo real es CORTAR EL LOOP DE REINTENTOS (evitar que
// varias pestañas re-golpeen /token sin parar y tumben el rate limit de
// Auth para todo el proyecto). No hace falta redirigir para lograr eso:
// alcanza con avisarle al SDK que deje de reintentar solo en esta
// pestaña. Si la sesión está realmente muerta (no fue una rotación de
// otra pestaña), la próxima navegación ya pasa por el middleware
// (proxy.ts) que la manda a /login igual — ese camino ya está probado y
// no es disruptivo a mitad de nada.
export default function AuthWatchdog() {
  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT') return
      // No autoRefresh en null → no más reintentos sueltos de esta pestaña.
      supabase.auth.stopAutoRefresh()
    })

    // Si el usuario vuelve a esta pestaña (la dejó de fondo mientras
    // refrescaba en otra), reintentamos una vez el auto-refresh — capaz
    // el token ya es válido de nuevo porque otra pestaña lo rotó.
    const onVisible = () => {
      if (document.visibilityState === 'visible') supabase.auth.startAutoRefresh()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return null
}
'use client'

// Botones de "Continuar con Google/Facebook" — mismo componente y misma
// idea que gounuri-web/src/components/OAuthButtons.tsx. Con la cookie de
// sesión compartida a nivel .gounuri.com (ver lib/supabase/client.ts) la
// mayoría de la gente que ya se logueó en gounuri.com nunca va a ver este
// botón porque va a entrar directo — esto es para quien llega acá primero
// (link directo, favorito viejo, etc.) sin pasar antes por gounuri.com.
// Requiere Google/Facebook habilitados como provider en Supabase Dashboard
// > Authentication > Providers (mismo proyecto que gounuri-web, así que si
// ya se configuró ahí, ya funciona acá también).

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

function IconGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.66z"/>
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3a7.4 7.4 0 0 1-11-3.9H.98v3.1A12 12 0 0 0 12 24z"/>
      <path fill="#FBBC05" d="M5.07 14.19a7.2 7.2 0 0 1 0-4.38v-3.1H.98a12 12 0 0 0 0 10.58l4.09-3.1z"/>
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 .98 6.71l4.09 3.1A7.16 7.16 0 0 1 12 4.77z"/>
    </svg>
  )
}

function IconFacebook() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2">
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.09 24 18.1 24 12.07z"/>
    </svg>
  )
}

export default function OAuthButtons() {
  const supabase = createClient()
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'facebook' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleOAuth(provider: 'google' | 'facebook') {
    setError(null)
    setLoadingProvider(provider)
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (err) {
      setLoadingProvider(null)
      setError('No se pudo iniciar sesión con ' + (provider === 'google' ? 'Google' : 'Facebook') + '. Probá con mail o más tarde.')
    }
    // Si no hay error, el browser ya está siendo redirigido al provider —
    // no hace falta hacer nada más acá.
  }

  return (
    <div className="space-y-2.5">
      <button
        type="button"
        onClick={() => handleOAuth('google')}
        disabled={loadingProvider !== null}
        className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-zinc-300 bg-white py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
      >
        <IconGoogle />
        {loadingProvider === 'google' ? 'Redirigiendo...' : 'Continuar con Google'}
      </button>
      <button
        type="button"
        onClick={() => handleOAuth('facebook')}
        disabled={loadingProvider !== null}
        className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-zinc-300 bg-white py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
      >
        <IconFacebook />
        {loadingProvider === 'facebook' ? 'Redirigiendo...' : 'Continuar con Facebook'}
      </button>
      {error && <p className="text-center text-xs text-red-600">{error}</p>}
    </div>
  )
}

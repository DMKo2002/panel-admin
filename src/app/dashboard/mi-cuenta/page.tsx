'use client'

// "Mi cuenta" — acceso y seguridad de la cuenta que está logueada ahora
// mismo (dueño o staff, cada uno ve/gestiona la suya, nunca la de otro).
// Deliberadamente NO vive en src/lib/settings-nav.ts: eso es configuración
// de LA TIENDA (bloqueada a staff sin permiso), esto es de LA PERSONA
// logueada, así que siempre está disponible para cualquiera con sesión.
//
// Usa la API de "identities" de Supabase Auth directamente desde el
// browser (getUserIdentities/linkIdentity/unlinkIdentity/updateUser) — no
// hace falta un API route propio, corre todo contra la sesión ya
// autenticada. Requiere que "Allow manual linking" esté activado en
// Supabase Dashboard > Authentication > Sign In / Providers; si no está
// activado, linkIdentity() devuelve un error claro (no rompe la página).

import { useEffect, useState } from 'react'
import type { UserIdentity } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, KeyRound } from 'lucide-react'

function IconGoogle() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.66z"/>
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3a7.4 7.4 0 0 1-11-3.9H.98v3.1A12 12 0 0 0 12 24z"/>
      <path fill="#FBBC05" d="M5.07 14.19a7.2 7.2 0 0 1 0-4.38v-3.1H.98a12 12 0 0 0 0 10.58l4.09-3.1z"/>
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 .98 6.71l4.09 3.1A7.16 7.16 0 0 1 12 4.77z"/>
    </svg>
  )
}

function IconFacebook() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#1877F2">
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.09 24 18.1 24 12.07z"/>
    </svg>
  )
}

type ProviderKey = 'email' | 'google' | 'facebook'

const PROVIDER_META: Record<ProviderKey, { label: string; icon: React.ReactNode }> = {
  email:    { label: 'Email y contraseña', icon: <KeyRound size={20} className="text-zinc-500" /> },
  google:   { label: 'Google',             icon: <IconGoogle /> },
  facebook: { label: 'Facebook',           icon: <IconFacebook /> },
}

export default function MiCuentaPage() {
  const supabase = createClient()
  const [identities, setIdentities] = useState<UserIdentity[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyProvider, setBusyProvider] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')

  async function loadIdentities() {
    const { data, error: err } = await supabase.auth.getUserIdentities()
    if (err) { setError('No se pudieron cargar los accesos de tu cuenta.'); setLoading(false); return }
    setIdentities(data.identities)
    setLoading(false)
  }

  useEffect(() => {
    // Volvemos de /auth/callback?next=/dashboard/mi-cuenta después de
    // linkIdentity() — ese route.ts nos manda ?linked=1 o ?linkError=...
    // según cómo terminó el canje del código (mail ya usado en otra
    // cuenta, provider no habilitado, etc.).
    const params = new URLSearchParams(window.location.search)
    const linkError = params.get('linkError')
    if (linkError) {
      setError(decodeURIComponent(linkError))
      window.history.replaceState(null, '', '/dashboard/mi-cuenta')
    } else if (params.get('linked')) {
      setSuccess('Cuenta vinculada correctamente.')
      window.history.replaceState(null, '', '/dashboard/mi-cuenta')
    }
    loadIdentities()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const has = (p: ProviderKey) => identities?.some(i => i.provider === p) ?? false
  const canUnlink = (identities?.length ?? 0) > 1

  async function handleLink(provider: 'google' | 'facebook') {
    setError(null)
    setSuccess(null)
    setBusyProvider(provider)
    // linkIdentity usa el mismo flujo PKCE (?code=...) que un login normal
    // con OAuth — tiene que volver por /auth/callback para canjear el
    // código con exchangeCodeForSession(), no puede volver directo acá.
    // Ver ese route.ts para el manejo del parámetro next=.
    const { error: err } = await supabase.auth.linkIdentity({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/dashboard/mi-cuenta` },
    })
    if (err) {
      setBusyProvider(null)
      setError(
        err.message?.includes('Manual linking')
          ? 'Vincular cuentas todavía no está habilitado — avisale a soporte.'
          : `No se pudo vincular con ${provider === 'google' ? 'Google' : 'Facebook'}: ${err.message}`
      )
    }
    // Si no hay error, el browser ya está siendo redirigido al provider.
  }

  async function handleUnlink(identity: UserIdentity) {
    const label = PROVIDER_META[identity.provider as ProviderKey]?.label ?? identity.provider
    if (!window.confirm(`¿Desvincular ${label} de tu cuenta? Vas a dejar de poder entrar con esa opción.`)) return

    setError(null)
    setSuccess(null)
    setBusyProvider(identity.provider)
    const { error: err } = await supabase.auth.unlinkIdentity(identity)
    setBusyProvider(null)
    if (err) {
      setError(`No se pudo desvincular: ${err.message}`)
      return
    }
    setSuccess(`${label} desvinculado.`)
    loadIdentities()
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (password.length < 8) { setError('La contraseña tiene que tener al menos 8 caracteres.'); return }
    if (password !== password2) { setError('Las contraseñas no coinciden.'); return }

    setBusyProvider('email')
    const { error: err } = await supabase.auth.updateUser({ password })
    setBusyProvider(null)
    if (err) { setError(`No se pudo crear la contraseña: ${err.message}`); return }

    setPassword('')
    setPassword2('')
    setShowPasswordForm(false)
    setSuccess('Contraseña creada — ya podés usarla para entrar.')
    loadIdentities()
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-zinc-900 mb-1">Mi cuenta</h1>
      <p className="text-sm text-zinc-500 mb-6">Formas de entrar habilitadas para tu usuario.</p>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          <CheckCircle2 size={16} />
          {success}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-400">Cargando...</p>
      ) : (
        <div className="card divide-y divide-zinc-100">
          {(['email', 'google', 'facebook'] as ProviderKey[]).map(provider => {
            const linked = has(provider)
            const meta = PROVIDER_META[provider]
            return (
              <div key={provider} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  {meta.icon}
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{meta.label}</p>
                    <p className="text-xs text-zinc-400">{linked ? 'Vinculado' : 'No vinculado'}</p>
                  </div>
                </div>

                {linked ? (
                  canUnlink && (
                    <button
                      type="button"
                      onClick={() => handleUnlink(identities!.find(i => i.provider === provider)!)}
                      disabled={busyProvider === provider}
                      className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                    >
                      Desvincular
                    </button>
                  )
                ) : provider === 'email' ? (
                  <button
                    type="button"
                    onClick={() => setShowPasswordForm(v => !v)}
                    className="text-xs font-medium text-primary-600 hover:underline"
                  >
                    Crear contraseña
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleLink(provider)}
                    disabled={busyProvider === provider}
                    className="text-xs font-medium text-primary-600 hover:underline disabled:opacity-50"
                  >
                    {busyProvider === provider ? 'Redirigiendo...' : 'Vincular'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showPasswordForm && (
        <form onSubmit={handleSetPassword} className="card mt-4 space-y-3">
          <p className="text-sm font-medium text-zinc-900">Crear contraseña propia</p>
          <p className="text-xs text-zinc-500">
            Con esto vas a poder entrar con tu mail y esta contraseña, además de con Google/Facebook.
          </p>
          <input
            type="password"
            className="input"
            placeholder="Contraseña nueva"
            autoComplete="new-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <input
            type="password"
            className="input"
            placeholder="Repetir contraseña"
            autoComplete="new-password"
            value={password2}
            onChange={e => setPassword2(e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={busyProvider === 'email'}
            className="btn-primary py-2 px-4 text-sm disabled:opacity-60"
          >
            {busyProvider === 'email' ? 'Guardando...' : 'Guardar contraseña'}
          </button>
        </form>
      )}
    </div>
  )
}

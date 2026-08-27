'use client'

// "Mi cuenta" — acceso y seguridad de la cuenta que está logueada ahora
// mismo (dueño o staff, cada uno ve/gestiona la suya, nunca la de otro).
// Deliberadamente NO vive en src/lib/settings-nav.ts: eso es configuración
// de LA TIENDA (bloqueada a staff sin permiso), esto es de LA PERSONA
// logueada, así que siempre está disponible para cualquiera con sesión.
//
// Vincular/desvincular Google usa la API de "identities" de
// Supabase Auth directamente desde el browser (getUserIdentities /
// linkIdentity / unlinkIdentity) — corre contra la sesión ya autenticada.
// Requiere que "Allow manual linking" esté activado en Supabase Dashboard >
// Authentication > Sign In / Providers; si no está activado, linkIdentity()
// devuelve un error claro (no rompe la página).
//
// Crear/cambiar la contraseña, en cambio, NO usa supabase.auth.updateUser()
// directo — eso deja la contraseña funcionando pero la identidad 'email'
// nunca aparece en getUserIdentities() ("ghost password", bug conocido y
// sin resolver de Supabase: supabase/auth#2085). Por eso pasa por
// /api/account/set-password, que usa la service role del lado del server
// para aplicar el workaround de la comunidad. Ver ese route.ts.

import { useEffect, useState } from 'react'
import type { UserIdentity } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, KeyRound, Eye, EyeOff } from 'lucide-react'

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

// Facebook se sacó el 27/8/2026: el login nunca llegó a funcionar y la app de
// Meta requiere revisión de negocio para salir de modo desarrollo. Al momento
// de sacarlo no había NINGUNA cuenta con provider facebook (verificado en
// auth.users), así que nadie quedó sin poder entrar. Para reactivarlo:
// devolver 'facebook' acá, al array del render y al tipo de handleLink.
type ProviderKey = 'email' | 'google'

const PROVIDER_META: Record<ProviderKey, { label: string; icon: React.ReactNode }> = {
  email:    { label: 'Email y contraseña', icon: <KeyRound size={20} className="text-zinc-500" /> },
  google:   { label: 'Google',             icon: <IconGoogle /> },
}

export default function MiCuentaPage() {
  const supabase = createClient()
  const [identities, setIdentities] = useState<UserIdentity[] | null>(null)
  const [hasPassword, setHasPassword] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busyProvider, setBusyProvider] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showPassword2, setShowPassword2] = useState(false)

  async function loadIdentities() {
    const { data, error: err } = await supabase.auth.getUserIdentities()
    if (err) { setError('No se pudieron cargar los accesos de tu cuenta.'); setLoading(false); return }
    setIdentities(data.identities)
    // getUserIdentities() no es confiable para 'email' por el bug de
    // arriba — nos fijamos directamente en el usuario si tiene contraseña
    // seteada (encrypted_password no viaja al cliente, pero
    // supabase.auth.getUser() sí nos dice qué proveedores usó alguna vez
    // para entrar; combinado con "ya hay una identidad email" cuando el
    // workaround del server-side sí llegó a crearla, cubre los dos casos).
    setHasPassword(prev => prev || data.identities.some(i => i.provider === 'email'))
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

  const has = (p: ProviderKey) => (p === 'email' ? hasPassword : identities?.some(i => i.provider === p) ?? false)
  const linkedCount = (identities?.length ?? 0) + (hasPassword && !identities?.some(i => i.provider === 'email') ? 1 : 0)
  const canUnlink = linkedCount > 1

  async function handleLink(provider: 'google') {
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
          : `No se pudo vincular con Google: ${err.message}`
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
    let payload: { error?: string } = {}
    try {
      const res = await fetch('/api/account/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      payload = await res.json()
      if (!res.ok) throw new Error(payload.error ?? 'Error desconocido')
    } catch (err: any) {
      setBusyProvider(null)
      setError(`No se pudo crear la contraseña: ${err.message}`)
      return
    }
    setBusyProvider(null)

    setPassword('')
    setPassword2('')
    setShowPassword(false)
    setShowPassword2(false)
    setShowPasswordForm(false)
    setHasPassword(true)
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
          {(['email', 'google'] as ProviderKey[]).map(provider => {
            const linked = has(provider)
            const meta = PROVIDER_META[provider]
            return (
              <div key={provider} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  {meta.icon}
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{meta.label}</p>
                    <p className={clsxStatus(linked)}>
                      {linked && <CheckCircle2 size={13} className="text-emerald-600" />}
                      {linked ? 'Vinculado' : 'No vinculado'}
                    </p>
                  </div>
                </div>

                {linked ? (
                  provider === 'email' ? (
                    <button
                      type="button"
                      onClick={() => setShowPasswordForm(v => !v)}
                      className="text-xs font-medium text-primary-600 hover:underline"
                    >
                      Cambiar contraseña
                    </button>
                  ) : canUnlink && (
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
          <p className="text-sm font-medium text-zinc-900">{hasPassword ? 'Cambiar contraseña' : 'Crear contraseña propia'}</p>
          <p className="text-xs text-zinc-500">
            Con esto vas a poder entrar con tu mail y esta contraseña, además de con Google.
          </p>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              className="input pr-10"
              placeholder="Contraseña nueva"
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div className="relative">
            <input
              type={showPassword2 ? 'text' : 'password'}
              className="input pr-10"
              placeholder="Repetir contraseña"
              autoComplete="new-password"
              value={password2}
              onChange={e => setPassword2(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword2(v => !v)}
              tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              aria-label={showPassword2 ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword2 ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busyProvider === 'email'}
              className="btn-primary py-2 px-4 text-sm disabled:opacity-60"
            >
              {busyProvider === 'email' ? 'Guardando...' : 'Guardar contraseña'}
            </button>
            <button
              type="button"
              onClick={() => { setShowPasswordForm(false); setPassword(''); setPassword2('') }}
              className="py-2 px-4 text-sm text-zinc-500 hover:text-zinc-700"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function clsxStatus(linked: boolean) {
  return `text-xs flex items-center gap-1 ${linked ? 'text-emerald-600' : 'text-zinc-400'}`
}

'use client'

// 2026-08-20: alta self-serve directa en panel.gounuri.com/registro (antes
// esto redirigía a gounuri.com/registro, y antes de eso — por un ratito, el
// mismo día — a la home de gounuri.com; ver creart_avellaneda_pilot_plan en
// la memoria del proyecto). El login social comparte el mismo componente
// que usa /login (OAuthButtons) — para Supabase signInWithOAuth no hay
// diferencia entre "iniciar sesión" y "registrarse": si el mail no existe
// todavía, lo crea. Para mail+contraseña sí hace falta este formulario +
// /api/auth/registro + confirmación por mail (/auth/verificar).
//
// Después de confirmar la cuenta (o de loguearse con Google por
// primera vez), /auth/callback y /api/auth/confirmar mandan al usuario a
// /onboarding, que crea el tenant con 7 días de trial (ver TRIAL_DAYS en
// lib/plans.ts) — no pasa por Mercado Pago ni ningún pago online.

import { useState } from 'react'
import OAuthButtons from '@/components/OAuthButtons'
import { CheckCircle2 } from 'lucide-react'

export default function RegistroPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/auth/registro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, confirmar }),
    })
    const data = await res.json().catch(() => ({}))
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Error al crear la cuenta. Intentá de nuevo.')
      return
    }
    setEnviado(true)
  }

  if (enviado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-6">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600">
            <CheckCircle2 size={22} className="text-white" />
          </div>
          <h1 className="mt-6 text-xl font-semibold text-zinc-900">Revisá tu email</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-500">
            Te mandamos un link a <strong>{email}</strong> para confirmar tu cuenta y arrancar tus 7 días de prueba gratis.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-zinc-400">
            Si no lo ves en unos minutos, revisá la carpeta de spam o correo no deseado.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary-600 mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-white">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-zinc-900">Creá tu tienda</h1>
          <p className="text-sm text-zinc-500 mt-1">7 días de prueba gratis, sin tarjeta</p>
        </div>

        <div className="card">
          <OAuthButtons />
          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-200" />
            <span className="text-xs text-zinc-400">o con mail</span>
            <div className="h-px flex-1 bg-zinc-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Email</label>
              <input
                type="email"
                className="input"
                placeholder="tu@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Contraseña</label>
              <input
                type="password"
                className="input"
                placeholder="Al menos 8 caracteres"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Repetir contraseña</label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                value={confirmar}
                onChange={e => setConfirmar(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary justify-center py-2.5 disabled:opacity-60"
            >
              {loading ? 'Creando cuenta...' : 'Crear cuenta'}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-zinc-500">
          ¿Ya tenés cuenta?{' '}
          <a href="/login" className="text-primary-600 hover:underline font-medium">
            Iniciá sesión
          </a>
        </p>
      </div>
    </div>
  )
}

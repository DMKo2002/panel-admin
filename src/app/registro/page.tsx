'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

type Stage = 'form' | 'confirm'

export default function RegistroPage() {
  const supabase = createClient()
  const [stage, setStage] = useState<Stage>('form')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden')
      return
    }

    setLoading(true)
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Redirigir al onboarding luego de confirmar el email
        emailRedirectTo: `${window.location.origin}/onboarding`,
      },
    })

    setLoading(false)
    if (signUpError) {
      if (signUpError.message.includes('already registered')) {
        setError('Ya existe una cuenta con ese email. Ingresá desde el login.')
      } else {
        setError(signUpError.message)
      }
      return
    }

    setStage('confirm')
  }

  if (stage === 'confirm') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-violet-100 mb-5">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-violet-600">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="22,6 12,13 2,6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-zinc-900 mb-2">Revisá tu email</h1>
          <p className="text-sm text-zinc-500 leading-relaxed mb-6">
            Te enviamos un link de confirmación a <strong className="text-zinc-800">{email}</strong>.
            Hacé clic en el link para activar tu cuenta y comenzar el setup de tu tienda.
          </p>
          <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 text-xs text-violet-700 text-left">
            <p className="font-medium mb-1">¿No llegó el email?</p>
            <p>Revisá la carpeta de spam. Si sigue sin llegar, escribinos a soporte.</p>
          </div>
          <Link href="/login" className="inline-block mt-6 text-xs text-zinc-400 hover:text-zinc-600 transition-colors">
            ← Volver al login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-violet-600 mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-white">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-zinc-900">Crear tu tienda</h1>
          <p className="text-sm text-zinc-500 mt-1">Registrate para empezar</p>
        </div>

        <form onSubmit={handleRegister} className="card space-y-4">
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
              placeholder="Mínimo 8 caracteres"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Confirmá la contraseña</label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="w-full btn-primary justify-center py-2.5 disabled:opacity-60">
            {loading ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
        </form>

        <p className="text-center text-sm text-zinc-500 mt-5">
          ¿Ya tenés cuenta?{' '}
          <Link href="/login" className="text-violet-600 hover:underline font-medium">
            Ingresá acá
          </Link>
        </p>

      </div>
    </div>
  )
}

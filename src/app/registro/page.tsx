'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function RegistroPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    setLoading(true)
    const { error: signUpError } = await supabase.auth.signUp({ email, password })
    setLoading(false)

    if (signUpError) {
      if (signUpError.message.includes('already registered') || signUpError.message.includes('User already registered')) {
        setError('Ya existe una cuenta con ese email. Ingresá desde el login.')
      } else {
        setError(signUpError.message)
      }
      return
    }

    // Sin confirmación por email — ir directo al onboarding
    window.location.href = '/onboarding'
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
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
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

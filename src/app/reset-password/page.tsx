'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

type Stage = 'form' | 'sent'

export default function ResetPasswordPage() {
  const supabase = createClient()
  const [stage, setStage] = useState<Stage>('form')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setStage('sent')
  }

  if (stage === 'sent') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary-100 mb-5">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-primary-600">
              <polyline points="20 6 9 17 4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-zinc-900 mb-2">Email enviado</h1>
          <p className="text-sm text-zinc-500 leading-relaxed mb-6">
            Si existe una cuenta con <strong className="text-zinc-800">{email}</strong>, vas a recibir un link para resetear tu contraseña.
          </p>
          <Link href="/login" className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors">← Volver al login</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold text-zinc-900">Recuperar contraseña</h1>
          <p className="text-sm text-zinc-500 mt-1">Te mandamos un link a tu email</p>
        </div>
        <form onSubmit={handleReset} className="card space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Email</label>
            <input type="email" className="input" placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          </div>
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
          <button type="submit" disabled={loading} className="w-full btn-primary justify-center py-2.5 disabled:opacity-60">
            {loading ? 'Enviando...' : 'Enviar link'}
          </button>
        </form>
        <p className="text-center mt-4">
          <Link href="/login" className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors">← Volver al login</Link>
        </p>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function UpdatePasswordPage() {
  const supabase = createClient()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError('Mínimo 8 caracteres'); return }
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return }
    setLoading(true); setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { setError(error.message); return }
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold text-zinc-900">Nueva contraseña</h1>
          <p className="text-sm text-zinc-500 mt-1">Elegí una contraseña segura</p>
        </div>
        <form onSubmit={handleUpdate} className="card space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Nueva contraseña</label>
            <input type="password" className="input" placeholder="Mínimo 8 caracteres" value={password} onChange={e => setPassword(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Confirmá la contraseña</label>
            <input type="password" className="input" placeholder="••••••••" value={confirm} onChange={e => setConfirm(e.target.value)} required />
          </div>
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
          <button type="submit" disabled={loading} className="w-full btn-primary justify-center py-2.5 disabled:opacity-60">
            {loading ? 'Guardando...' : 'Guardar contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}

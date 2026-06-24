'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Store } from 'lucide-react'

export default function OnboardingPage() {
  const supabase = createClient()
  const [name, setName]       = useState('')
  const [domain, setDomain]   = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('El nombre de la tienda es obligatorio'); return }
    setSaving(true); setError(null)

    const res = await fetch('/api/create-tenant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), domain: domain.trim() || null }),
    })

    const json = await res.json()
    if (!res.ok || json.error) {
      setError(json.error ?? 'Error al crear la tienda')
      setSaving(false)
      return
    }

    // Hard redirect para que el middleware lea la sesión actualizada
    window.location.href = '/dashboard'
  }

  return (
    <div className="min-h-screen bg-zinc-50">

      {/* Header */}
      <div className="bg-white border-b border-zinc-200 px-6 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
              <Store size={16} className="text-white" />
            </div>
            <span className="font-semibold text-zinc-900">CreArt</span>
          </div>
          <button onClick={handleLogout} className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors">
            Cerrar sesión
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-zinc-900">Configurá tu tienda</h1>
          <p className="text-sm text-zinc-500 mt-1">Solo necesitamos el nombre para empezar</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Nombre de la tienda <span className="text-red-400">*</span>
            </label>
            <input
              className="input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej: Moda Caro, Iruda, Connors..."
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Dominio propio <span className="text-zinc-400 font-normal">(opcional)</span>
            </label>
            <input
              className="input"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="Ej: mitienda.com"
            />
            <p className="text-xs text-zinc-400 mt-1">Lo podés configurar después desde el panel</p>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full btn-primary justify-center py-3 disabled:opacity-60"
          >
            {saving ? 'Creando tu tienda...' : 'Crear mi tienda →'}
          </button>
        </form>
      </div>
    </div>
  )
}

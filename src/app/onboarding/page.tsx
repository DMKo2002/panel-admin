'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Store, Check } from 'lucide-react'

// ── Definición de templates disponibles ─────────────────────────────────────
const TEMPLATES = [
  {
    id: 'default',
    name: 'Minimalista',
    description: 'Elegante y limpio. Tipografía serif, paleta neutra, hero de pantalla completa.',
    accent: '#1a1a1a',
    preview: {
      bg: '#EDE8E1',
      text: '#1a1a1a',
      badge: 'Más popular',
      colors: ['#1a1a1a', '#8B7355', '#D4C5A9'],
    },
  },
  {
    id: 'mono',
    name: 'Mono',
    description: 'Tipografía monoespaciada, estética cruda y directa. Ideal para marcas con actitud.',
    accent: '#000000',
    preview: {
      bg: '#F5F5F5',
      text: '#000000',
      badge: 'Próximamente',
      colors: ['#000000', '#333333', '#cccccc'],
    },
  },
  {
    id: 'atelier',
    name: 'Atelier',
    description: 'Oscuro y editorial. Fondo negro, detalles dorados, estética luxury de alta costura.',
    accent: '#d4af37',
    preview: {
      bg: '#111111',
      text: '#ffffff',
      badge: 'Próximamente',
      colors: ['#d4af37', '#ffffff', '#888888'],
    },
  },
  {
    id: 'axis',
    name: 'Axis',
    description: 'Geométrico y contemporáneo. Grillas asimétricas, tipografía bold, ritmo visual fuerte.',
    accent: '#dc2626',
    preview: {
      bg: '#fafafa',
      text: '#111111',
      badge: 'Próximamente',
      colors: ['#dc2626', '#111111', '#e5e5e5'],
    },
  },
]

// ── Pasos del onboarding ──────────────────────────────────────────────────────
type Step = 'nombre' | 'template'

export default function OnboardingPage() {
  const supabase = createClient()
  const [step, setStep] = useState<Step>('nombre')
  const [name, setName]           = useState('')
  const [domain, setDomain]       = useState('')
  const [template, setTemplate]   = useState('default')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  function handleNombreSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('El nombre de la tienda es obligatorio'); return }
    setError(null)
    setStep('template')
  }

  async function handleFinalSubmit() {
    setSaving(true); setError(null)

    const res = await fetch('/api/create-tenant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), domain: domain.trim() || null, template }),
    })

    const json = await res.json()
    if (!res.ok || json.error) {
      setError(json.error ?? 'Error al crear la tienda')
      setSaving(false)
      return
    }

    window.location.href = '/dashboard'
  }

  const selectedTemplate = TEMPLATES.find(t => t.id === template) ?? TEMPLATES[0]

  return (
    <div className="min-h-screen bg-zinc-50">

      {/* Header */}
      <div className="bg-white border-b border-zinc-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
              <Store size={16} className="text-white" />
            </div>
            <span className="font-semibold text-zinc-900">CreArt</span>
          </div>
          <div className="flex items-center gap-6">
            {/* Progress */}
            <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-400">
              <span className={step === 'nombre' ? 'text-violet-600 font-medium' : 'text-zinc-400'}>1. Tu tienda</span>
              <span>→</span>
              <span className={step === 'template' ? 'text-violet-600 font-medium' : 'text-zinc-400'}>2. Diseño</span>
            </div>
            <button onClick={handleLogout} className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors">
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>

      {/* ── PASO 1: Nombre ── */}
      {step === 'nombre' && (
        <div className="max-w-lg mx-auto px-6 py-12">
          <div className="mb-8">
            <p className="text-xs font-medium text-violet-600 uppercase tracking-wider mb-2">Paso 1 de 2</p>
            <h1 className="text-2xl font-semibold text-zinc-900">Configurá tu tienda</h1>
            <p className="text-sm text-zinc-500 mt-1">Solo necesitamos el nombre para empezar</p>
          </div>

          <form onSubmit={handleNombreSubmit} className="card space-y-5">
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

            <button type="submit" className="w-full btn-primary justify-center py-3">
              Continuar →
            </button>
          </form>
        </div>
      )}

      {/* ── PASO 2: Template ── */}
      {step === 'template' && (
        <div className="max-w-3xl mx-auto px-6 py-12">
          <div className="mb-8">
            <p className="text-xs font-medium text-violet-600 uppercase tracking-wider mb-2">Paso 2 de 2</p>
            <h1 className="text-2xl font-semibold text-zinc-900">Elegí el diseño de tu tienda</h1>
            <p className="text-sm text-zinc-500 mt-1">Podés cambiarlo después desde Personalización</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => t.preview.badge !== 'Próximamente' && setTemplate(t.id)}
                className={`relative text-left rounded-xl border-2 overflow-hidden transition-all ${
                  template === t.id
                    ? 'border-violet-500 ring-2 ring-violet-200'
                    : 'border-zinc-200 hover:border-zinc-300'
                } ${t.preview.badge === 'Próximamente' ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {/* Preview visual */}
                <div
                  className="h-36 relative flex flex-col justify-end p-4"
                  style={{ backgroundColor: t.preview.bg }}
                >
                  {/* Simulated layout */}
                  <div className="absolute top-4 left-4 right-4">
                    <div className="flex gap-1 mb-2">
                      {t.preview.colors.map((c, i) => (
                        <div key={i} className="rounded-full" style={{ width: 10, height: 10, backgroundColor: c }} />
                      ))}
                    </div>
                    <div className="h-1.5 rounded-full mb-1.5 w-3/4" style={{ backgroundColor: t.preview.text, opacity: 0.8 }} />
                    <div className="h-1 rounded-full mb-1 w-1/2" style={{ backgroundColor: t.preview.text, opacity: 0.3 }} />
                    <div className="h-1 rounded-full w-2/3" style={{ backgroundColor: t.preview.text, opacity: 0.2 }} />
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[0.7, 0.5, 0.6].map((op, i) => (
                      <div key={i} className="h-10 rounded" style={{ backgroundColor: t.preview.text, opacity: op * 0.15 }} />
                    ))}
                  </div>
                  {/* Badge */}
                  <div
                    className="absolute top-3 right-3 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: t.id === 'default' ? t.accent : '#e5e7eb',
                      color: t.id === 'default' ? '#fff' : '#6b7280'
                    }}
                  >
                    {t.preview.badge}
                  </div>
                  {/* Check */}
                  {template === t.id && (
                    <div className="absolute top-3 left-3 w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center">
                      <Check size={11} className="text-white" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-4 bg-white">
                  <p className="text-sm font-semibold text-zinc-900 mb-1">{t.name}</p>
                  <p className="text-xs text-zinc-500 leading-relaxed">{t.description}</p>
                </div>
              </button>
            ))}
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep('nombre')}
              className="btn-secondary py-3 px-6"
            >
              ← Volver
            </button>
            <button
              onClick={handleFinalSubmit}
              disabled={saving}
              className="flex-1 btn-primary justify-center py-3 disabled:opacity-60"
            >
              {saving ? 'Creando tu tienda...' : `Crear mi tienda con "${selectedTemplate.name}" →`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Shirt, ShoppingBag, Footprints, Gem, Cpu, Home,
  Plus, ArrowRight, Check, Store
} from 'lucide-react'

interface BusinessTemplate {
  id: string
  name: string
  slug: string
  variant_attributes: VariantAttribute[]
}

interface VariantAttribute {
  key: string
  label: string
  type: 'text' | 'select'
  options?: string[]
}

const RUBRO_ICONS: Record<string, any> = {
  indumentaria: Shirt,
  marroquineria: ShoppingBag,
  calzado: Footprints,
  joyeria: Gem,
  electronica: Cpu,
  deco: Home,
}

const RUBRO_COLORS: Record<string, string> = {
  indumentaria: 'bg-violet-50 border-violet-200 text-violet-700',
  marroquineria: 'bg-amber-50 border-amber-200 text-amber-700',
  calzado: 'bg-blue-50 border-blue-200 text-blue-700',
  joyeria: 'bg-pink-50 border-pink-200 text-pink-700',
  electronica: 'bg-zinc-50 border-zinc-200 text-zinc-700',
  deco: 'bg-emerald-50 border-emerald-200 text-emerald-700',
}

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState(1)
  const [templates, setTemplates] = useState<BusinessTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<BusinessTemplate | null>(null)
  const [customAttributes, setCustomAttributes] = useState<VariantAttribute[]>([])
  const [storeName, setStoreName] = useState('')
  const [storeSlug, setStoreSlug] = useState('')
  const [storeDomain, setStoreDomain] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('business_templates').select('*').order('name')
      setTemplates(data ?? [])
    }
    load()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  function slugify(text: string) {
    return text.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
  }

  function handleSelectTemplate(template: BusinessTemplate) {
    setSelectedTemplate(template)
    setCustomAttributes(template.variant_attributes)
  }

  function addAttribute() {
    setCustomAttributes(prev => [...prev, { key: '', label: '', type: 'text' }])
  }

  function removeAttribute(i: number) {
    setCustomAttributes(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateAttribute(i: number, field: keyof VariantAttribute, value: any) {
    setCustomAttributes(prev => prev.map((attr, idx) =>
      idx === i ? { ...attr, [field]: value } : attr
    ))
  }

  async function handleFinish() {
    if (!storeName.trim()) { setError('El nombre de la tienda es obligatorio'); return }
    if (!selectedTemplate) { setError('Seleccioná un rubro'); return }

    setSaving(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')

      const slug = slugify(storeName) + '-' + Date.now().toString().slice(-4)
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({ slug, name: storeName.trim(), domain: storeDomain.trim() || null, plan: 'basic', status: 'pending' })
        .select()
        .single()

      if (tenantError) throw tenantError

      await supabase.from('store_config').insert({
        tenant_id: tenant.id,
        variant_attributes: customAttributes,
        mp_enabled: true,
        transfer_enabled: true,
        pickup_enabled: true,
      })

      await supabase.from('users').upsert(
        { id: user.id, email: user.email, tenant_id: tenant.id, role: 'owner' },
        { onConflict: 'id' }
      )

      // Notificar al admin del nuevo registro
      try {
        await fetch('/api/notify-new-tenant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantName: storeName.trim(),
            email: user.email ?? '',
            tenantId: tenant.id,
          }),
        })
      } catch (e) {
        console.warn('notify-new-tenant failed:', e)
      }

      router.push('/dashboard')
      router.refresh()

    } catch (err: any) {
      setError(err.message ?? 'Error al crear la tienda')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50">

      {/* Header */}
      <div className="bg-white border-b border-zinc-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
              <Store size={16} className="text-white" />
            </div>
            <span className="font-semibold text-zinc-900">CreArt</span>
          </div>
          <div className="flex items-center gap-6">
            {/* Logout escape hatch */}
            <button
              onClick={handleLogout}
              className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              Cerrar sesión
            </button>
            {/* Steps indicator */}
            <div className="flex items-center gap-2">
              {[1, 2, 3].map(s => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                    step > s ? 'bg-violet-600 text-white'
                    : step === s ? 'bg-violet-600 text-white'
                    : 'bg-zinc-100 text-zinc-400'
                  }`}>
                    {step > s ? <Check size={12} /> : s}
                  </div>
                  {s < 3 && <div className={`w-8 h-px ${step > s ? 'bg-violet-300' : 'bg-zinc-200'}`} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-10">

        {/* STEP 1: Nombre */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Paso 1 de 3</p>
              <h1 className="text-2xl font-semibold text-zinc-900">¿Cómo se llama tu tienda?</h1>
              <p className="text-sm text-zinc-500 mt-1">Este nombre va a aparecer en tu tienda online</p>
            </div>
            <div className="card space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Nombre de la tienda *</label>
                <input
                  className="input"
                  value={storeName}
                  onChange={e => { setStoreName(e.target.value); setStoreSlug(slugify(e.target.value)) }}
                  placeholder="Ej: Moda Caro, Iruda, Connors..."
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Dominio propio <span className="text-zinc-400 font-normal">(opcional)</span>
                </label>
                <input
                  className="input"
                  value={storeDomain}
                  onChange={e => setStoreDomain(e.target.value)}
                  placeholder="Ej: modacaro.com"
                />
                <p className="text-xs text-zinc-400 mt-1">Lo podés configurar después si todavía no tenés uno</p>
              </div>
            </div>
            <button
              onClick={() => { if (!storeName.trim()) { setError('Ingresá el nombre'); return }; setError(null); setStep(2) }}
              className="btn-primary w-full justify-center py-3"
            >
              Continuar <ArrowRight size={16} />
            </button>
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          </div>
        )}

        {/* STEP 2: Rubro */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Paso 2 de 3</p>
              <h1 className="text-2xl font-semibold text-zinc-900">¿Qué tipo de productos vendés?</h1>
              <p className="text-sm text-zinc-500 mt-1">Elegí el rubro que más se acerca a tu tienda</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {templates.map(template => {
                const Icon = RUBRO_ICONS[template.slug] ?? Store
                const colorClass = RUBRO_COLORS[template.slug] ?? 'bg-zinc-50 border-zinc-200 text-zinc-700'
                const selected = selectedTemplate?.id === template.id
                return (
                  <button
                    key={template.id}
                    onClick={() => handleSelectTemplate(template)}
                    className={`relative flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                      selected ? 'border-violet-500 bg-violet-50' : 'border-zinc-200 bg-white hover:border-zinc-300'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                      <Icon size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-900">{template.name}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {template.variant_attributes.map((a: any) => a.label).join(' · ')}
                      </p>
                    </div>
                    {selected && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-violet-600 rounded-full flex items-center justify-center">
                        <Check size={11} className="text-white" />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="btn-secondary px-6">Atrás</button>
              <button
                onClick={() => { if (!selectedTemplate) { setError('Elegí un rubro'); return }; setError(null); setStep(3) }}
                className="btn-primary flex-1 justify-center py-3"
              >
                Continuar <ArrowRight size={16} />
              </button>
            </div>
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          </div>
        )}

        {/* STEP 3: Atributos */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Paso 3 de 3</p>
              <h1 className="text-2xl font-semibold text-zinc-900">Revisá tus atributos de producto</h1>
              <p className="text-sm text-zinc-500 mt-1">Estos son los campos que vas a completar al cargar cada producto.</p>
            </div>
            <div className="card space-y-3">
              {customAttributes.map((attr, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-zinc-50 rounded-lg">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Nombre del campo</label>
                      <input
                        className="input text-sm"
                        value={attr.label}
                        onChange={e => updateAttribute(i, 'label', e.target.value)}
                        placeholder="Ej: Talle, Color..."
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Tipo</label>
                      <select
                        className="input text-sm"
                        value={attr.type}
                        onChange={e => updateAttribute(i, 'type', e.target.value)}
                      >
                        <option value="text">Texto libre</option>
                        <option value="select">Lista de opciones</option>
                      </select>
                    </div>
                  </div>
                  {customAttributes.length > 1 && (
                    <button onClick={() => removeAttribute(i)} className="text-zinc-300 hover:text-red-400 transition-colors flex-shrink-0">×</button>
                  )}
                </div>
              ))}
              <button onClick={addAttribute} className="flex items-center gap-2 text-sm text-violet-600 hover:text-violet-700 transition-colors">
                <Plus size={14} /> Agregar atributo personalizado
              </button>
            </div>
            <div className="bg-violet-50 border border-violet-100 rounded-xl p-4">
              <p className="text-xs font-medium text-violet-700 mb-2">Resumen de tu tienda</p>
              <p className="text-sm text-violet-900"><strong>Nombre:</strong> {storeName}</p>
              <p className="text-sm text-violet-900"><strong>Rubro:</strong> {selectedTemplate?.name}</p>
              {storeDomain && <p className="text-sm text-violet-900"><strong>Dominio:</strong> {storeDomain}</p>}
              <p className="text-sm text-violet-900">
                <strong>Atributos:</strong> {customAttributes.map(a => a.label).filter(Boolean).join(', ')}
              </p>
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">{error}</div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="btn-secondary px-6">Atrás</button>
              <button
                onClick={handleFinish}
                disabled={saving}
                className="btn-primary flex-1 justify-center py-3 disabled:opacity-60"
              >
                {saving ? 'Creando tu tienda...' : 'Crear mi tienda →'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

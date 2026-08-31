'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Store, Check, ExternalLink, Loader2 } from 'lucide-react'
import Toggle from '@/components/Toggle'
import { PLANS, PlanId, formatStorage } from '@/lib/plans'

// ── Templates — los 6 disponibles; la demo de cada uno vive en {slug}.gounuri.com
const TEMPLATES = [
  {
    id: 'minimalista',
    name: 'Minimalista',
    description: 'Elegante y limpio. Tipografía serif, paleta neutra, hero de pantalla completa.',
    previewUrl: process.env.NEXT_PUBLIC_PREVIEW_URL_MINIMALISTA ?? 'https://minimalista.gounuri.com',
    available: true,
  },
  {
    id: 'mono',
    name: 'Mono',
    description: 'Tipografía monoespaciada, estética cruda y directa. Ideal para marcas con actitud.',
    previewUrl: process.env.NEXT_PUBLIC_PREVIEW_URL_MONO ?? 'https://mono.gounuri.com',
    available: true,
  },
  {
    id: 'atelier',
    name: 'Atelier',
    description: 'Oscuro y editorial. Fondo negro, detalles dorados, estética luxury de alta costura.',
    previewUrl: process.env.NEXT_PUBLIC_PREVIEW_URL_ATELIER ?? 'https://atelier.gounuri.com',
    available: true,
  },
  {
    id: 'axis',
    name: 'Axis',
    description: 'Geométrico y contemporáneo. Grillas asimétricas, tipografía bold, ritmo visual fuerte.',
    previewUrl: process.env.NEXT_PUBLIC_PREVIEW_URL_AXIS ?? 'https://axis.gounuri.com',
    available: true,
  },
  {
    id: 'glow',
    name: 'Glow',
    description: 'Cálido y luminoso, con detalles suaves y foco en las fotos de producto.',
    previewUrl: 'https://glow.gounuri.com',
    available: true,
  },
  {
    id: 'bazaar',
    name: 'Bazaar',
    description: 'Vivo y versátil, con secciones destacadas para ofertas y novedades.',
    previewUrl: 'https://bazaar.gounuri.com',
    available: true,
  },
]

// ── Componente de preview con iframe escalado ─────────────────────────────────
function TemplatePreview({
  template,
  selected,
  onSelect,
}: {
  template: typeof TEMPLATES[0]
  selected: boolean
  onSelect: () => void
}) {
  const [loaded, setLoaded] = useState(false)
  const hasUrl = !!template.previewUrl

  return (
    <button
      onClick={template.available ? onSelect : undefined}
      className={`relative text-left rounded-xl border-2 overflow-hidden transition-all w-full ${
        selected ? 'border-primary-500 ring-2 ring-primary-200' : 'border-zinc-200 hover:border-zinc-300'
      } ${!template.available ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {/* Zona de preview */}
      <div className="relative bg-zinc-100 overflow-hidden" style={{ height: 200 }}>
        {hasUrl ? (
          <>
            {/* iframe escalado — desktop (1280px) comprimido a ancho del card */}
            {!loaded && (
              <div className="absolute inset-0 flex items-center justify-center text-zinc-400">
                <Loader2 size={20} className="animate-spin" />
              </div>
            )}
            <iframe
              src={template.previewUrl}
              title={`Preview ${template.name}`}
              scrolling="no"
              onLoad={() => setLoaded(true)}
              style={{
                width: 1280,
                height: 900,
                transform: 'scale(0.234)',   // 1280 * 0.234 ≈ 300 (ancho aprox del card)
                transformOrigin: 'top left',
                pointerEvents: 'none',
                border: 'none',
                opacity: loaded ? 1 : 0,
                transition: 'opacity 0.3s',
              }}
            />
          </>
        ) : (
          /* Placeholder mientras no hay URL configurada */
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-400">
            <div className="w-12 h-12 rounded-lg bg-zinc-200 flex items-center justify-center text-lg">
              🎨
            </div>
            <p className="text-xs font-medium">Preview próximamente</p>
          </div>
        )}

        {/* Badge disponibilidad */}
        <div className="absolute top-3 right-3 z-10">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            template.available
              ? 'bg-primary-600 text-white'
              : 'bg-zinc-200 text-zinc-500'
          }`}>
            {template.available ? 'Disponible' : 'Próximamente'}
          </span>
        </div>

        {/* Check de selección */}
        {selected && (
          <div className="absolute top-3 left-3 z-10 w-6 h-6 rounded-full bg-primary-600 flex items-center justify-center shadow">
            <Check size={13} className="text-white" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4 bg-white flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900 mb-0.5">{template.name}</p>
          <p className="text-xs text-zinc-500 leading-relaxed">{template.description}</p>
        </div>
        {hasUrl && (
          <a
            href={template.previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex-shrink-0 text-zinc-400 hover:text-primary-600 transition-colors mt-0.5"
            title="Ver demo completa"
          >
            <ExternalLink size={14} />
          </a>
        )}
      </div>
    </button>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
type Step = 'nombre' | 'template' | 'contacto' | 'pagos' | 'plan'

const STEP_ORDER: Step[] = ['nombre', 'template', 'contacto', 'pagos', 'plan']
const STEP_LABELS: Record<Step, string> = {
  nombre: '1. Tu tienda',
  template: '2. Diseño',
  contacto: '3. Contacto',
  pagos: '4. Pagos',
  plan: '5. Plan',
}

export default function OnboardingPage() {
  const supabase = createClient()
  const [step, setStep]         = useState<Step>('nombre')
  const [name, setName]         = useState('')
  const [domain, setDomain]     = useState('')
  const [template, setTemplate] = useState('minimalista')
  // 2026-08-28: pasos que faltaban acá respecto al onboarding de
  // gounuri.com (contacto, pagos, plan) -- hasta ahora el registro por
  // Google directo desde el Panel creaba el tenant sin pedir nada de
  // esto, con plan Standard y MP/transferencia/retiro habilitados a
  // ciegas. Ver creart_checklist_bugs_20260828 en memoria.
  const [whatsapp, setWhatsapp] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [instagram, setInstagram] = useState('')
  const [facebook, setFacebook] = useState('')
  const [tiktok, setTiktok] = useState('')
  const [direccion, setDireccion] = useState('')
  const [direccionDespacho, setDireccionDespacho] = useState('')
  const [mpEnabled, setMpEnabled] = useState(false)
  const [transferEnabled, setTransferEnabled] = useState(false)
  const [cashEnabled, setCashEnabled] = useState(false)
  const [plan, setPlan] = useState<PlanId>('standard')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

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
      body: JSON.stringify({
        name: name.trim(),
        domain: domain.trim() || null,
        template,
        plan,
        whatsapp: whatsapp.trim() || null,
        contactEmail: contactEmail.trim() || null,
        instagram: instagram.trim() || null,
        facebook: facebook.trim() || null,
        tiktok: tiktok.trim() || null,
        direccion: direccion.trim() || null,
        direccionDespacho: direccionDespacho.trim() || null,
        mpEnabled,
        transferEnabled,
        cashEnabled,
      }),
    })
    const json = await res.json()
    if (!res.ok || json.error) {
      setError(json.error ?? 'Error al crear la tienda')
      setSaving(false)
      // 409 = nombre ya en uso — volver al paso 1 para que lo cambien.
      if (res.status === 409) setStep('nombre')
      return
    }
    window.location.href = '/dashboard'
  }

  const selectedTemplate = TEMPLATES.find(t => t.id === template) ?? TEMPLATES[0]

  return (
    <div className="min-h-screen bg-zinc-50">

      {/* Header */}
      <div className="bg-white border-b border-zinc-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
              <Store size={16} className="text-white" />
            </div>
            <span className="font-semibold text-zinc-900">gounuri</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="hidden lg:flex items-center gap-2 text-xs text-zinc-400">
              {STEP_ORDER.map((s, i) => (
                <span key={s} className="flex items-center gap-2">
                  <span className={step === s ? 'text-primary-600 font-medium' : 'text-zinc-300'}>{STEP_LABELS[s]}</span>
                  {i < STEP_ORDER.length - 1 && <span className="text-zinc-200">→</span>}
                </span>
              ))}
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
            <p className="text-xs font-medium text-primary-600 uppercase tracking-wider mb-2">Paso 1 de 2</p>
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
        <div className="max-w-5xl mx-auto px-6 py-12">
          <div className="mb-8">
            <p className="text-xs font-medium text-primary-600 uppercase tracking-wider mb-2">Paso 2 de 2</p>
            <h1 className="text-2xl font-semibold text-zinc-900">Elegí el diseño de tu tienda</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Podés cambiarlo después desde Personalización. Hacé click en{' '}
              <ExternalLink size={11} className="inline" /> para ver la demo completa.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            {TEMPLATES.map(t => (
              <TemplatePreview
                key={t.id}
                template={t}
                selected={template === t.id}
                onSelect={() => setTemplate(t.id)}
              />
            ))}
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep('nombre')} className="btn-secondary py-3 px-6">
              ← Volver
            </button>
            <button
              onClick={() => setStep('contacto')}
              className="flex-1 btn-primary justify-center py-3"
            >
              Continuar con "{selectedTemplate.name}" →
            </button>
          </div>
        </div>
      )}

      {/* ── PASO 3: Contacto y redes (2026-08-28) ── */}
      {step === 'contacto' && (
        <div className="max-w-lg mx-auto px-6 py-12">
          <div className="mb-8">
            <p className="text-xs font-medium text-primary-600 uppercase tracking-wider mb-2">Paso 3 de 5</p>
            <h1 className="text-2xl font-semibold text-zinc-900">Contacto y redes</h1>
            <p className="text-sm text-zinc-500 mt-1">Todo opcional — lo podés completar después desde Contacto en el panel</p>
          </div>

          <div className="card space-y-5">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">WhatsApp</label>
              <input className="input" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="Ej: 11 1234 5678" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Email de contacto</label>
              <input type="email" className="input" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="contacto@tutienda.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Instagram</label>
              <input className="input" value={instagram} onChange={e => setInstagram(e.target.value)} placeholder="https://instagram.com/tutienda" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Facebook</label>
              <input className="input" value={facebook} onChange={e => setFacebook(e.target.value)} placeholder="https://facebook.com/tutienda" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">TikTok</label>
              <input className="input" value={tiktok} onChange={e => setTiktok(e.target.value)} placeholder="https://tiktok.com/@tutienda" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Dirección de retiro</label>
              <input className="input" value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="La que ve el cliente en la tienda" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Dirección de despacho</label>
              <input className="input" value={direccionDespacho} onChange={e => setDireccionDespacho(e.target.value)} placeholder="La que aparece en los PDFs de envío" />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={() => setStep('template')} className="btn-secondary py-3 px-6">← Volver</button>
            <button onClick={() => setStep('pagos')} className="flex-1 btn-primary justify-center py-3">Continuar →</button>
          </div>
        </div>
      )}

      {/* ── PASO 4: Métodos de pago (2026-08-28) ── */}
      {step === 'pagos' && (
        <div className="max-w-lg mx-auto px-6 py-12">
          <div className="mb-8">
            <p className="text-xs font-medium text-primary-600 uppercase tracking-wider mb-2">Paso 4 de 5</p>
            <h1 className="text-2xl font-semibold text-zinc-900">Métodos de pago</h1>
            <p className="text-sm text-zinc-500 mt-1">Elegí con qué le vas a cobrar a tus clientes — lo podés cambiar después desde Pagos y Finanzas</p>
          </div>

          <div className="card divide-y divide-zinc-100">
            <div className="flex items-center justify-between py-4 first:pt-0">
              <div>
                <p className="text-sm font-medium text-zinc-900">MercadoPago</p>
                <p className="text-xs text-zinc-500">Tarjeta, débito y QR — configurás tu cuenta después</p>
              </div>
              <Toggle checked={mpEnabled} onChange={setMpEnabled} />
            </div>
            <div className="flex items-center justify-between py-4">
              <div>
                <p className="text-sm font-medium text-zinc-900">Transferencia</p>
                <p className="text-xs text-zinc-500">El cliente transfiere, vos confirmás el pago a mano</p>
              </div>
              <Toggle checked={transferEnabled} onChange={setTransferEnabled} />
            </div>
            <div className="flex items-center justify-between py-4 last:pb-0">
              <div>
                <p className="text-sm font-medium text-zinc-900">Efectivo</p>
                <p className="text-xs text-zinc-500">El cliente paga al retirar o recibir el pedido</p>
              </div>
              <Toggle checked={cashEnabled} onChange={setCashEnabled} />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={() => setStep('contacto')} className="btn-secondary py-3 px-6">← Volver</button>
            <button onClick={() => setStep('plan')} className="flex-1 btn-primary justify-center py-3">Continuar →</button>
          </div>
        </div>
      )}

      {/* ── PASO 5: Plan (2026-08-28) ── */}
      {step === 'plan' && (
        <div className="max-w-4xl mx-auto px-6 py-12">
          <div className="mb-8">
            <p className="text-xs font-medium text-primary-600 uppercase tracking-wider mb-2">Paso 5 de 5</p>
            <h1 className="text-2xl font-semibold text-zinc-900">Elegí tu plan</h1>
            <p className="text-sm text-zinc-500 mt-1">7 días gratis para probarlo, sin tarjeta. Lo podés cambiar cuando quieras.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
            {(['mini', 'standard', 'premium'] as const).map(id => {
              const p = PLANS[id]
              const selected = plan === id
              return (
                <button
                  key={id}
                  onClick={() => setPlan(id)}
                  className={`text-left rounded-xl border-2 p-5 transition-all ${
                    selected ? 'border-primary-500 ring-2 ring-primary-200' : 'border-zinc-200 hover:border-zinc-300'
                  }`}
                >
                  <p className="text-sm font-semibold text-zinc-900">{p.nombre}</p>
                  <p className="text-xl font-bold text-zinc-900 mt-1">
                    ${p.precioARS.toLocaleString('es-AR')}<span className="text-xs font-normal text-zinc-400">/mes</span>
                  </p>
                  <ul className="mt-3 space-y-1 text-xs text-zinc-500">
                    <li>Hasta {p.maxProductos} productos</li>
                    <li>{formatStorage(p.storageMB)} de almacenamiento</li>
                    <li>{p.visitasMes.toLocaleString('es-AR')} visitas/mes</li>
                  </ul>
                </button>
              )
            })}
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep('pagos')} className="btn-secondary py-3 px-6">← Volver</button>
            <button
              onClick={handleFinalSubmit}
              disabled={saving}
              className="flex-1 btn-primary justify-center py-3 disabled:opacity-60"
            >
              {saving ? 'Creando tu tienda...' : `Empezar 7 días gratis con ${PLANS[plan].nombre} →`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

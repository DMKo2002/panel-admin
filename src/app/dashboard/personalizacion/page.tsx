'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ImageIcon, Upload, X, Loader2, Plus, Trash2 } from 'lucide-react'

// ─── Slots de imágenes por template ──────────────────────────────────────────
const TEMPLATE_SLOTS: Record<string, { key: string; label: string; hint: string; aspect: string }[]> = {
  default: [
    { key: 'logo',      label: 'Logo',           hint: 'PNG o SVG, fondo transparente', aspect: '3/1'  },
    { key: 'hero_main', label: 'Hero principal', hint: '1400 × 850 px',                 aspect: '16/9' },
  ],
  mykonoslove: [
    { key: 'logo',         label: 'Logo',                hint: 'PNG o SVG, fondo transparente', aspect: '3/1'   },
    { key: 'hero_main',    label: 'Hero principal',      hint: '1400 × 850 px recomendado',     aspect: '16/10' },
    { key: 'hero_thumb_1', label: 'Thumbnail Hero 1',    hint: '320 × 420 px recomendado',      aspect: '3/4'   },
    { key: 'hero_thumb_2', label: 'Thumbnail Hero 2',    hint: '320 × 420 px recomendado',      aspect: '3/4'   },
    { key: 'collection_1', label: 'Colección — Banner 1', hint: '600 × 750 px recomendado',     aspect: '4/5'   },
    { key: 'collection_2', label: 'Colección — Banner 2', hint: '600 × 750 px recomendado',     aspect: '4/5'   },
    { key: 'collection_3', label: 'Colección — Banner 3', hint: '600 × 750 px recomendado',     aspect: '4/5'   },
    { key: 'blog_1',       label: 'Blog — Foto 1',       hint: '800 × 500 px recomendado',      aspect: '16/9'  },
    { key: 'blog_2',       label: 'Blog — Foto 2',       hint: '800 × 500 px recomendado',      aspect: '16/9'  },
    { key: 'blog_3',       label: 'Blog — Foto 3',       hint: '800 × 500 px recomendado',      aspect: '16/9'  },
  ],
}

const SYNC_TO_STORE_CONFIG: Record<string, string> = {
  logo:      'logo_url',
  hero_main: 'hero_image_url',
}

const groupLabels: Record<string, string> = {
  logo:       'Identidad',
  hero:       'Hero',
  collection: 'Colecciones',
  blog:       'Blog',
  banner:     'Banners',
}

// Textos predeterminados legales
const DEFAULT_TERMS = `TÉRMINOS Y CONDICIONES

Al realizar una compra en esta tienda, el cliente acepta los siguientes términos y condiciones.

1. PRECIOS Y PAGOS
Los precios están expresados en pesos argentinos (ARS). Nos reservamos el derecho de modificar los precios sin previo aviso. El pago debe realizarse en su totalidad antes del envío del pedido.

2. ENVÍOS
Los plazos de entrega son estimativos y pueden variar según la dirección de destino y el transportista seleccionado. No nos responsabilizamos por demoras ocasionadas por empresas de correo.

3. CAMBIOS Y DEVOLUCIONES
Se aceptan cambios dentro de los 30 días corridos de recibido el producto, siempre que el mismo se encuentre en perfectas condiciones, con su embalaje original y sin uso.

4. PRIVACIDAD
Los datos personales proporcionados serán utilizados exclusivamente para la gestión de pedidos y no serán compartidos con terceros.

5. LEY APLICABLE
Estos términos se rigen por las leyes de la República Argentina.`

const DEFAULT_PRIVACY = `POLÍTICA DE PRIVACIDAD

Esta política describe cómo recopilamos, usamos y protegemos tu información personal.

1. DATOS QUE RECOPILAMOS
Nombre y apellido, dirección de correo electrónico, número de teléfono, dirección de entrega y datos de pago (procesados de forma segura por el proveedor de pagos).

2. USO DE LA INFORMACIÓN
Usamos tus datos para procesar pedidos, enviarte confirmaciones de compra, responder consultas y mejorar nuestros servicios.

3. COMPARTIR INFORMACIÓN
No vendemos ni compartimos tu información con terceros, excepto con los transportistas necesarios para entregar tu pedido.

4. SEGURIDAD
Implementamos medidas de seguridad para proteger tu información personal contra acceso no autorizado.

5. COOKIES
Este sitio puede utilizar cookies para mejorar la experiencia de usuario. Podés deshabilitarlas desde la configuración de tu navegador.

6. CONTACTO
Si tenés preguntas sobre esta política, podés contactarnos a través de los medios indicados en el footer del sitio.`

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface SlotState {
  url: string | null
  uploading: boolean
  error: string | null
}

// ─── Componente de slot de imagen ─────────────────────────────────────────────
function AssetSlot({ slotDef, state, onUpload, onRemove }: {
  slotDef: { key: string; label: string; hint: string; aspect: string }
  state: SlotState
  onUpload: (file: File) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) onUpload(file)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-zinc-800">{slotDef.label}</p>
        <p className="text-xs text-zinc-400">{slotDef.hint}</p>
      </div>
      <div
        className="relative overflow-hidden rounded-lg border-2 border-dashed border-zinc-200 bg-zinc-50 cursor-pointer hover:border-violet-400 hover:bg-violet-50/30 transition-colors group"
        style={{ aspectRatio: slotDef.aspect }}
        onClick={() => !state.uploading && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
      >
        {state.url ? (
          <>
            <img src={state.url} alt={slotDef.label} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
              <button onClick={e => { e.stopPropagation(); inputRef.current?.click() }} className="flex items-center gap-1.5 bg-white text-zinc-800 text-xs font-medium px-3 py-1.5 rounded-full hover:bg-zinc-100">
                <Upload size={12} /> Cambiar
              </button>
              <button onClick={e => { e.stopPropagation(); onRemove() }} className="flex items-center gap-1.5 bg-white text-red-600 text-xs font-medium px-3 py-1.5 rounded-full hover:bg-zinc-100">
                <X size={12} /> Quitar
              </button>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-400">
            {state.uploading ? <Loader2 size={24} className="animate-spin text-violet-500" /> : <><ImageIcon size={24} /><span className="text-xs">Subir imagen</span></>}
          </div>
        )}
        {state.uploading && state.url && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-white" />
          </div>
        )}
      </div>
      {state.error && <p className="text-xs text-red-500">{state.error}</p>}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f) }} />
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function PersonalizacionPage() {
  const supabase = createClient()

  // ── Image slots
  const [template, setTemplate] = useState<string>('default')
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [configId, setConfigId] = useState<string | null>(null)
  const [slots, setSlots] = useState<Record<string, SlotState>>({})
  const [loading, setLoading] = useState(true)

  // ── Footer data
  const [storeName, setStoreName] = useState('')
  const [branches, setBranches] = useState<{name:string;address:string;phone?:string}[]>([])
  const [whatsapp, setWhatsapp] = useState('')
  const [email, setEmail] = useState('')
  const [storeAddress, setStoreAddress] = useState('')
  const [pickupAddress, setPickupAddress] = useState('')
  const [instagram, setInstagram] = useState('')
  const [facebook, setFacebook] = useState('')
  const [tiktok, setTiktok] = useState('')
  const [terms, setTerms] = useState('')
  const [privacy, setPrivacy] = useState('')

  const [savingName, setSavingName] = useState(false)
  const [savedName, setSavedName] = useState(false)
  const [savingFooter, setSavingFooter] = useState(false)
  const [savedFooter, setSavedFooter] = useState(false)
  const [footerError, setFooterError] = useState<string | null>(null)
  const [savingLegal, setSavingLegal] = useState(false)
  const [savedLegal, setSavedLegal] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      if (!userRow?.tenant_id) return
      setTenantId(userRow.tenant_id)

      const { data: tenant } = await supabase.from('tenants').select('name, template').eq('id', userRow.tenant_id).single()
      const tmpl = (tenant as any)?.template ?? 'default'
      setTemplate(tmpl)
      setStoreName((tenant as any)?.name ?? '')

      const { data: cfg } = await supabase.from('store_config').select('*').eq('tenant_id', userRow.tenant_id).single()
      if (cfg) {
        setConfigId(cfg.id)
        setWhatsapp((cfg as any).whatsapp_number ?? '')
        setEmail((cfg as any).notification_email ?? '')
        setStoreAddress((cfg as any).store_address ?? '')
        setPickupAddress((cfg as any).pickup_address ?? '')
        setInstagram((cfg as any).instagram_url ?? '')
        setFacebook((cfg as any).facebook_url ?? '')
        setTiktok((cfg as any).tiktok_url ?? '')
        setBranches((cfg as any).branches ?? [])
        setTerms((cfg as any).terms_and_conditions ?? '')
        setPrivacy((cfg as any).privacy_policy ?? '')
      }

      const { data: assets } = await supabase.from('store_assets').select('slot, url').eq('tenant_id', userRow.tenant_id)
      const slotDefs = TEMPLATE_SLOTS[tmpl] ?? TEMPLATE_SLOTS['default']
      const initial: Record<string, SlotState> = {}
      for (const s of slotDefs) {
        const existing = assets?.find(a => a.slot === s.key)
        initial[s.key] = { url: existing?.url ?? null, uploading: false, error: null }
      }
      setSlots(initial)
      setLoading(false)
    }
    load()
  }, [])

  function setSlotState(key: string, patch: Partial<SlotState>) {
    setSlots(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  async function handleUpload(slotKey: string, file: File) {
    if (!tenantId) return
    setSlotState(slotKey, { uploading: true, error: null })
    const ext = file.name.split('.').pop()
    const path = `${tenantId}/${slotKey}.${ext}`
    const { error: uploadError } = await supabase.storage.from('store-assets').upload(path, file, { upsert: true })
    if (uploadError) { setSlotState(slotKey, { uploading: false, error: `Error al subir: ${uploadError.message}` }); return }
    const { data: { publicUrl } } = supabase.storage.from('store-assets').getPublicUrl(path)
    const { error: dbError } = await supabase.from('store_assets').upsert({ tenant_id: tenantId, slot: slotKey, url: publicUrl, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id,slot' })
    if (dbError) { setSlotState(slotKey, { uploading: false, error: `Error al guardar: ${dbError.message}` }); return }
    const configField = SYNC_TO_STORE_CONFIG[slotKey]
    if (configField) await supabase.from('store_config').update({ [configField]: publicUrl }).eq('tenant_id', tenantId)
    setSlotState(slotKey, { url: publicUrl, uploading: false, error: null })
  }

  async function handleRemove(slotKey: string) {
    if (!tenantId) return
    setSlotState(slotKey, { uploading: true, error: null })
    await supabase.from('store_assets').delete().eq('tenant_id', tenantId).eq('slot', slotKey)
    const configField = SYNC_TO_STORE_CONFIG[slotKey]
    if (configField) await supabase.from('store_config').update({ [configField]: null }).eq('tenant_id', tenantId)
    setSlotState(slotKey, { url: null, uploading: false, error: null })
  }

  async function handleSaveName() {
    if (!tenantId) return
    setSavingName(true)
    await supabase.from('tenants').update({ name: storeName.trim() }).eq('id', tenantId)
    setSavingName(false); setSavedName(true); setTimeout(() => setSavedName(false), 2000)
  }

  async function handleSaveFooter() {
    if (!configId) return
    setSavingFooter(true); setFooterError(null)
    const { error } = await supabase.from('store_config').update({
      whatsapp_number:    whatsapp    || null,
      notification_email: email       || null,
      store_address:      storeAddress  || null,
      pickup_address:     pickupAddress || null,
      instagram_url:      instagram   || null,
      facebook_url:       facebook    || null,
      tiktok_url:         tiktok      || null,
      branches,
    }).eq('id', configId)
    setSavingFooter(false)
    if (error) setFooterError('Error al guardar: ' + error.message)
    else { setSavedFooter(true); setTimeout(() => setSavedFooter(false), 2000) }
  }

  async function handleSaveLegal() {
    if (!configId) return
    setSavingLegal(true)
    await supabase.from('store_config').update({
      terms_and_conditions: terms || null,
      privacy_policy: privacy || null,
    }).eq('id', configId)
    setSavingLegal(false); setSavedLegal(true); setTimeout(() => setSavedLegal(false), 2000)
  }

  const slotDefs = TEMPLATE_SLOTS[template] ?? TEMPLATE_SLOTS['default']
  const groups: Record<string, typeof slotDefs> = {}
  for (const s of slotDefs) {
    const prefix = s.key.split('_')[0]
    if (!groups[prefix]) groups[prefix] = []
    groups[prefix].push(s)
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-zinc-400">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-sm">Cargando...</span>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-5xl space-y-12">

      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Personalización</h1>
        <p className="text-sm text-zinc-500 mt-1">Imágenes y contenido de tu tienda. Los cambios se ven al instante.</p>
        <div className="mt-2 inline-flex items-center gap-1.5 bg-violet-50 text-violet-700 text-xs font-medium px-2.5 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" />
          Template: {template}
        </div>
      </div>

      {/* ── Imágenes (Hero, colecciones, blog, etc.) ── */}
      <section className="space-y-10">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-200 pb-3">
          Imágenes
        </h2>
        {Object.entries(groups).map(([prefix, groupSlots]) => (
          <div key={prefix}>
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
              {groupLabels[prefix] ?? prefix}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              {groupSlots.map(slotDef => (
                <AssetSlot
                  key={slotDef.key}
                  slotDef={slotDef}
                  state={slots[slotDef.key] ?? { url: null, uploading: false, error: null }}
                  onUpload={file => handleUpload(slotDef.key, file)}
                  onRemove={() => handleRemove(slotDef.key)}
                />
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* ── Footer ── */}
      <section className="space-y-6">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-200 pb-3">
          Footer
        </h2>

        {/* Nombre de la tienda */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-700">Nombre de la tienda</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Aparece en el sitio, footer y comprobantes</p>
            </div>
            <button onClick={handleSaveName} disabled={savingName} className="btn-secondary text-xs py-1.5 disabled:opacity-60">
              {savedName ? '✓ Guardado' : savingName ? 'Guardando...' : 'Guardar nombre'}
            </button>
          </div>
          <input className="input" value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="Nombre de tu marca..." />
        </div>

        {/* Contacto y redes sociales */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-700">Contacto y redes sociales</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Aparece en el footer del sitio y en los PDFs</p>
            </div>
            <button onClick={handleSaveFooter} disabled={savingFooter} className="btn-secondary text-xs py-1.5 disabled:opacity-60">
              {savedFooter ? '✓ Guardado' : savingFooter ? 'Guardando...' : 'Guardar contacto'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">WhatsApp</label>
              <input className="input text-sm" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="+54 9 11 1234-5678" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Email de notificaciones</label>
              <input className="input text-sm" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-zinc-500 mb-1">Dirección del local</label>
              <input className="input text-sm" value={storeAddress} onChange={e => setStoreAddress(e.target.value)} placeholder="Av. Santa Fe 1234, CABA" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-zinc-500 mb-1">Dirección para mapa de retiro</label>
              <input className="input text-sm" value={pickupAddress} onChange={e => setPickupAddress(e.target.value)} placeholder="Av. Santa Fe 1234, Buenos Aires" />
              <p className="text-xs text-zinc-400 mt-1">Aparece como mapa interactivo en el footer cuando el retiro está habilitado</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 pt-2 border-t border-zinc-100">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Instagram</label>
              <input className="input text-sm" value={instagram} onChange={e => setInstagram(e.target.value)} placeholder="https://instagram.com/tu_marca" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Facebook</label>
              <input className="input text-sm" value={facebook} onChange={e => setFacebook(e.target.value)} placeholder="https://facebook.com/tu_marca" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">TikTok</label>
              <input className="input text-sm" value={tiktok} onChange={e => setTiktok(e.target.value)} placeholder="https://tiktok.com/@tu_marca" />
            </div>
          </div>
          {footerError && <p className="text-sm text-red-500">{footerError}</p>}
        </div>

        {/* Sucursales */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-700">Sucursales</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Aparecen en el footer del sitio</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleSaveFooter} disabled={savingFooter} className="btn-secondary text-xs py-1.5 disabled:opacity-60">
                {savedFooter ? '✓ Guardado' : savingFooter ? 'Guardando...' : 'Guardar sucursales'}
              </button>
              <button onClick={() => setBranches(prev => [...prev, { name: '', address: '', phone: '' }])} className="flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-700">
                <Plus size={14} /> Agregar
              </button>
            </div>
          </div>
          {branches.length === 0 && <p className="text-xs text-zinc-400">No hay sucursales cargadas</p>}
          {branches.map((branch, i) => (
            <div key={i} className="grid grid-cols-3 gap-3 pb-3 border-b border-zinc-50 last:border-0">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Nombre</label>
                <input className="input text-sm" value={branch.name} onChange={e => setBranches(prev => prev.map((b, idx) => idx === i ? { ...b, name: e.target.value } : b))} placeholder="Sucursal Centro" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Dirección</label>
                <input className="input text-sm" value={branch.address} onChange={e => setBranches(prev => prev.map((b, idx) => idx === i ? { ...b, address: e.target.value } : b))} placeholder="Av. Corrientes 1234, CABA" />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-zinc-500 mb-1">Teléfono (opcional)</label>
                  <input className="input text-sm" value={branch.phone ?? ''} onChange={e => setBranches(prev => prev.map((b, idx) => idx === i ? { ...b, phone: e.target.value } : b))} placeholder="11 1234-5678" />
                </div>
                <button onClick={() => setBranches(prev => prev.filter((_, idx) => idx !== i))} className="text-zinc-300 hover:text-red-400 mb-1">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Términos y condiciones + Privacidad */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-700">Términos y condiciones / Privacidad</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Aparecen en las páginas legales de tu tienda</p>
            </div>
            <button onClick={handleSaveLegal} disabled={savingLegal} className="btn-secondary text-xs py-1.5 disabled:opacity-60">
              {savedLegal ? '✓ Guardado' : savingLegal ? 'Guardando...' : 'Guardar textos legales'}
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-zinc-600">Términos y condiciones</label>
                {!terms && (
                  <button onClick={() => setTerms(DEFAULT_TERMS)} className="text-xs text-violet-600 hover:text-violet-700">
                    Usar texto predeterminado
                  </button>
                )}
              </div>
              <textarea
                className="input min-h-[180px] font-mono text-xs leading-relaxed resize-y"
                value={terms}
                onChange={e => setTerms(e.target.value)}
                placeholder="Escribí acá los términos y condiciones de tu tienda..."
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-zinc-600">Política de privacidad</label>
                {!privacy && (
                  <button onClick={() => setPrivacy(DEFAULT_PRIVACY)} className="text-xs text-violet-600 hover:text-violet-700">
                    Usar texto predeterminado
                  </button>
                )}
              </div>
              <textarea
                className="input min-h-[180px] font-mono text-xs leading-relaxed resize-y"
                value={privacy}
                onChange={e => setPrivacy(e.target.value)}
                placeholder="Escribí acá la política de privacidad de tu tienda..."
              />
            </div>
          </div>
        </div>

      </section>
    </div>
  )
}

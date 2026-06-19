'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ImageIcon, Upload, X, Loader2 } from 'lucide-react'

// ─── Definición de slots por template ───────────────────────────────────────
// Para agregar un template nuevo: crear una nueva clave con su array de slots.
// Cada slot tiene:
//   key    → identificador único, usado como nombre de archivo y clave en DB
//   label  → nombre visible en el panel
//   hint   → tamaño/proporción sugerida
//   aspect → ratio CSS para el preview (ej. '16/9', '3/4', '1/1')

const TEMPLATE_SLOTS: Record<string, { key: string; label: string; hint: string; aspect: string }[]> = {
  default: [
    { key: 'logo',        label: 'Logo',           hint: 'PNG o SVG, fondo transparente', aspect: '3/1'  },
    { key: 'hero_main',   label: 'Hero principal', hint: '1400 × 850 px',                 aspect: '16/9' },
  ],
  mykonoslove: [
    { key: 'logo',          label: 'Logo',                hint: 'PNG o SVG, fondo transparente',  aspect: '3/1'   },
    { key: 'hero_main',     label: 'Hero principal',      hint: '1400 × 850 px recomendado',      aspect: '16/10' },
    { key: 'hero_thumb_1',  label: 'Thumbnail Hero 1',    hint: '320 × 420 px recomendado',       aspect: '3/4'   },
    { key: 'hero_thumb_2',  label: 'Thumbnail Hero 2',    hint: '320 × 420 px recomendado',       aspect: '3/4'   },
    { key: 'collection_1',  label: 'Colección — Banner 1', hint: '600 × 750 px recomendado',      aspect: '4/5'   },
    { key: 'collection_2',  label: 'Colección — Banner 2', hint: '600 × 750 px recomendado',      aspect: '4/5'   },
    { key: 'collection_3',  label: 'Colección — Banner 3', hint: '600 × 750 px recomendado',      aspect: '4/5'   },
    { key: 'blog_1',         label: 'Blog — Foto 1',       hint: '800 × 500 px recomendado',      aspect: '16/9'  },
    { key: 'blog_2',         label: 'Blog — Foto 2',       hint: '800 × 500 px recomendado',      aspect: '16/9'  },
    { key: 'blog_3',         label: 'Blog — Foto 3',       hint: '800 × 500 px recomendado',      aspect: '16/9'  },
  ],
}

// Slots que además sincronizan con columnas de store_config
const SYNC_TO_STORE_CONFIG: Record<string, string> = {
  logo:      'logo_url',
  hero_main: 'hero_image_url',
}

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface SlotState {
  url: string | null
  uploading: boolean
  error: string | null
}

// ─── Componente de un slot ────────────────────────────────────────────────────
function AssetSlot({
  slotDef,
  state,
  onUpload,
  onRemove,
}: {
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

      {/* Preview / drop zone */}
      <div
        className="relative overflow-hidden rounded-lg border-2 border-dashed border-zinc-200 bg-zinc-50 cursor-pointer hover:border-violet-400 hover:bg-violet-50/30 transition-colors group"
        style={{ aspectRatio: slotDef.aspect }}
        onClick={() => !state.uploading && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
      >
        {state.url ? (
          <>
            <img
              src={state.url}
              alt={slotDef.label}
              className="w-full h-full object-cover"
            />
            {/* Overlay al hover */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
              <button
                onClick={e => { e.stopPropagation(); inputRef.current?.click() }}
                className="flex items-center gap-1.5 bg-white text-zinc-800 text-xs font-medium px-3 py-1.5 rounded-full hover:bg-zinc-100 transition-colors"
              >
                <Upload size={12} />
                Cambiar
              </button>
              <button
                onClick={e => { e.stopPropagation(); onRemove() }}
                className="flex items-center gap-1.5 bg-white text-red-600 text-xs font-medium px-3 py-1.5 rounded-full hover:bg-zinc-100 transition-colors"
              >
                <X size={12} />
                Quitar
              </button>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-400">
            {state.uploading ? (
              <Loader2 size={24} className="animate-spin text-violet-500" />
            ) : (
              <>
                <ImageIcon size={24} />
                <span className="text-xs">Subir imagen</span>
              </>
            )}
          </div>
        )}

        {/* Spinner sobre imagen existente durante upload */}
        {state.uploading && state.url && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-white" />
          </div>
        )}
      </div>

      {state.error && (
        <p className="text-xs text-red-500">{state.error}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f) }}
      />
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function PersonalizacionPage() {
  const supabase = createClient()

  const [template, setTemplate] = useState<string>('default')
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [slots, setSlots] = useState<Record<string, SlotState>>({})
  const [loading, setLoading] = useState(true)

  // Carga inicial: template del tenant + assets existentes
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: userRow } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', user.id)
        .single()

      if (!userRow?.tenant_id) return
      setTenantId(userRow.tenant_id)

      const { data: tenant } = await supabase
        .from('tenants')
        .select('template')
        .eq('id', userRow.tenant_id)
        .single()

      const tmpl = (tenant as any)?.template ?? 'default'
      setTemplate(tmpl)

      const { data: assets } = await supabase
        .from('store_assets')
        .select('slot, url')
        .eq('tenant_id', userRow.tenant_id)

      // Inicializar todos los slots del template
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

    const { error: uploadError } = await supabase.storage
      .from('store-assets')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      setSlotState(slotKey, { uploading: false, error: `Error al subir: ${uploadError.message}` })
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('store-assets')
      .getPublicUrl(path)

    // Upsert en store_assets
    const { error: dbError } = await supabase
      .from('store_assets')
      .upsert({ tenant_id: tenantId, slot: slotKey, url: publicUrl, updated_at: new Date().toISOString() },
               { onConflict: 'tenant_id,slot' })

    if (dbError) {
      setSlotState(slotKey, { uploading: false, error: `Error al guardar: ${dbError.message}` })
      return
    }

    // Sincronizar con store_config si aplica (logo → logo_url, hero_main → hero_image_url)
    const configField = SYNC_TO_STORE_CONFIG[slotKey]
    if (configField) {
      await supabase
        .from('store_config')
        .update({ [configField]: publicUrl })
        .eq('tenant_id', tenantId)
    }

    setSlotState(slotKey, { url: publicUrl, uploading: false, error: null })
  }

  async function handleRemove(slotKey: string) {
    if (!tenantId) return
    setSlotState(slotKey, { uploading: true, error: null })

    await supabase
      .from('store_assets')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('slot', slotKey)

    // Limpiar también store_config si aplica
    const configField = SYNC_TO_STORE_CONFIG[slotKey]
    if (configField) {
      await supabase
        .from('store_config')
        .update({ [configField]: null })
        .eq('tenant_id', tenantId)
    }

    setSlotState(slotKey, { url: null, uploading: false, error: null })
  }

  const slotDefs = TEMPLATE_SLOTS[template] ?? TEMPLATE_SLOTS['default']

  // Agrupar slots por categoría (prefijo antes de '_')
  const groups: Record<string, typeof slotDefs> = {}
  for (const s of slotDefs) {
    const prefix = s.key.split('_')[0]
    if (!groups[prefix]) groups[prefix] = []
    groups[prefix].push(s)
  }

  const groupLabels: Record<string, string> = {
    logo:       'Identidad',
    hero:       'Hero',
    collection: 'Colecciones',
    blog:       'Blog',
    banner:     'Banners',
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
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-zinc-900">Personalización</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Imágenes de tu tienda. Cada foto se actualiza al instante en tu sitio.
        </p>
        <div className="mt-2 inline-flex items-center gap-1.5 bg-violet-50 text-violet-700 text-xs font-medium px-2.5 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" />
          Template: {template}
        </div>
      </div>

      {/* Grupos de slots */}
      <div className="space-y-10">
        {Object.entries(groups).map(([prefix, groupSlots]) => (
          <section key={prefix}>
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
              {groupLabels[prefix] ?? prefix}
            </h2>
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
          </section>
        ))}
      </div>
    </div>
  )
}

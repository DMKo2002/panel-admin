'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/compress-image'
import { ImageIcon, Upload, X, Loader2, Check } from 'lucide-react'
import Toggle from '@/components/Toggle'

// ─── Slots de imágenes por template ──────────────────────────────────────────
const MINIMALISTA_SLOTS = [
  { key: 'logo',         label: 'Logo',              hint: 'PNG o SVG transparente — alto fijo 160 px, ancho proporcional', aspect: 'logo' },
  { key: 'logo_favicon', label: 'Favicon',            hint: 'PNG cuadrado — 512 × 512 px',                               aspect: '1/1'  },
  { key: 'hero_main',    label: 'Hero principal',     hint: '1400 × 850 px',                 aspect: '16/9' },
  { key: 'moodboard_1',  label: 'MoodBoard — Foto 1', hint: '600 × 600 px cuadrado',         aspect: '1/1' },
  { key: 'moodboard_2',  label: 'MoodBoard — Foto 2', hint: '600 × 600 px cuadrado',         aspect: '1/1' },
  { key: 'moodboard_3',  label: 'MoodBoard — Foto 3', hint: '600 × 600 px cuadrado',         aspect: '1/1' },
  { key: 'moodboard_4',  label: 'MoodBoard — Foto 4', hint: '600 × 600 px cuadrado',         aspect: '1/1' },
]

const TEMPLATE_SLOTS: Record<string, { key: string; label: string; hint: string; aspect: string; allowVideo?: boolean }[]> = {
  minimalista: MINIMALISTA_SLOTS,
  atelier: [
    { key: 'logo',         label: 'Logo',                hint: 'PNG o SVG transparente — alto fijo 160 px, ancho proporcional', aspect: 'logo'  },
    { key: 'logo_favicon', label: 'Favicon',              hint: 'PNG cuadrado — 512 × 512 px',                               aspect: '1/1'   },
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
  mono: [
    { key: 'logo',         label: 'Logo',              hint: 'PNG o SVG transparente — se muestra en el panel izquierdo del hero, 150 px de ancho (alto proporcional)', aspect: 'logo' },
    { key: 'logo_favicon', label: 'Favicon',           hint: 'PNG cuadrado — 512 × 512 px', aspect: '1/1' },
    { key: 'hero_main',    label: 'Hero principal',    hint: '1300 × 975 px — columna a la derecha del hero', aspect: '1300/975' },
    { key: 'gallery_1',    label: 'Mosaico — Foto grande (izq.)', hint: '864 × 1117 px — ocupa toda la altura de la sección', aspect: '864/1117' },
    { key: 'gallery_2',    label: 'Mosaico — Foto ancha (arriba der.)', hint: '864 × 559 px', aspect: '864/559' },
    { key: 'gallery_3',    label: 'Mosaico — Foto chica 1 (abajo der.)', hint: '432 × 559 px', aspect: '432/559' },
    { key: 'gallery_4',    label: 'Mosaico — Foto chica 2 (abajo der.)', hint: '432 × 559 px', aspect: '432/559' },
    { key: 'moodboard_banner', label: 'Moodboard — Franja superior', hint: '1728 × 200 px — franja panorámica con texto superpuesto', aspect: '1728/200' },
    { key: 'moodboard_left',   label: 'Moodboard — Foto izquierda',  hint: '860 × 573 px', aspect: '860/573' },
    { key: 'moodboard_right',  label: 'Moodboard — Foto derecha',    hint: '860 × 573 px', aspect: '860/573' },
  ],
  axis: [
    { key: 'logo',         label: 'Logo',              hint: 'PNG o SVG transparente — se muestra en el panel izquierdo del hero, 150 px de ancho (alto proporcional)', aspect: 'logo' },
    { key: 'logo_favicon', label: 'Favicon',           hint: 'PNG cuadrado — 512 × 512 px', aspect: '1/1' },
    { key: 'hero_main',    label: 'Hero — Video',      hint: 'Video MP4, 1117 × 1117 px aprox. (cuadrado) — también acepta una imagen si preferís no usar video', aspect: '1/1', allowVideo: true },
    { key: 'gallery_1',    label: 'Mosaico — Foto grande (izq.)', hint: '864 × 1117 px — ocupa toda la altura de la sección', aspect: '864/1117' },
    { key: 'gallery_2',    label: 'Mosaico — Foto ancha (arriba der.)', hint: '864 × 559 px', aspect: '864/559' },
    { key: 'gallery_3',    label: 'Mosaico — Foto chica 1 (abajo der.)', hint: '432 × 559 px', aspect: '432/559' },
    { key: 'gallery_4',    label: 'Mosaico — Foto chica 2 (abajo der.)', hint: '432 × 559 px', aspect: '432/559' },
    { key: 'moodboard_banner', label: 'Moodboard — Franja superior', hint: '1728 × 200 px — franja panorámica con texto superpuesto', aspect: '1728/200' },
    { key: 'moodboard_left',   label: 'Moodboard — Foto izquierda',  hint: '860 × 573 px', aspect: '860/573' },
    { key: 'moodboard_right',  label: 'Moodboard — Foto derecha',    hint: '860 × 573 px', aspect: '860/573' },
  ],
  glow: [
    { key: 'logo',         label: 'Logo',                 hint: 'PNG o SVG transparente — alto fijo 160 px, ancho proporcional', aspect: 'logo' },
    { key: 'logo_favicon', label: 'Favicon',               hint: 'PNG cuadrado — 512 × 512 px',                               aspect: '1/1'  },
    { key: 'banner_1',     label: 'Banner — Foto 1',       hint: '1600 × 600 px recomendado',                                 aspect: '16/6' },
    { key: 'banner_2',     label: 'Banner — Foto 2',       hint: '1600 × 600 px recomendado',                                 aspect: '16/6' },
    { key: 'banner_3',     label: 'Banner — Foto 3',       hint: '1600 × 600 px recomendado',                                 aspect: '16/6' },
    { key: 'collection_1', label: 'Colección — Banner 1', hint: '600 × 750 px recomendado',     aspect: '4/5'   },
    { key: 'collection_2', label: 'Colección — Banner 2', hint: '600 × 750 px recomendado',     aspect: '4/5'   },
    { key: 'collection_3', label: 'Colección — Banner 3', hint: '600 × 750 px recomendado',     aspect: '4/5'   },
  ],
  mykonoslove: [
    { key: 'logo',         label: 'Logo',                hint: 'PNG o SVG transparente — alto fijo 160 px, ancho proporcional', aspect: 'logo'  },
    { key: 'logo_favicon', label: 'Favicon',              hint: 'PNG cuadrado — 512 × 512 px',                               aspect: '1/1'   },
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
  logo:         'logo_url',
  logo_favicon: 'favicon_url',
  hero_main:    'hero_image_url',
}

const groupLabels: Record<string, string> = {
  logo:       'Identidad',
  hero:       'Hero',
  collection: 'Colecciones',
  blog:       'Blog',
  banner:     'Banners',
  moodboard:  'MoodBoard',
  gallery:    'Mosaico de fotos',
}

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface SlotState {
  url: string | null
  uploading: boolean
  error: string | null
  saved?: boolean
}

// ─── Componente de slot de imagen (o video, si el slot lo permite) ───────────
const isVideoUrl = (url: string) => /\.(mp4|webm|mov)(\?|$)/i.test(url)

function AssetSlot({ slotDef, state, onUpload, onRemove }: {
  slotDef: { key: string; label: string; hint: string; aspect: string; allowVideo?: boolean }
  state: SlotState
  onUpload: (file: File) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const isValidFile = (file: File) =>
    file.type.startsWith('image/') || (!!slotDef.allowVideo && file.type.startsWith('video/'))

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && isValidFile(file)) onUpload(file)
  }

  const showingVideo = !!state.url && slotDef.allowVideo && isVideoUrl(state.url)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-zinc-800">{slotDef.label}</p>
        <p className="text-xs text-zinc-400">{slotDef.hint}</p>
      </div>
      <div
        className="relative overflow-hidden rounded-lg border-2 border-dashed border-zinc-200 cursor-pointer hover:border-primary-400 transition-colors group"
        style={{
          ...(slotDef.aspect === 'logo'
            ? { height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }
            : { aspectRatio: slotDef.aspect }),
          ...(!state.url ? { background: 'linear-gradient(135deg, #E3E0DA 0%, #A4A49C 100%)' } : {}),
        }}
        onClick={() => !state.uploading && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
      >
        {state.url ? (
          <>
            {showingVideo ? (
              <video src={state.url} muted loop autoPlay playsInline className="w-full h-full object-cover" />
            ) : (
              <img src={state.url} alt={slotDef.label}
                className={slotDef.aspect === 'logo' ? 'max-h-full w-auto object-contain' : 'w-full h-full object-cover'} />
            )}
            {state.saved && (
              <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-green-500 text-white text-xs font-medium px-2 py-1 rounded-full shadow">
                <Check size={10} /> Guardado
              </div>
            )}
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.25)]">
            {state.uploading ? <Loader2 size={24} className="animate-spin" /> : <><ImageIcon size={24} className="drop-shadow" /><span className="text-xs">{slotDef.allowVideo ? 'Subir imagen o video' : 'Subir imagen'}</span></>}
          </div>
        )}
        {state.uploading && state.url && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-white" />
          </div>
        )}
      </div>
      {state.error && <p className="text-xs text-red-500">{state.error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={slotDef.allowVideo ? 'image/*,video/*' : 'image/*'}
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f && isValidFile(f)) onUpload(f) }}
      />
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function AparienciaPage() {
  const supabase = createClient()

  // ── Image slots
  const [template, setTemplate] = useState<string>('minimalista')
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [configId, setConfigId] = useState<string | null>(null)
  const [slots, setSlots] = useState<Record<string, SlotState>>({})
  const [loading, setLoading] = useState(true)

  // ── Identidad de marca
  const [storeName, setStoreName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [savedName, setSavedName] = useState(false)
  const [errorName, setErrorName] = useState<string | null>(null)

  // ── Hero texts
  const [heroTextColor, setHeroTextColor] = useState('#FFFFFF')
  const [heroEyebrow, setHeroEyebrow] = useState('Nueva temporada')
  const [heroLine1, setHeroLine1] = useState('Estilo que')
  const [heroItalic, setHeroItalic] = useState('trasciende')
  const [heroSubtitle, setHeroSubtitle] = useState('Piezas únicas diseñadas para\nquienes buscan estilo y distinción.')
  const [heroSeason, setHeroSeason] = useState('AW')
  const [savingHero, setSavingHero] = useState(false)
  const [savedHero, setSavedHero] = useState(false)
  const [errorHero, setErrorHero] = useState<string | null>(null)

  // ── Color de texto sobre imágenes (Menú y Colecciones)
  const [navTextColor, setNavTextColor] = useState('#FFFFFF')
  const [collectionTextColor, setCollectionTextColor] = useState('') // '' = automático
  const [savingColors, setSavingColors] = useState(false)
  const [savedColors, setSavedColors] = useState(false)
  const [errorColors, setErrorColors] = useState<string | null>(null)

  // ── Colecciones (título + bajada de cada banner)
  const [collectionPosts, setCollectionPosts] = useState([
    { title: '', subtitle: '' },
    { title: '', subtitle: '' },
    { title: '', subtitle: '' },
  ])
  const [savingCollectionPosts, setSavingCollectionPosts] = useState(false)
  const [savedCollectionPosts, setSavedCollectionPosts] = useState(false)
  const [errorCollectionPosts, setErrorCollectionPosts] = useState<string | null>(null)

  // ── Blog
  const [blogHeading, setBlogHeading] = useState('Fashion news & tips')
  const [blogSubheading, setBlogSubheading] = useState('Todo sobre moda, tendencias y cuidado de prendas')
  const [blogPosts, setBlogPosts] = useState([
    { title: 'Tendencias de temporada', excerpt: 'Descubrí las piezas clave que definen la moda de esta temporada y cómo combinarlas para crear looks únicos.' },
    { title: 'Guía de talles y ajuste', excerpt: 'Todo lo que necesitás saber para elegir el talle perfecto y conseguir el ajuste ideal en cada prenda.' },
    { title: 'Cuidado de prendas', excerpt: 'Consejos esenciales para mantener tus prendas favoritas en perfecto estado temporada tras temporada.' },
  ])
  const [savingBlog, setSavingBlog] = useState(false)
  const [savedBlog, setSavedBlog] = useState(false)
  const [errorBlog, setErrorBlog] = useState<string | null>(null)

  // ── Newsletter
  const [newsletterBgColor, setNewsletterBgColor] = useState('#DBD1BA')
  const [savingNewsletter, setSavingNewsletter] = useState(false)
  const [savedNewsletter, setSavedNewsletter] = useState(false)
  const [errorNewsletter, setErrorNewsletter] = useState<string | null>(null)

  // ── Recibos PDF
  const [pdfShowVariant, setPdfShowVariant] = useState(true)
  const [pdfShowPricetype, setPdfShowPricetype] = useState(true)
  const [pdfShowAddress, setPdfShowAddress] = useState(true)
  const [pdfShowNotes, setPdfShowNotes] = useState(true)
  const [savingPdf, setSavingPdf] = useState(false)
  const [savedPdf, setSavedPdf] = useState(false)
  const [errorPdf, setErrorPdf] = useState<string | null>(null)

  // ── Guardar todo (botón único arriba de la página)
  const [savingAll, setSavingAll] = useState(false)
  const [savedAll, setSavedAll] = useState(false)
  const [errorAll, setErrorAll] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: _userRows } = await supabase.from('users').select('tenant_id').eq('id', user.id).limit(1)
        const userRow = _userRows?.[0]
        if (!userRow?.tenant_id) return
        setTenantId(userRow?.tenant_id)

        const { data: tenant } = await supabase.from('tenants').select('name, template').eq('id', userRow.tenant_id).single()
        const tmpl = (tenant as any)?.template ?? 'minimalista'
        setTemplate(tmpl)
        setStoreName((tenant as any)?.name ?? '')

        const { data: cfg } = await supabase.from('store_config').select('*').eq('tenant_id', userRow.tenant_id).single()
        if (cfg) {
          setConfigId(cfg.id)
          setHeroTextColor((cfg as any).hero_text_color ?? '#FFFFFF')
          setHeroEyebrow((cfg as any).hero_eyebrow ?? 'Nueva temporada')
          setHeroLine1((cfg as any).hero_title_line1 ?? 'Estilo que')
          // Migración: la línea 2 (itálica) ahora es el renglón 2 completo.
          const rawItalic = (cfg as any).hero_title_italic ?? 'trasciende'
          const rawLine3 = (cfg as any).hero_title_line3 ?? ''
          setHeroItalic(rawLine3 ? `${rawItalic} ${rawLine3}`.trim() : rawItalic)
          setHeroSeason((cfg as any).hero_season ?? 'AW')
          setHeroSubtitle((cfg as any).hero_subtitle ?? 'Piezas únicas diseñadas para\nquienes buscan estilo y distinción.')
          setNavTextColor((cfg as any).nav_text_color ?? '#FFFFFF')
          setCollectionTextColor((cfg as any).collection_text_color ?? '')
          const rawCollectionPosts = (cfg as any).collection_posts
          if (Array.isArray(rawCollectionPosts) && rawCollectionPosts.length === 3) {
            setCollectionPosts(rawCollectionPosts.map((p: any) => ({ title: p?.title ?? '', subtitle: p?.subtitle ?? '' })))
          }
          setBlogHeading((cfg as any).blog_heading ?? 'Fashion news & tips')
          setBlogSubheading((cfg as any).blog_subheading ?? 'Todo sobre moda, tendencias y cuidado de prendas')
          const rawBlogPosts = (cfg as any).blog_posts
          if (Array.isArray(rawBlogPosts) && rawBlogPosts.length === 3) {
            setBlogPosts(rawBlogPosts.map((p: any) => ({ title: p?.title ?? '', excerpt: p?.excerpt ?? '' })))
          }
          setNewsletterBgColor((cfg as any).newsletter_bg_color ?? '#DBD1BA')
          setPdfShowVariant((cfg as any).pdf_show_variant ?? true)
          setPdfShowPricetype((cfg as any).pdf_show_pricetype ?? true)
          setPdfShowAddress((cfg as any).pdf_show_address ?? true)
          setPdfShowNotes((cfg as any).pdf_show_notes ?? true)
        }

        const { data: assets } = await supabase.from('store_assets').select('slot, url').eq('tenant_id', userRow.tenant_id)
        const slotDefs = TEMPLATE_SLOTS[tmpl] ?? TEMPLATE_SLOTS['minimalista']
        const initial: Record<string, SlotState> = {}
        for (const s of slotDefs) {
          const existing = assets?.find(a => a.slot === s.key)
          initial[s.key] = { url: existing?.url ?? null, uploading: false, error: null }
        }
        setSlots(initial)
      } catch (e) {
        console.error('[Apariencia] Error al cargar:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function setSlotState(key: string, patch: Partial<SlotState>) {
    setSlots(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  async function handleUpload(slotKey: string, rawFile: File) {
    if (!tenantId) return
    setSlotState(slotKey, { uploading: true, error: null })
    // Comprimir antes de subir — los heros crudos del celular (3-4 MB) fueron
    // los que reventaron el egress de Supabase. Logos mantienen transparencia.
    const esLogo = slotKey.startsWith('logo')
    const file = rawFile.type.startsWith('image/')
      ? await compressImage(rawFile, esLogo ? { maxDim: 800, keepAlpha: true } : { maxDim: 1920, targetKB: 400 })
      : rawFile
    const ext = file.name.split('.').pop()
    const path = `${tenantId}/${slotKey}.${ext}`
    const { error: uploadError } = await supabase.storage.from('store-assets').upload(path, file, { upsert: true, cacheControl: '31536000' })
    if (uploadError) { setSlotState(slotKey, { uploading: false, error: `Error al subir: ${uploadError.message}` }); return }
    const { data: { publicUrl } } = supabase.storage.from('store-assets').getPublicUrl(path)
    const freshUrl = `${publicUrl}?t=${Date.now()}`
    const { error: dbError } = await supabase.from('store_assets').upsert({ tenant_id: tenantId, slot: slotKey, url: freshUrl, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id,slot' })
    if (dbError) { setSlotState(slotKey, { uploading: false, error: `Error al guardar: ${dbError.message}` }); return }
    const configField = SYNC_TO_STORE_CONFIG[slotKey]
    if (configField) {
      const { error: syncError } = await supabase.from('store_config').update({ [configField]: freshUrl }).eq('tenant_id', tenantId)
      if (syncError) {
        setSlotState(slotKey, { uploading: false, error: `La imagen se subió pero no se pudo guardar en la config: ${syncError.message}` })
        return
      }
    }
    setSlotState(slotKey, { url: freshUrl, uploading: false, error: null, saved: true })
    setTimeout(() => setSlotState(slotKey, { saved: false }), 2500)
  }

  async function handleRemove(slotKey: string) {
    if (!tenantId) return
    setSlotState(slotKey, { uploading: true, error: null })
    const { error: delError } = await supabase.from('store_assets').delete().eq('tenant_id', tenantId).eq('slot', slotKey)
    if (delError) {
      setSlotState(slotKey, { uploading: false, error: `No se pudo quitar la imagen: ${delError.message}` })
      return
    }
    const configField = SYNC_TO_STORE_CONFIG[slotKey]
    if (configField) {
      const { error: syncError } = await supabase.from('store_config').update({ [configField]: null }).eq('tenant_id', tenantId)
      if (syncError) {
        setSlotState(slotKey, { uploading: false, error: `Se quitó la imagen pero no se pudo actualizar la config: ${syncError.message}` })
        return
      }
    }
    setSlotState(slotKey, { url: null, uploading: false, error: null })
  }

  async function handleSaveHero(): Promise<string | undefined> {
    if (!configId) return
    setSavingHero(true); setErrorHero(null)
    const { error } = await supabase.from('store_config').update({
      hero_eyebrow:      heroEyebrow    || null,
      hero_title_line1:  heroLine1      || null,
      hero_title_italic: heroItalic     || null,
      hero_title_line3:  null,
      hero_subtitle:     heroSubtitle   || null,
      hero_season:       heroSeason     || null,
      hero_text_color:   heroTextColor  || null,
    }).eq('id', configId)
    setSavingHero(false)
    if (error) { const msg = 'Error al guardar: ' + error.message; setErrorHero(msg); return msg }
    setSavedHero(true); setTimeout(() => setSavedHero(false), 2000)
  }

  async function handleSaveColors(): Promise<string | undefined> {
    if (!configId) return
    setSavingColors(true); setErrorColors(null)
    const { error } = await supabase.from('store_config').update({
      nav_text_color:        navTextColor        || null,
      collection_text_color: collectionTextColor || null,
    }).eq('id', configId)
    setSavingColors(false)
    if (error) { const msg = 'Error al guardar: ' + error.message; setErrorColors(msg); return msg }
    setSavedColors(true); setTimeout(() => setSavedColors(false), 2000)
  }

  async function handleSaveCollectionPosts(): Promise<string | undefined> {
    if (!configId) return
    setSavingCollectionPosts(true); setErrorCollectionPosts(null)
    const { error } = await supabase.from('store_config').update({
      collection_posts: collectionPosts,
    }).eq('id', configId)
    setSavingCollectionPosts(false)
    if (error) { const msg = 'Error al guardar: ' + error.message; setErrorCollectionPosts(msg); return msg }
    setSavedCollectionPosts(true); setTimeout(() => setSavedCollectionPosts(false), 2000)
  }

  async function handleSaveBlog(): Promise<string | undefined> {
    if (!configId) return
    setSavingBlog(true); setErrorBlog(null)
    const { error } = await supabase.from('store_config').update({
      blog_heading:    blogHeading    || null,
      blog_subheading: blogSubheading || null,
      blog_posts:      blogPosts,
    }).eq('id', configId)
    setSavingBlog(false)
    if (error) { const msg = 'Error al guardar: ' + error.message; setErrorBlog(msg); return msg }
    setSavedBlog(true); setTimeout(() => setSavedBlog(false), 2000)
  }

  async function handleSaveNewsletter(): Promise<string | undefined> {
    if (!configId) return
    setSavingNewsletter(true); setErrorNewsletter(null)
    const { error } = await supabase.from('store_config').update({
      newsletter_bg_color: newsletterBgColor || null,
    }).eq('id', configId)
    setSavingNewsletter(false)
    if (error) { const msg = 'Error al guardar: ' + error.message; setErrorNewsletter(msg); return msg }
    setSavedNewsletter(true); setTimeout(() => setSavedNewsletter(false), 2000)
  }

  async function handleSaveName(): Promise<string | undefined> {
    if (!tenantId) return
    setSavingName(true); setErrorName(null)
    const { error } = await supabase.from('tenants').update({ name: storeName.trim() }).eq('id', tenantId)
    setSavingName(false)
    if (error) { const msg = 'Error al guardar: ' + error.message; setErrorName(msg); return msg }
    setSavedName(true); setTimeout(() => setSavedName(false), 2000)
  }

  async function handleSavePdf(): Promise<string | undefined> {
    if (!configId) return
    setSavingPdf(true); setErrorPdf(null)
    const { error } = await supabase.from('store_config').update({
      pdf_show_variant:   pdfShowVariant,
      pdf_show_pricetype: pdfShowPricetype,
      pdf_show_address:   pdfShowAddress,
      pdf_show_notes:     pdfShowNotes,
    }).eq('id', configId)
    setSavingPdf(false)
    if (error) { const msg = 'Error al guardar: ' + error.message; setErrorPdf(msg); return msg }
    setSavedPdf(true); setTimeout(() => setSavedPdf(false), 2000)
  }

  // Guarda todas las secciones de texto/color de la página en un solo click.
  // Las imágenes (logo, banners, etc.) no entran acá: se suben y guardan solas
  // al elegir el archivo, y cada slot muestra su propio "✓ Guardado" al hacerlo.
  async function handleSaveAll() {
    setSavingAll(true); setErrorAll(null); setSavedAll(false)
    const tasks: Promise<string | undefined>[] = [
      handleSaveName(),
      handleSavePdf(),
    ]
    if (template !== 'glow') tasks.push(handleSaveHero())
    if (!isMono) tasks.push(handleSaveColors())
    if (hasCollections) tasks.push(handleSaveCollectionPosts())
    if (hasBlogSections) tasks.push(handleSaveBlog(), handleSaveNewsletter())

    const results = await Promise.all(tasks)
    setSavingAll(false)
    const errors = results.filter(Boolean) as string[]
    if (errors.length > 0) {
      setErrorAll(`No se pudo guardar ${errors.length === 1 ? '1 sección' : errors.length + ' secciones'} — mirá el detalle en cada bloque de abajo`)
    } else {
      setSavedAll(true)
      setTimeout(() => setSavedAll(false), 2500)
    }
  }

  const slotDefs = TEMPLATE_SLOTS[template] ?? TEMPLATE_SLOTS['minimalista']
  const groups: Record<string, typeof slotDefs> = {}
  for (const s of slotDefs) {
    const prefix = s.key.split('_')[0]
    if (!groups[prefix]) groups[prefix] = []
    groups[prefix].push(s)
  }
  const isMono = template === 'mono' || template === 'axis'
  const hasBlogSections = template === 'atelier' || template === 'mykonoslove'
  const hasCollections = template === 'atelier' || template === 'mykonoslove' || template === 'glow'

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
        <h1 className="text-xl font-semibold text-zinc-900">Apariencia</h1>
        <p className="text-sm text-zinc-500 mt-1">Imágenes y contenido de tu tienda. Los cambios se ven al instante.</p>
        <div className="mt-2 inline-flex items-center gap-1.5 bg-primary-50 text-primary-700 text-xs font-medium px-2.5 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-primary-400 inline-block" />
          Template: {template}
        </div>
      </div>

      {/* ── Guardar todo (barra fija arriba) ── */}
      <div className="sticky top-0 z-20 -mx-8 px-8 py-3 bg-white/95 backdrop-blur border-b border-zinc-200 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-700">Guardar todos los cambios</p>
          <p className="text-xs text-zinc-400">Las imágenes se suben y guardan solas (mirá el "✓ Guardado" en cada foto). Este botón guarda de una vez todos los textos, colores y datos de esta página.</p>
        </div>
        <div className="flex items-center gap-3">
          {errorAll && <p className="text-xs text-red-500 max-w-xs text-right">{errorAll}</p>}
          <button onClick={handleSaveAll} disabled={savingAll} className="btn-secondary text-xs py-1.5 px-4 disabled:opacity-60 whitespace-nowrap">
            {savedAll ? '✓ Todo guardado' : savingAll ? 'Guardando...' : 'Guardar todos los cambios'}
          </button>
        </div>
      </div>

      {/* ── Identidad de marca ── */}
      <section className="space-y-6">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-200 pb-3">
          Identidad de marca
        </h2>
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-700">Nombre de la tienda</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Aparece en el sitio, footer y comprobantes</p>
            </div>
            <button onClick={handleSaveName} disabled={savingName} className="btn-secondary text-xs py-1.5 disabled:opacity-60">
              {savedName ? '✓ Guardado' : savingName ? 'Guardando...' : 'Guardar nombre'}
            </button>
            {errorName && <p className="text-xs text-red-500 mt-1.5">{errorName}</p>}
          </div>
          <input className="input" value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="Nombre de tu marca..." />
        </div>
      </section>

      {!isMono && (
      <>
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

      {/* ── Textos del Hero ── (Glow no usa hero de texto — su home es el carrusel de banners) */}
      {template !== 'glow' && (
      <section className="space-y-6">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-200 pb-3">
          Textos del Hero
        </h2>
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-700">Texto principal de portada</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Editá el título y la temporada que se muestran en el hero</p>
            </div>
            <button onClick={handleSaveHero} disabled={savingHero} className="btn-secondary text-xs py-1.5 disabled:opacity-60">
              {savedHero ? '✓ Guardado' : savingHero ? 'Guardando...' : 'Guardar hero'}
            </button>
            {errorHero && <p className="text-xs text-red-500 mt-1.5">{errorHero}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Código de temporada</label>
              <input className="input text-sm font-mono" value={heroSeason} onChange={e => setHeroSeason(e.target.value)} placeholder="AW2026" />
              <p className="text-xs text-zinc-400 mt-1">Aparece como texto decorativo en el fondo (ej: AW2026, SS2027)</p>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Texto pequeño (sobre el título)</label>
              <input className="input text-sm" value={heroEyebrow} onChange={e => setHeroEyebrow(e.target.value)} placeholder="Nueva temporada" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-zinc-500 mb-1">Título — Línea 1 <span className="text-zinc-400">(regular)</span></label>
              <input className="input text-sm" value={heroLine1} onChange={e => setHeroLine1(e.target.value)} placeholder="Estilo que" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-zinc-500 mb-1">Título — Línea 2 <span className="italic">(itálica)</span></label>
              <input className="input text-sm italic" value={heroItalic} onChange={e => setHeroItalic(e.target.value)} placeholder="trasciende la tendencia" />
              <p className="text-xs text-zinc-400 mt-1">Frase completa del segundo renglón — se muestra en itálica</p>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-zinc-500 mb-1">Bajada (debajo del título)</label>
              <textarea
                className="input text-sm min-h-[60px] resize-y"
                value={heroSubtitle}
                onChange={e => setHeroSubtitle(e.target.value)}
                placeholder={'Piezas únicas diseñadas para\nquienes buscan estilo y distinción.'}
              />
              <p className="text-xs text-zinc-400 mt-1">Un enter = salto de línea en el hero</p>
            </div>
            <div className="col-span-2 pt-2 border-t border-zinc-100">
              <label className="block text-xs text-zinc-500 mb-2">Color del texto</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={heroTextColor}
                  onChange={e => setHeroTextColor(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border border-zinc-200 p-0.5 bg-white"
                />
                <input
                  className="input text-sm font-mono w-32"
                  value={heroTextColor}
                  onChange={e => setHeroTextColor(e.target.value)}
                  placeholder="#FFFFFF"
                />
                <div className="flex gap-2">
                  {['#FFFFFF', '#1A1A1A', '#F5F0EB', '#8B7355'].map(c => (
                    <button
                      key={c}
                      onClick={() => setHeroTextColor(c)}
                      className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                      style={{ backgroundColor: c, borderColor: heroTextColor === c ? '#7C3AED' : '#E5E7EB' }}
                      title={c}
                    />
                  ))}
                </div>
                <p className="text-xs text-zinc-400">Usá blanco para fotos oscuras, negro para fotos claras</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* ── Color del menú ── */}
      <section className="space-y-6">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-200 pb-3">
          Color del menú
        </h2>
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-700">Texto del menú (siempre sobre el hero)</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Elegí blanco o negro según el contraste de la foto del hero</p>
            </div>
            <button onClick={handleSaveColors} disabled={savingColors} className="btn-secondary text-xs py-1.5 disabled:opacity-60">
              {savedColors ? '✓ Guardado' : savingColors ? 'Guardando...' : 'Guardar color'}
            </button>
            {errorColors && <p className="text-xs text-red-500 mt-1.5">{errorColors}</p>}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={navTextColor}
              onChange={e => setNavTextColor(e.target.value)}
              className="w-10 h-10 rounded cursor-pointer border border-zinc-200 p-0.5 bg-white"
            />
            <input
              className="input text-sm font-mono w-32"
              value={navTextColor}
              onChange={e => setNavTextColor(e.target.value)}
              placeholder="#FFFFFF"
            />
            <div className="flex gap-2">
              {['#FFFFFF', '#1A1A1A'].map(c => (
                <button
                  key={c}
                  onClick={() => setNavTextColor(c)}
                  className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{ backgroundColor: c, borderColor: navTextColor === c ? '#7C3AED' : '#E5E7EB' }}
                  title={c}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {hasCollections && (
      <>
      {/* ── Colecciones ── */}
      <section className="space-y-6">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-200 pb-3">
          Colecciones
        </h2>
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-700">Título y bajada de cada banner</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Si dejás un título vacío, se usa el nombre de la categoría automáticamente</p>
            </div>
            <button onClick={handleSaveCollectionPosts} disabled={savingCollectionPosts} className="btn-secondary text-xs py-1.5 disabled:opacity-60">
              {savedCollectionPosts ? '✓ Guardado' : savingCollectionPosts ? 'Guardando...' : 'Guardar colecciones'}
            </button>
            {errorCollectionPosts && <p className="text-xs text-red-500 mt-1.5">{errorCollectionPosts}</p>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {collectionPosts.map((post, i) => (
              <div key={i} className="space-y-2">
                <p className="text-xs font-medium text-zinc-600">Banner {i + 1}</p>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Título</label>
                  <input
                    className="input text-sm"
                    value={post.title}
                    onChange={e => setCollectionPosts(prev => prev.map((p, idx) => idx === i ? { ...p, title: e.target.value } : p))}
                    placeholder={['Nueva Colección', 'Accesorios', 'Ropa'][i]}
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Bajada</label>
                  <input
                    className="input text-sm"
                    value={post.subtitle}
                    onChange={e => setCollectionPosts(prev => prev.map((p, idx) => idx === i ? { ...p, subtitle: e.target.value } : p))}
                    placeholder="Piezas seleccionadas para esta temporada."
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-zinc-100">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs text-zinc-500">Color de texto de los banners</label>
              <button onClick={handleSaveColors} disabled={savingColors} className="btn-secondary text-xs py-1.5 disabled:opacity-60">
                {savedColors ? '✓ Guardado' : savingColors ? 'Guardando...' : 'Guardar color'}
              </button>
            {errorColors && <p className="text-xs text-red-500 mt-1.5">{errorColors}</p>}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCollectionTextColor('')}
                className={`text-xs px-3 py-2 rounded-lg border ${collectionTextColor === '' ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-zinc-200 text-zinc-500'}`}
              >
                Automático
              </button>
              <input
                type="color"
                value={collectionTextColor || '#FFFFFF'}
                onChange={e => setCollectionTextColor(e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border border-zinc-200 p-0.5 bg-white"
              />
              <input
                className="input text-sm font-mono w-32"
                value={collectionTextColor}
                onChange={e => setCollectionTextColor(e.target.value)}
                placeholder="Automático"
              />
              <div className="flex gap-2">
                {['#FFFFFF', '#1A1A1A'].map(c => (
                  <button
                    key={c}
                    onClick={() => setCollectionTextColor(c)}
                    className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                    style={{ backgroundColor: c, borderColor: collectionTextColor === c ? '#7C3AED' : '#E5E7EB' }}
                    title={c}
                  />
                ))}
              </div>
            </div>
            <p className="text-xs text-zinc-400 mt-2">"Automático" usa blanco cuando el banner tiene imagen y negro cuando no</p>
          </div>
        </div>
      </section>
      </>
      )}

      {hasBlogSections && (
      <>
      {/* ── Blog ── */}
      <section className="space-y-6">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-200 pb-3">
          Blog
        </h2>
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-700">Sección "Fashion news &amp; tips"</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Título, bajada y las 3 notas que aparecen casi al pie de la home</p>
            </div>
            <button onClick={handleSaveBlog} disabled={savingBlog} className="btn-secondary text-xs py-1.5 disabled:opacity-60">
              {savedBlog ? '✓ Guardado' : savingBlog ? 'Guardando...' : 'Guardar blog'}
            </button>
            {errorBlog && <p className="text-xs text-red-500 mt-1.5">{errorBlog}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Título de la sección</label>
              <input className="input text-sm" value={blogHeading} onChange={e => setBlogHeading(e.target.value)} placeholder="Fashion news & tips" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Bajada</label>
              <input className="input text-sm" value={blogSubheading} onChange={e => setBlogSubheading(e.target.value)} placeholder="Todo sobre moda, tendencias y cuidado de prendas" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-zinc-100">
            {blogPosts.map((post, i) => (
              <div key={i} className="space-y-2">
                <p className="text-xs font-medium text-zinc-600">Nota {i + 1}</p>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Título</label>
                  <input
                    className="input text-sm"
                    value={post.title}
                    onChange={e => setBlogPosts(prev => prev.map((p, idx) => idx === i ? { ...p, title: e.target.value } : p))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Texto</label>
                  <textarea
                    className="input text-sm min-h-[80px] resize-y"
                    value={post.excerpt}
                    onChange={e => setBlogPosts(prev => prev.map((p, idx) => idx === i ? { ...p, excerpt: e.target.value } : p))}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-400">La fecha se genera sola con el día de hoy. Las fotos se cargan arriba, en Imágenes → Blog</p>
        </div>
      </section>

      {/* ── Newsletter ── */}
      <section className="space-y-6">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-200 pb-3">
          Newsletter
        </h2>
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-700">Color de fondo del bloque "Recibí las últimas novedades"</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Es el bloque casi al final de la home, antes del footer</p>
            </div>
            <button onClick={handleSaveNewsletter} disabled={savingNewsletter} className="btn-secondary text-xs py-1.5 disabled:opacity-60">
              {savedNewsletter ? '✓ Guardado' : savingNewsletter ? 'Guardando...' : 'Guardar color'}
            </button>
            {errorNewsletter && <p className="text-xs text-red-500 mt-1.5">{errorNewsletter}</p>}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={newsletterBgColor}
              onChange={e => setNewsletterBgColor(e.target.value)}
              className="w-10 h-10 rounded cursor-pointer border border-zinc-200 p-0.5 bg-white"
            />
            <input
              className="input text-sm font-mono w-32"
              value={newsletterBgColor}
              onChange={e => setNewsletterBgColor(e.target.value)}
              placeholder="#DBD1BA"
            />
            <div className="flex gap-2">
              {['#DBD1BA', '#F0EFEC', '#E8E0D8', '#D8E0E8', '#1A1A1A'].map(c => (
                <button
                  key={c}
                  onClick={() => setNewsletterBgColor(c)}
                  className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{ backgroundColor: c, borderColor: newsletterBgColor === c ? '#7C3AED' : '#E5E7EB' }}
                  title={c}
                />
              ))}
            </div>
          </div>
          <p className="text-xs text-zinc-400">El texto de ese bloque es siempre oscuro, así que conviene elegir un color claro</p>
        </div>
      </section>
      </>
      )}
      </>
      )}

      {isMono && (
      <>
      {/* ── Identidad visual (logo/favicon) ── */}
      <section className="space-y-6">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-200 pb-3">
          Logo y favicon
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {(groups['logo'] ?? []).map(slotDef => (
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

      {/* ── 1. Hero ── */}
      <section className="space-y-6">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-200 pb-3">
          1. Hero
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {(groups['hero'] ?? []).map(slotDef => (
            <AssetSlot
              key={slotDef.key}
              slotDef={slotDef}
              state={slots[slotDef.key] ?? { url: null, uploading: false, error: null }}
              onUpload={file => handleUpload(slotDef.key, file)}
              onRemove={() => handleRemove(slotDef.key)}
            />
          ))}
        </div>
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-700">Texto principal de portada</h3>
            <p className="text-xs text-zinc-400 mt-0.5">Editá el título y la temporada que se muestran en el hero — usá "Guardar cambios" arriba para guardar</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Código de temporada</label>
              <input className="input text-sm font-mono" value={heroSeason} onChange={e => setHeroSeason(e.target.value)} placeholder="AW2026" />
              <p className="text-xs text-zinc-400 mt-1">Texto decorativo del hero — en axis se muestra en vertical junto al video (ej: AW2026, SS2027)</p>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Texto pequeño (sobre el título)</label>
              <input className="input text-sm" value={heroEyebrow} onChange={e => setHeroEyebrow(e.target.value)} placeholder="Opening New Season Summer 2026" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-zinc-500 mb-1">Título — Línea 1 <span className="text-zinc-400">(regular)</span></label>
              <input className="input text-sm" value={heroLine1} onChange={e => setHeroLine1(e.target.value)} placeholder="Timeless Design" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-zinc-500 mb-1">Título — Línea 2 <span className="italic">(itálica)</span></label>
              <input className="input text-sm italic" value={heroItalic} onChange={e => setHeroItalic(e.target.value)} placeholder="Beyond Trends" />
              <p className="text-xs text-zinc-400 mt-1">Frase completa del segundo renglón — se muestra en itálica</p>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-zinc-500 mb-1">Bajada (debajo del logo)</label>
              <textarea
                className="input text-sm min-h-[60px] resize-y"
                value={heroSubtitle}
                onChange={e => setHeroSubtitle(e.target.value)}
                placeholder={'Piezas únicas diseñadas para\nquienes buscan estilo y distinción.'}
              />
              <p className="text-xs text-zinc-400 mt-1">Un enter = salto de línea en el hero</p>
            </div>
            <div className="col-span-2 pt-2 border-t border-zinc-100">
              <label className="block text-xs text-zinc-500 mb-2">Color del texto sobre la foto</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={heroTextColor}
                  onChange={e => setHeroTextColor(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border border-zinc-200 p-0.5 bg-white"
                />
                <input
                  className="input text-sm font-mono w-32"
                  value={heroTextColor}
                  onChange={e => setHeroTextColor(e.target.value)}
                  placeholder="#FFFFFF"
                />
                <div className="flex gap-2">
                  {['#FFFFFF', '#1A1A1A', '#F5F0EB', '#8B7355'].map(c => (
                    <button
                      key={c}
                      onClick={() => setHeroTextColor(c)}
                      className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                      style={{ backgroundColor: c, borderColor: heroTextColor === c ? '#7C3AED' : '#E5E7EB' }}
                      title={c}
                    />
                  ))}
                </div>
                <p className="text-xs text-zinc-400">Usá blanco para fotos oscuras, negro para fotos claras</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. Galería ── */}
      <section className="space-y-6">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-200 pb-3">
          2. Galería
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {(groups['gallery'] ?? []).map(slotDef => (
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

      {/* ── 3. New Arrivals ── */}
      <section className="space-y-6">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-200 pb-3">
          3. New Arrivals
        </h2>
        <div className="bg-white rounded-xl border border-zinc-200 p-5">
          <p className="text-sm text-zinc-600">
            Esta sección se completa sola: muestra las últimas 4 fotos de portada de tus productos activos, cargados en <strong>Productos</strong>. No requiere ninguna configuración acá — para cambiar lo que se ve, editá o agregá productos.
          </p>
        </div>
      </section>

      {/* ── 4. Moodboard ── */}
      <section className="space-y-6">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-200 pb-3">
          4. Moodboard
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {(groups['moodboard'] ?? []).map(slotDef => (
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
      </>
      )}

      {/* ── Recibos PDF ── */}
      <section className="space-y-6">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-200 pb-3">
          Recibos PDF
        </h2>
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-700">Configuración de recibos PDF</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Elegí qué datos mostrar en los comprobantes de compra</p>
            </div>
            <button onClick={handleSavePdf} disabled={savingPdf} className="btn-secondary text-xs py-1.5 disabled:opacity-60">
              {savedPdf ? '✓ Guardado' : savingPdf ? 'Guardando...' : 'Guardar PDF'}
            </button>
            {errorPdf && <p className="text-xs text-red-500 mt-1.5">{errorPdf}</p>}
          </div>
          <div className="space-y-1">
            <ToggleRow label="Mostrar variante" desc="Talle, color u otros atributos en la tabla del comprobante" checked={pdfShowVariant} onChange={setPdfShowVariant} />
            <ToggleRow label="Mostrar tipo de precio" desc="Badge Minorista / Mayorista en cada ítem" checked={pdfShowPricetype} onChange={setPdfShowPricetype} />
            <ToggleRow label="Mostrar dirección" desc="Dirección del comprador y dirección de envío" checked={pdfShowAddress} onChange={setPdfShowAddress} />
            <ToggleRow label="Mostrar notas del pedido" desc="El campo de notas que ingresó el cliente" checked={pdfShowNotes} onChange={setPdfShowNotes} />
          </div>
        </div>
      </section>

    </div>
  )
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-zinc-50 last:border-0">
      <div>
        <p className="text-sm text-zinc-800">{label}</p>
        <p className="text-xs text-zinc-400 mt-0.5">{desc}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

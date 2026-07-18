'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ImageIcon, Upload, X, Loader2, Plus, Trash2, Check } from 'lucide-react'

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
  default:     MINIMALISTA_SLOTS,
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
    // Mosaico de 4 fotos (Frame 2 del diseño): 1 grande a la izquierda + 1 ancha y 2 chicas apiladas a la derecha
    { key: 'gallery_1',    label: 'Mosaico — Foto grande (izq.)', hint: '864 × 1117 px — ocupa toda la altura de la sección', aspect: '864/1117' },
    { key: 'gallery_2',    label: 'Mosaico — Foto ancha (arriba der.)', hint: '864 × 559 px', aspect: '864/559' },
    { key: 'gallery_3',    label: 'Mosaico — Foto chica 1 (abajo der.)', hint: '432 × 559 px', aspect: '432/559' },
    { key: 'gallery_4',    label: 'Mosaico — Foto chica 2 (abajo der.)', hint: '432 × 559 px', aspect: '432/559' },
    // Moodboard (Frame 4 del diseño): franja panorámica con texto + 2 fotos lado a lado
    { key: 'moodboard_banner', label: 'Moodboard — Franja superior', hint: '1728 × 200 px — franja panorámica con texto superpuesto', aspect: '1728/200' },
    { key: 'moodboard_left',   label: 'Moodboard — Foto izquierda',  hint: '860 × 573 px', aspect: '860/573' },
    { key: 'moodboard_right',  label: 'Moodboard — Foto derecha',    hint: '860 × 573 px', aspect: '860/573' },
  ],
  // Axis: mismo layout que mono (viene del mismo Figma, secciones en el mismo orden salvo el hero).
  // Único cambio real: el hero es un video en vez de una foto — hero_main acepta video acá.
  axis: [
    { key: 'logo',         label: 'Logo',              hint: 'PNG o SVG transparente — se muestra en el panel izquierdo del hero, 150 px de ancho (alto proporcional)', aspect: 'logo' },
    { key: 'logo_favicon', label: 'Favicon',           hint: 'PNG cuadrado — 512 × 512 px', aspect: '1/1' },
    { key: 'hero_main',    label: 'Hero — Video',      hint: 'Video MP4, 1117 × 1117 px aprox. (cuadrado) — también acepta una imagen si preferís no usar video', aspect: '1/1', allowVideo: true },
    // Mosaico de 4 fotos (igual que mono): 1 grande a la izquierda + 1 ancha y 2 chicas apiladas a la derecha
    { key: 'gallery_1',    label: 'Mosaico — Foto grande (izq.)', hint: '864 × 1117 px — ocupa toda la altura de la sección', aspect: '864/1117' },
    { key: 'gallery_2',    label: 'Mosaico — Foto ancha (arriba der.)', hint: '864 × 559 px', aspect: '864/559' },
    { key: 'gallery_3',    label: 'Mosaico — Foto chica 1 (abajo der.)', hint: '432 × 559 px', aspect: '432/559' },
    { key: 'gallery_4',    label: 'Mosaico — Foto chica 2 (abajo der.)', hint: '432 × 559 px', aspect: '432/559' },
    // Moodboard (igual que mono): franja panorámica con texto + 2 fotos lado a lado
    { key: 'moodboard_banner', label: 'Moodboard — Franja superior', hint: '1728 × 200 px — franja panorámica con texto superpuesto', aspect: '1728/200' },
    { key: 'moodboard_left',   label: 'Moodboard — Foto izquierda',  hint: '860 × 573 px', aspect: '860/573' },
    { key: 'moodboard_right',  label: 'Moodboard — Foto derecha',    hint: '860 × 573 px', aspect: '860/573' },
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

// Textos predeterminados legales
const DEFAULT_COOKIES = `POLÍTICA DE COOKIES

Este sitio web utiliza cookies para mejorar la experiencia del usuario.

1. QUÉ SON LAS COOKIES
Las cookies son pequeños archivos de texto que los sitios web guardan en tu dispositivo cuando los visitás.

2. QUÉ COOKIES USAMOS
- Cookies técnicas: necesarias para el funcionamiento del sitio (sesión, carrito de compras).
- Cookies de análisis: nos permiten entender cómo se usa el sitio para mejorarlo.
- Cookies de preferencias: recuerdan tus opciones (idioma, moneda, etc.).

3. CÓMO GESTIONAR LAS COOKIES
Podés configurar tu navegador para rechazar cookies, aunque esto puede afectar la funcionalidad del sitio.

4. COOKIES DE TERCEROS
Podemos utilizar servicios de terceros (Google Analytics, MercadoPago) que instalan sus propias cookies. Estos servicios tienen sus propias políticas de privacidad.

5. CONSENTIMIENTO
Al continuar usando este sitio, aceptás el uso de cookies según esta política.`

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
        className="relative overflow-hidden rounded-lg border-2 border-dashed border-zinc-200 bg-zinc-50 cursor-pointer hover:border-violet-400 hover:bg-violet-50/30 transition-colors group"
        style={slotDef.aspect === 'logo' ? { height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' } : { aspectRatio: slotDef.aspect }}
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-400">
            {state.uploading ? <Loader2 size={24} className="animate-spin text-violet-500" /> : <><ImageIcon size={24} /><span className="text-xs">{slotDef.allowVideo ? 'Subir imagen o video' : 'Subir imagen'}</span></>}
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
  const [cookies, setCookies] = useState('')

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

  const [savingName, setSavingName] = useState(false)
  const [savedName, setSavedName] = useState(false)
  const [errorName, setErrorName] = useState<string | null>(null)
  const [savingFooter, setSavingFooter] = useState(false)
  const [savedFooter, setSavedFooter] = useState(false)
  const [footerError, setFooterError] = useState<string | null>(null)
  const [savingLegal, setSavingLegal] = useState(false)
  const [savedLegal, setSavedLegal] = useState(false)
  const [errorLegal, setErrorLegal] = useState<string | null>(null)

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
          // branches debe ser siempre un array — proteger contra valores inválidos
          const rawBranches = (cfg as any).branches
          setBranches(Array.isArray(rawBranches) ? rawBranches : [])
          setTerms((cfg as any).terms_and_conditions ?? '')
          setPrivacy((cfg as any).privacy_policy ?? '')
          setCookies((cfg as any).cookies_policy ?? '')
          setHeroTextColor((cfg as any).hero_text_color ?? '#FFFFFF')
          setHeroEyebrow((cfg as any).hero_eyebrow ?? 'Nueva temporada')
          setHeroLine1((cfg as any).hero_title_line1 ?? 'Estilo que')
          // Migración: la línea 2 (itálica) ahora es el renglón 2 completo.
          // Si el tenant ya tenía texto en "línea 3" (formato viejo de 3 renglones),
          // lo fusionamos acá una sola vez.
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
        }

        const { data: assets } = await supabase.from('store_assets').select('slot, url').eq('tenant_id', userRow.tenant_id)
        const slotDefs = TEMPLATE_SLOTS[tmpl] ?? TEMPLATE_SLOTS['default']
        const initial: Record<string, SlotState> = {}
        for (const s of slotDefs) {
          const existing = assets?.find(a => a.slot === s.key)
          initial[s.key] = { url: existing?.url ?? null, uploading: false, error: null }
        }
        setSlots(initial)
      } catch (e) {
        console.error('[Personalizacion] Error al cargar:', e)
      } finally {
        setLoading(false)
      }
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
    // Cache-buster: el CDN de Supabase sirve la versión vieja si la URL no cambia.
    // Al guardar con ?t=timestamp la tienda siempre pide la imagen nueva.
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

  async function handleSaveHero() {
    if (!configId) return
    setSavingHero(true); setErrorHero(null)
    const { error } = await supabase.from('store_config').update({
      hero_eyebrow:      heroEyebrow    || null,
      hero_title_line1:  heroLine1      || null,
      hero_title_italic: heroItalic     || null,
      hero_title_line3:  null, // deprecado: ahora la línea 2 (itálica) contiene el renglón completo
      hero_subtitle:     heroSubtitle   || null,
      hero_season:       heroSeason     || null,
      hero_text_color:   heroTextColor  || null,
    }).eq('id', configId)
    setSavingHero(false)
    if (error) { setErrorHero('Error al guardar: ' + error.message); return }
    setSavedHero(true); setTimeout(() => setSavedHero(false), 2000)
  }

  async function handleSaveColors() {
    if (!configId) return
    setSavingColors(true); setErrorColors(null)
    const { error } = await supabase.from('store_config').update({
      nav_text_color:        navTextColor        || null,
      collection_text_color: collectionTextColor || null,
    }).eq('id', configId)
    setSavingColors(false)
    if (error) { setErrorColors('Error al guardar: ' + error.message); return }
    setSavedColors(true); setTimeout(() => setSavedColors(false), 2000)
  }

  async function handleSaveCollectionPosts() {
    if (!configId) return
    setSavingCollectionPosts(true); setErrorCollectionPosts(null)
    const { error } = await supabase.from('store_config').update({
      collection_posts: collectionPosts,
    }).eq('id', configId)
    setSavingCollectionPosts(false)
    if (error) { setErrorCollectionPosts('Error al guardar: ' + error.message); return }
    setSavedCollectionPosts(true); setTimeout(() => setSavedCollectionPosts(false), 2000)
  }

  async function handleSaveBlog() {
    if (!configId) return
    setSavingBlog(true); setErrorBlog(null)
    const { error } = await supabase.from('store_config').update({
      blog_heading:    blogHeading    || null,
      blog_subheading: blogSubheading || null,
      blog_posts:      blogPosts,
    }).eq('id', configId)
    setSavingBlog(false)
    if (error) { setErrorBlog('Error al guardar: ' + error.message); return }
    setSavedBlog(true); setTimeout(() => setSavedBlog(false), 2000)
  }

  async function handleSaveNewsletter() {
    if (!configId) return
    setSavingNewsletter(true); setErrorNewsletter(null)
    const { error } = await supabase.from('store_config').update({
      newsletter_bg_color: newsletterBgColor || null,
    }).eq('id', configId)
    setSavingNewsletter(false)
    if (error) { setErrorNewsletter('Error al guardar: ' + error.message); return }
    setSavedNewsletter(true); setTimeout(() => setSavedNewsletter(false), 2000)
  }

  async function handleSaveName() {
    if (!tenantId) return
    setSavingName(true); setErrorName(null)
    const { error } = await supabase.from('tenants').update({ name: storeName.trim() }).eq('id', tenantId)
    setSavingName(false)
    if (error) { setErrorName('Error al guardar: ' + error.message); return }
    setSavedName(true); setTimeout(() => setSavedName(false), 2000)
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
    setSavingLegal(true); setErrorLegal(null)
    const { error } = await supabase.from('store_config').update({
      terms_and_conditions: terms || null,
      privacy_policy: privacy || null,
      cookies_policy: cookies || null,
    }).eq('id', configId)
    setSavingLegal(false)
    if (error) { setErrorLegal('Error al guardar: ' + error.message); return }
    setSavedLegal(true); setTimeout(() => setSavedLegal(false), 2000)
  }

  const slotDefs = TEMPLATE_SLOTS[template] ?? TEMPLATE_SLOTS['default']
  const groups: Record<string, typeof slotDefs> = {}
  for (const s of slotDefs) {
    const prefix = s.key.split('_')[0]
    if (!groups[prefix]) groups[prefix] = []
    groups[prefix].push(s)
  }
  // Los templates mono y axis tienen una estructura de home distinta (sin colecciones/blog/newsletter),
  // así que el panel se ordena por sector de la tienda en vez de por tipo de campo. Axis reusa el mismo
  // layout que mono (viene del mismo Figma con hero video en vez de imagen estática).
  const isMono = template === 'mono' || template === 'axis'

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

      {isMono && (
        <div className="sticky top-0 z-20 -mx-8 px-8 py-3 bg-white/95 backdrop-blur border-b border-zinc-200 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-zinc-700">Guardar cambios</p>
            <p className="text-xs text-zinc-400">Las imágenes se suben y guardan solas. Este botón guarda los textos (Hero).</p>
          </div>
          <div className="flex items-center gap-3">
            {errorHero && <p className="text-xs text-red-500">{errorHero}</p>}
            <button onClick={handleSaveHero} disabled={savingHero} className="btn-secondary text-xs py-1.5 px-4 disabled:opacity-60">
              {savedHero ? '✓ Guardado' : savingHero ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      )}

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

      {/* ── Textos del Hero ── */}
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
                className={`text-xs px-3 py-2 rounded-lg border ${collectionTextColor === '' ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-zinc-200 text-zinc-500'}`}
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

      {isMono && (
      <>
      {/* ── Identidad ── */}
      <section className="space-y-6">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-200 pb-3">
          Identidad
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
              <p className="text-xs text-zinc-400 mt-1">Aparece como texto decorativo en el fondo (ej: AW2026, SS2027)</p>
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
            {errorName && <p className="text-xs text-red-500 mt-1.5">{errorName}</p>}
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
            {errorLegal && <p className="text-xs text-red-500 mt-1.5">{errorLegal}</p>}
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
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-zinc-600">Política de cookies</label>
                {!cookies && (
                  <button onClick={() => setCookies(DEFAULT_COOKIES)} className="text-xs text-violet-600 hover:text-violet-700">
                    Usar texto predeterminado
                  </button>
                )}
              </div>
              <textarea
                className="input min-h-[160px] font-mono text-xs leading-relaxed resize-y"
                value={cookies}
                onChange={e => setCookies(e.target.value)}
                placeholder="Política de cookies de tu tienda..."
              />
            </div>
          </div>
        </div>

         </section>

    </div>
  )
}

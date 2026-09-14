'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTutorial, type TutorialStep } from '@/components/tutorial/TutorialProvider'
import TutorialHint from '@/components/tutorial/TutorialHint'
import PageTutorialButton from '@/components/tutorial/PageTutorialButton'
import { ExternalLink } from 'lucide-react'

const PIXEL_ID_RE = /^\d{6,20}$/

const META_STEPS: TutorialStep[] = [
  {
    id: 'meta-catalog',
    target: '[data-tutorial="meta-catalog"]',
    title: 'Catálogo de Meta',
    content: 'Esta URL siempre tiene tus productos actualizados. Pegala una sola vez en Commerce Manager y Meta la vuelve a buscar sola.',
  },
  {
    id: 'meta-pixel',
    target: '[data-tutorial="meta-pixel"]',
    title: 'Meta Pixel',
    content: 'Pegá acá el ID de tu Pixel para que tu tienda empiece a mandarle eventos (visitas, agregados al carrito, compras) a Meta.',
  },
]

function CopyableUrl({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 min-w-0 truncate rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-mono text-zinc-700">
        {value}
      </code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        className="btn-primary text-xs px-3 py-2 flex-shrink-0"
      >
        {copied ? '✓ Copiado' : 'Copiar'}
      </button>
    </div>
  )
}

export default function MetaSettingsPage() {
  const supabase = createClient()
  const { registerSteps } = useTutorial()

  useEffect(() => {
    registerSteps('meta', META_STEPS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [configId, setConfigId] = useState<string | null>(null)
  const [domain, setDomain] = useState<string | null>(null)
  const [pixelId, setPixelId] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: _userRows } = await supabase.from('users').select('tenant_id').eq('id', user.id).limit(1)
      const userRow = _userRows?.[0]
      if (!userRow) return

      const [{ data: tenant }, { data: config }] = await Promise.all([
        supabase.from('tenants').select('domain').eq('id', userRow.tenant_id).single(),
        supabase.from('store_config').select('id, meta_pixel_id').eq('tenant_id', userRow.tenant_id).single(),
      ])

      if (tenant?.domain) setDomain(tenant.domain)
      if (config) {
        setConfigId(config.id)
        setPixelId((config as any).meta_pixel_id ?? '')
      }
    }
    load()
  }, [])

  async function handleSave() {
    if (!configId) return
    const trimmed = pixelId.trim()
    if (trimmed && !PIXEL_ID_RE.test(trimmed)) {
      setErrorGeneral('El ID del Pixel no tiene un formato válido. Es una cadena de solo números (ejemplo: 1234567890123).')
      return
    }
    setSaving(true)
    setErrorGeneral(null)
    const { error } = await supabase.from('store_config').update({
      meta_pixel_id: trimmed || null,
    }).eq('id', configId)
    setSaving(false)
    if (error) {
      console.error('Error guardando Meta Pixel:', error)
      setErrorGeneral(error.message || 'No se pudo guardar. Reintentá o contactá a soporte.')
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const feedUrl = domain ? `https://${domain}/feed/meta-catalog.csv` : null

  return (
    <div>
      <div className="sticky top-0 z-10 px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Meta (Facebook/Instagram)</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Conectá tu catálogo de productos y tu Pixel con Meta Business Suite</p>
          <PageTutorialButton pageKey="meta" />
        </div>
        <div className="flex flex-col items-end gap-1">
          <button onClick={handleSave} disabled={saving || !configId} className="btn-primary disabled:opacity-60">
            {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
          {errorGeneral && <p className="text-xs text-red-600 max-w-xs text-right">{errorGeneral}</p>}
        </div>
      </div>

      <div className="px-8 py-6 max-w-2xl space-y-5">

        {/* Catálogo de Meta */}
        <div data-tutorial="meta-catalog" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold text-zinc-700">Catálogo de Meta</h2>
            <TutorialHint pageKey="meta" step={META_STEPS[0]} />
          </div>

          <p className="text-xs text-zinc-500 leading-relaxed">
            El Catálogo es la lista de productos que Meta usa para anuncios dinámicos, retargeting y la sección de Shop en Facebook/Instagram
            (por ejemplo: cuando alguien mira un producto en tu tienda y después le aparece ese mismo producto en un anuncio). Es un origen
            de datos aparte del Pixel — el Pixel avisa qué hizo cada visitante, el Catálogo le da a Meta el detalle de cada producto
            (nombre, precio, imagen, si hay stock) para armar esos anuncios.
          </p>

          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">URL del feed de tu catálogo</label>
            {feedUrl ? (
              <CopyableUrl value={feedUrl} />
            ) : (
              <p className="text-xs text-zinc-400">Configurá primero un dominio para tu tienda en Dominio.</p>
            )}
            <p className="text-xs text-zinc-400 mt-1.5">
              Esta URL siempre refleja tus productos actuales en tiempo real — no hay que volver a exportar ni subir nada a mano cuando cambian precios,
              stock o productos.
            </p>
          </div>

          <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-4 space-y-2">
            <p className="text-xs font-medium text-zinc-600">Cómo conectarlo (una sola vez)</p>
            <ol className="text-xs text-zinc-500 space-y-1.5 list-decimal list-inside">
              <li>
                Entrá a{' '}
                <a
                  href="https://business.facebook.com/commerce"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline inline-flex items-center gap-0.5"
                >
                  Commerce Manager <ExternalLink className="h-3 w-3" />
                </a>{' '}
                con la cuenta de Meta Business de la tienda y creá (o abrí) tu catálogo.
              </li>
              <li>Andá a Catálogo → Orígenes de datos → Agregar productos → "Feed de datos".</li>
              <li>Pegá la URL de arriba.</li>
              <li>Elegí una frecuencia de actualización (diaria es suficiente) y confirmá.</li>
            </ol>
            <p className="text-xs text-zinc-400 pt-1">
              Si tu tienda venía de otra plataforma y ya tenía un catálogo conectado ahí, reemplazá ese origen de datos viejo por este —
              si lo dejás como estaba, va a seguir mostrando productos con links e IDs viejos que ya no existen ("productos fantasma").
            </p>
          </div>
        </div>

        {/* Meta Pixel */}
        <div data-tutorial="meta-pixel" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold text-zinc-700">Meta Pixel</h2>
            <TutorialHint pageKey="meta" step={META_STEPS[1]} />
          </div>

          <p className="text-xs text-zinc-500 leading-relaxed">
            El Pixel es un código que corre en tu tienda pública y le avisa a Meta lo que hacen tus visitantes: qué producto vieron,
            qué agregaron al carrito, si iniciaron o completaron una compra. Con esos datos Meta mide qué tan bien funcionan tus anuncios
            y arma audiencias de retargeting (por eso alguien que miró un producto tuyo después lo ve en un anuncio).
          </p>

          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">ID del Pixel</label>
            <input
              className="input text-sm font-mono"
              value={pixelId}
              onChange={e => setPixelId(e.target.value)}
              placeholder="1234567890123"
            />
            <p className="text-xs text-zinc-400 mt-1">
              Dejalo vacío para desactivar el Pixel en tu tienda pública.
            </p>
          </div>

          <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-4 space-y-2">
            <p className="text-xs font-medium text-zinc-600">Cómo conseguirlo</p>
            <ol className="text-xs text-zinc-500 space-y-1.5 list-decimal list-inside">
              <li>
                Entrá a{' '}
                <a
                  href="https://business.facebook.com/events_manager2"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline inline-flex items-center gap-0.5"
                >
                  Events Manager <ExternalLink className="h-3 w-3" />
                </a>{' '}
                con la cuenta de Meta Business de la tienda.
              </li>
              <li>Conectar orígenes de datos → Web → Meta Pixel → creá uno nuevo (o elegí el que ya tengan).</li>
              <li>Copiá el ID del Pixel (es solo números) y pegalo arriba.</li>
              <li>Guardá los cambios acá arriba — no hace falta pegar ningún código, la tienda ya sabe usarlo.</li>
            </ol>
          </div>
        </div>

      </div>
    </div>
  )
}

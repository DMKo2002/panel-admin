'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const TITLE_MAX = 70
const DESCRIPTION_MAX = 160

export default function SeoPage() {
  const supabase = createClient()
  const [configId, setConfigId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)

  const [storeName, setStoreName] = useState('Tienda')
  const [storeUrl, setStoreUrl] = useState('tutienda.gounuri.com')
  const [seoTitle, setSeoTitle] = useState('')
  const [seoDescription, setSeoDescription] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: _userRows } = await supabase.from('users').select('tenant_id').eq('id', user.id).limit(1)
      const userRow = _userRows?.[0]
      if (!userRow) return

      const [{ data: tenant }, { data: config }] = await Promise.all([
        supabase.from('tenants').select('name, slug, domain').eq('id', userRow.tenant_id).single(),
        supabase.from('store_config').select('id, seo_title, seo_description').eq('tenant_id', userRow.tenant_id).single(),
      ])

      if (tenant) {
        setStoreName(tenant.name ?? 'Tienda')
        setStoreUrl(tenant.domain || `${tenant.slug}.gounuri.com`)
      }
      if (config) {
        setConfigId(config.id)
        setSeoTitle((config as any).seo_title ?? '')
        setSeoDescription((config as any).seo_description ?? '')
      }
    }
    load()
  }, [])

  async function handleSave() {
    if (!configId) return
    setSaving(true)
    setErrorGeneral(null)
    const { error } = await supabase.from('store_config').update({
      seo_title: seoTitle.trim() || null,
      seo_description: seoDescription.trim() || null,
    }).eq('id', configId)
    setSaving(false)
    if (error) {
      console.error('Error guardando SEO:', error)
      setErrorGeneral(error.message || 'No se pudo guardar. Reintentá o contactá a soporte.')
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const previewTitle = seoTitle.trim() || storeName
  const previewDescription = seoDescription.trim() || 'Descubrí nuestros productos y comprá online.'

  return (
    <div>
      <div className="sticky top-0 z-10 px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">SEO</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Así aparece tu tienda cuando alguien te busca en Google</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button onClick={handleSave} disabled={saving || !configId} className="btn-primary disabled:opacity-60">
            {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
          {errorGeneral && <p className="text-xs text-red-600">{errorGeneral}</p>}
        </div>
      </div>

      <div className="px-8 py-6 max-w-2xl space-y-5">

        {/* Preview estilo resultado de Google */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5">
          <h2 className="text-sm font-semibold text-zinc-700 mb-3">Vista previa en Google</h2>
          <div className="border border-zinc-100 rounded-lg p-4 bg-zinc-50/50">
            <p className="text-xs text-zinc-500 truncate">{storeUrl}</p>
            <p className="text-[#1a0dab] text-lg leading-snug truncate mt-0.5">{previewTitle}</p>
            <p className="text-sm text-zinc-600 mt-1 line-clamp-2">{previewDescription}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-700">Título y descripción</h2>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-zinc-600">Título SEO</label>
              <span className={`text-[10px] ${seoTitle.length > TITLE_MAX ? 'text-red-500' : 'text-zinc-400'}`}>
                {seoTitle.length}/{TITLE_MAX}
              </span>
            </div>
            <input
              className="input text-sm"
              value={seoTitle}
              onChange={e => setSeoTitle(e.target.value)}
              placeholder={storeName}
              maxLength={TITLE_MAX}
            />
            <p className="text-xs text-zinc-400 mt-1">Si lo dejás vacío, se usa el nombre de tu tienda ({storeName}).</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-zinc-600">Descripción SEO</label>
              <span className={`text-[10px] ${seoDescription.length > DESCRIPTION_MAX ? 'text-red-500' : 'text-zinc-400'}`}>
                {seoDescription.length}/{DESCRIPTION_MAX}
              </span>
            </div>
            <textarea
              className="input text-sm min-h-[80px]"
              value={seoDescription}
              onChange={e => setSeoDescription(e.target.value)}
              placeholder="Contá en una frase qué vendés y qué te hace diferente."
              maxLength={DESCRIPTION_MAX}
            />
            <p className="text-xs text-zinc-400 mt-1">
              También se usa como bajada cuando compartís el link de tu tienda por WhatsApp o redes.
            </p>
          </div>
        </div>

        <p className="text-xs text-zinc-400">
          Estos textos son solo para la home de tu tienda. Cada producto arma su propia ficha automáticamente
          a partir de su nombre y descripción.
        </p>
      </div>
    </div>
  )
}

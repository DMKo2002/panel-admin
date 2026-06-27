'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Upload, ArrowLeft, X, Star } from 'lucide-react'
import Link from 'next/link'
import VariantMatrix, { VariantMatrixHandle } from '@/components/VariantMatrix'

// ── Attr config ───────────────────────────────────────────────────────────────
interface AttrConfig { key: string; label: string; type: 'text' | 'select' | 'color'; options?: string[] }
const SIZE_KEYS = ['talle', 'numero', 'talla', 'size']

// ── Image resize: center-crop to 2:3, resize to 600×900, compress to ≤150KB ─
async function resizeImageTo600x900(file: File): Promise<File> {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      canvas.width = 600; canvas.height = 900
      const ctx = canvas.getContext('2d')!
      const ratio = 2 / 3
      const sr = img.width / img.height
      let sx: number, sy: number, sw: number, sh: number
      if (sr > ratio) { sh = img.height; sw = sh * ratio; sx = (img.width - sw) / 2; sy = 0 }
      else { sw = img.width; sh = sw / ratio; sx = 0; sy = (img.height - sh) / 2 }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 600, 900)
      const tryCompress = (q: number) => {
        canvas.toBlob(blob => {
          if (!blob) { resolve(file); return }
          if (blob.size <= 150 * 1024 || q <= 0.3)
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
          else tryCompress(q - 0.1)
        }, 'image/jpeg', q)
      }
      tryCompress(0.85)
    }
    img.onerror = () => resolve(file)
    img.src = url
  })
}

function slugify(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export default function NuevoProductoPage() {
  const router = useRouter()
  const supabase = createClient()
  const matrixRef = useRef<VariantMatrixHandle>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [categories, setCategories] = useState<{ id: string; name: string; parent_id: string | null }[]>([])
  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [description, setDescription] = useState('')
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])

  // Custom tenant attributes (non-size, non-color) to show below the matrix
  const [extraAttrs, setExtraAttrs] = useState<AttrConfig[]>([])
  const [extraAttrValues, setExtraAttrValues] = useState<Record<string, string>>({})
  const [initialSizes, setInitialSizes] = useState<string[] | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      if (!userRow) return
      setTenantId(userRow.tenant_id)
      const [{ data: cats }, { data: configData }] = await Promise.all([
        supabase.from('categories').select('id, name, parent_id').eq('tenant_id', userRow.tenant_id).eq('active', true).order('sort_order'),
        supabase.from('store_config').select('variant_attributes').eq('tenant_id', userRow.tenant_id).single(),
      ])
      setCategories(cats ?? [])

      // Extra attrs = any attrs that aren't size or color
      const allAttrs: AttrConfig[] = configData?.variant_attributes ?? []
      const extra = allAttrs.filter(a => a.key !== 'color' && !SIZE_KEYS.includes(a.key))
      setExtraAttrs(extra)

      // Sizes from tenant config
      const sizeAttr = allAttrs.find(a => SIZE_KEYS.includes(a.key))
      const sizes = sizeAttr?.options?.length ? sizeAttr.options : ['XS', 'S', 'M', 'L', 'XL']
      setInitialSizes(sizes)
    }
    load()
  }, [])

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    const resized = await Promise.all(files.map(resizeImageTo600x900))
    setImageFiles(prev => [...prev, ...resized])
    setImagePreviews(prev => [...prev, ...resized.map(f => URL.createObjectURL(f))])
    e.target.value = ''
  }

  async function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (!files.length) return
    const resized = await Promise.all(files.map(resizeImageTo600x900))
    setImageFiles(prev => [...prev, ...resized])
    setImagePreviews(prev => [...prev, ...resized.map(f => URL.createObjectURL(f))])
  }

  function removeImage(idx: number) {
    setImageFiles(prev => prev.filter((_, i) => i !== idx))
    setImagePreviews(prev => prev.filter((_, i) => i !== idx))
  }

  function moveImageToFront(idx: number) {
    if (idx === 0) return
    setImageFiles(prev => { const a = [...prev]; const [item] = a.splice(idx, 1); a.unshift(item); return a })
    setImagePreviews(prev => { const a = [...prev]; const [item] = a.splice(idx, 1); a.unshift(item); return a })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('El nombre es obligatorio'); return }
    if (!tenantId) { setError('No se pudo determinar el tenant'); return }

    setLoading(true); setError(null)
    try {
      // Crear producto
      const slug = slugify(name) + '-' + Date.now()
      const { data: product, error: productError } = await supabase
        .from('products')
        .insert({ tenant_id: tenantId, name: name.trim(), sku: sku.trim() || null, slug, description: description.trim() || null, active: true, category_id: categoryId || null })
        .select().single()
      if (productError) throw productError

      // Subir imágenes
      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i]
        const path = `${tenantId}/${product.id}/${Date.now()}-${i}.jpg`
        const { data: up } = await supabase.storage.from('product-images').upload(path, file, { upsert: true, contentType: 'image/jpeg' })
        if (up) {
          const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path)
          const { error: imgErr } = await supabase.from('product_images').insert({ product_id: product.id, url: publicUrl, sort_order: i, is_cover: i === 0 })
          if (imgErr) throw imgErr
        }
      }

      // Guardar variantes desde la matriz (extra attrs se agregan al JSONB attributes de cada variante)
      const variantsFromMatrix = matrixRef.current?.getVariants() ?? []
      for (const v of variantsFromMatrix) {
        const attrs = { ...v.attrs, ...extraAttrValues }
        const { data: variant, error: varErr } = await supabase
          .from('variants')
          .insert({ product_id: product.id, size: v.size, color: v.color, sku: null, stock: v.stock, attributes: attrs })
          .select().single()
        if (varErr) throw varErr

        if (variant) {
          const rules: any[] = []
          if (v.retailPrice > 0) rules.push({ variant_id: variant.id, type: 'retail', min_qty: 1, price: v.retailPrice, compare_at_price: v.retailCompareAt > 0 ? v.retailCompareAt : null, active: true })
          if (v.wholesalePrice > 0) rules.push({ variant_id: variant.id, type: 'wholesale', min_qty: v.wholesaleMinQty || 6, price: v.wholesalePrice, compare_at_price: v.wholesaleCompareAt > 0 ? v.wholesaleCompareAt : null, active: true })
          if (rules.length > 0) { const { error: rErr } = await supabase.from('price_rules').insert(rules); if (rErr) throw rErr }
        }
      }

      router.push('/dashboard/productos')
      router.refresh()
    } catch (err: any) {
      setError(err.message ?? 'Error al guardar el producto')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="px-8 py-6 border-b border-zinc-200 bg-white flex items-center gap-4">
        <Link href="/dashboard/productos" className="text-zinc-400 hover:text-zinc-600 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-semibold text-zinc-900">Nuevo producto</h1>
      </div>

      <form onSubmit={handleSubmit} className="px-8 py-6 max-w-4xl space-y-6">

        {/* Datos básicos */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-700">Información básica</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">Nombre *</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Campera de cuero negra" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">SKU / Código</label>
              <input className="input" value={sku} onChange={e => setSku(e.target.value)} placeholder="Ej: CAM-001" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Descripción</label>
            <textarea className="input resize-none" rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción del producto..." />
          </div>
          {categories.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Categoría</label>
              <select className="input" value={categoryId ?? ''} onChange={e => setCategoryId(e.target.value || null)}>
                <option value="">Sin categoría</option>
                {categories.filter(c => !c.parent_id).map(parent => {
                  const subs = categories.filter(c => c.parent_id === parent.id)
                  return subs.length > 0 ? (
                    <optgroup key={parent.id} label={parent.name}>
                      <option value={parent.id}>{parent.name} (general)</option>
                      {subs.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
                    </optgroup>
                  ) : <option key={parent.id} value={parent.id}>{parent.name}</option>
                })}
              </select>
            </div>
          )}
        </div>

        {/* Imágenes */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-700">Imágenes</h2>
          <label
            className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${isDragging ? 'border-violet-500 bg-violet-50' : 'border-zinc-200 hover:border-violet-300 hover:bg-violet-50'}`}
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <Upload size={20} className="text-zinc-400 mb-1" />
            <span className="text-sm text-zinc-500">{isDragging ? 'Soltá las imágenes acá' : 'Arrastrá o hacé click para subir fotos'}</span>
            <span className="text-xs text-zinc-400 mt-0.5">Se redimensionan automáticamente a 600×900</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageChange} />
          </label>
          {imagePreviews.length > 0 && (
            <div>
              <p className="text-xs text-zinc-400 mb-2">Click en ★ para establecer como portada. La primera imagen es la portada.</p>
              <div className="flex gap-2 flex-wrap">
                {imagePreviews.map((src, i) => (
                  <div key={i} className="relative group">
                    <img src={src} className={`w-20 h-20 object-cover rounded-lg border-2 ${i === 0 ? 'border-violet-500' : 'border-zinc-200'}`} />
                    {i === 0
                      ? <span className="absolute bottom-0 left-0 right-0 text-[10px] text-center bg-violet-600 text-white rounded-b-lg py-0.5">Portada</span>
                      : <button type="button" onClick={() => moveImageToFront(i)} title="Establecer como portada"
                          className="absolute top-1 left-1 w-5 h-5 bg-white/80 rounded-full text-zinc-400 hover:text-violet-600 hover:bg-white items-center justify-center hidden group-hover:flex shadow-sm">
                          <Star size={11} />
                        </button>
                    }
                    <button type="button" onClick={() => removeImage(i)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs items-center justify-center hidden group-hover:flex shadow-sm">
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Variantes */}
        {initialSizes && <VariantMatrix ref={matrixRef} mode="create" initialSizes={initialSizes} />}

        {/* Atributos extra del tenant */}
        {extraAttrs.length > 0 && (
          <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-zinc-700">Atributos adicionales</h2>
            <div className="grid grid-cols-2 gap-4">
              {extraAttrs.map(attr => (
                <div key={attr.key}>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">{attr.label}</label>
                  {attr.type === 'select' && attr.options ? (
                    <select className="input" value={extraAttrValues[attr.key] ?? ''} onChange={e => setExtraAttrValues(prev => ({ ...prev, [attr.key]: e.target.value }))}>
                      <option value="">&#8212; Seleccionar &#8212;</option>
                      {attr.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : (
                    <input className="input" value={extraAttrValues[attr.key] ?? ''} onChange={e => setExtraAttrValues(prev => ({ ...prev, [attr.key]: e.target.value }))} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-3 pb-8">
          <Link href="/dashboard/productos" className="btn-secondary">Cancelar</Link>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Guardando...' : 'Crear producto'}
          </button>
        </div>
      </form>
    </div>
  )
}

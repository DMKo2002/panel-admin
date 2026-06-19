'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Trash2, Upload, Star, X, ExternalLink } from 'lucide-react'
import VariantMatrix, { VariantMatrixHandle, CellData, cellKey } from '@/components/VariantMatrix'

// ── Attr config ───────────────────────────────────────────────────────────────
interface AttrConfig { key: string; label: string; type: 'text' | 'select' | 'color'; options?: string[] }
const SIZE_KEYS = ['talle', 'numero', 'talla', 'size']

// ── Image resize ──────────────────────────────────────────────────────────────
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
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function EditarProductoPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()
  const matrixRef = useRef<VariantMatrixHandle>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [productSlug, setProductSlug] = useState<string>('')

  // Basic product fields
  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [description, setDescription] = useState('')
  const [active, setActive] = useState(true)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [categories, setCategories] = useState<{ id: string; name: string; parent_id: string | null }[]>([])
  const [images, setImages] = useState<{ id: string; url: string; is_cover: boolean }[]>([])
  const [newImageFiles, setNewImageFiles] = useState<File[]>([])
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([])

  // Extra tenant attrs (non-size, non-color)
  const [extraAttrs, setExtraAttrs] = useState<AttrConfig[]>([])
  const [extraAttrValues, setExtraAttrValues] = useState<Record<string, string>>({})

  // Matrix initial state
  const [matrixInitialSizes, setMatrixInitialSizes] = useState<string[]>([])
  const [matrixInitialColors, setMatrixInitialColors] = useState<string[]>([])
  const [matrixInitialCells, setMatrixInitialCells] = useState<Record<string, CellData>>({})
  const [matrixReady, setMatrixReady] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: product }, { data: { user } }] = await Promise.all([
        supabase.from('products').select('*, product_images(*), variants(*, price_rules(*))').eq('id', id).single(),
        supabase.auth.getUser(),
      ])
      if (!product) { router.push('/dashboard/productos'); return }

      setName(product.name)
      setSku(product.sku ?? '')
      setDescription(product.description ?? '')
      setActive(product.active ?? true)
      setCategoryId(product.category_id ?? null)
      setProductSlug(product.slug ?? '')
      setImages((product.product_images ?? []).sort((a: any, b: any) => {
        if (a.is_cover) return -1
        if (b.is_cover) return 1
        return (a.sort_order ?? 0) - (b.sort_order ?? 0)
      }))

      if (user) {
        const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
        if (userRow) {
          setTenantId(userRow.tenant_id)
          const [{ data: cats }, { data: configData }] = await Promise.all([
            supabase.from('categories').select('id, name, parent_id').eq('tenant_id', userRow.tenant_id).eq('active', true).order('sort_order'),
            supabase.from('store_config').select('variant_attributes').eq('tenant_id', userRow.tenant_id).single(),
          ])
          setCategories(cats ?? [])

          // Extra attrs (non-size, non-color)
          const allAttrs: AttrConfig[] = configData?.variant_attributes ?? []
          const extra = allAttrs.filter(a => a.key !== 'color' && !SIZE_KEYS.includes(a.key))
          setExtraAttrs(extra)

          // Load existing extra attr values from the first variant's attributes JSONB
          const firstVariant = (product.variants ?? [])[0]
          if (firstVariant?.attributes) {
            const vals: Record<string, string> = {}
            for (const attr of extra) {
              if (firstVariant.attributes[attr.key]) vals[attr.key] = firstVariant.attributes[attr.key]
            }
            setExtraAttrValues(vals)
          }
        }
      }

      // Build matrix from existing variants
      const dbVariants: any[] = product.variants ?? []
      const sizes = [...new Set(dbVariants.map((v: any) => v.size ?? '').filter(Boolean))]
      const colors = [...new Set(dbVariants.map((v: any) => v.color ?? '').filter(Boolean))]
      if (sizes.length === 0) sizes.push('')
      if (colors.length === 0) colors.push('')

      const cells: Record<string, CellData> = {}
      for (const v of dbVariants) {
        const s = v.size ?? ''
        const c = v.color ?? ''
        const retail = v.price_rules?.find((p: any) => p.type === 'retail')
        const wholesale = v.price_rules?.find((p: any) => p.type === 'wholesale')
        cells[cellKey(s, c)] = {
          variantId: v.id,
          stock: v.stock ?? 0,
          retailPrice: Math.round(retail?.price ?? 0),
          retailCompareAt: Math.round(retail?.compare_at_price ?? 0),
          wholesalePrice: Math.round(wholesale?.price ?? 0),
          wholesaleMinQty: wholesale?.min_qty ?? 6,
        }
      }

      setMatrixInitialSizes(sizes)
      setMatrixInitialColors(colors)
      setMatrixInitialCells(cells)
      setMatrixReady(true)
      setLoading(false)
    }
    load()
  }, [id])

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    const resized = await Promise.all(files.map(resizeImageTo600x900))
    setNewImageFiles(prev => [...prev, ...resized])
    setNewImagePreviews(prev => [...prev, ...resized.map(f => URL.createObjectURL(f))])
    e.target.value = ''
  }

  function removeNewImage(idx: number) {
    setNewImageFiles(prev => prev.filter((_, i) => i !== idx))
    setNewImagePreviews(prev => prev.filter((_, i) => i !== idx))
  }

  async function removeExistingImage(imgId: string) {
    await supabase.from('product_images').delete().eq('id', imgId)
    setImages(prev => prev.filter(i => i.id !== imgId))
  }

  async function setCoverImage(imgId: string) {
    // Set all to false, then set this one to true
    const ids = images.map(i => i.id)
    for (const id2 of ids) {
      await supabase.from('product_images').update({ is_cover: id2 === imgId }).eq('id', id2)
    }
    setImages(prev => prev.map(i => ({ ...i, is_cover: i.id === imgId })))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError(null)
    try {
      // Actualizar producto
      const { error: prodErr } = await supabase.from('products').update({
        name: name.trim(),
        sku: sku.trim() || null,
        slug: slugify(name) + '-' + id.slice(0, 6),
        description: description.trim() || null,
        active,
        category_id: categoryId || null,
      }).eq('id', id)
      if (prodErr) throw prodErr

      // Subir nuevas imágenes
      for (let i = 0; i < newImageFiles.length; i++) {
        const file = newImageFiles[i]
        const path = `${tenantId}/${id}/${Date.now()}-${i}.jpg`
        const { data: up } = await supabase.storage.from('product-images').upload(path, file, { upsert: true, contentType: 'image/jpeg' })
        if (up) {
          const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path)
          const { error: imgErr } = await supabase.from('product_images').insert({
            product_id: id, url: publicUrl, sort_order: images.length + i, is_cover: images.length === 0 && i === 0,
          })
          if (imgErr) throw imgErr
        }
      }

      // Guardar variantes desde la matriz
      const variantsFromMatrix = matrixRef.current?.getVariants() ?? []
      for (const v of variantsFromMatrix) {
        const attrs = { ...(v.attrs ?? {}), ...extraAttrValues }
        const rules: any[] = []

        if (v.id) {
          const { error: varErr } = await supabase.from('variants').update({
            size: v.size, color: v.color, stock: v.stock, attributes: attrs,
          }).eq('id', v.id)
          if (varErr) throw varErr
          await supabase.from('price_rules').delete().eq('variant_id', v.id)
          if (v.retailPrice > 0) rules.push({ variant_id: v.id, type: 'retail', min_qty: 1, price: v.retailPrice, compare_at_price: v.retailCompareAt > 0 ? v.retailCompareAt : null, active: true })
          if (v.wholesalePrice > 0) rules.push({ variant_id: v.id, type: 'wholesale', min_qty: v.wholesaleMinQty || 6, price: v.wholesalePrice, active: true })
          if (rules.length > 0) { const { error: rErr } = await supabase.from('price_rules').insert(rules); if (rErr) throw rErr }
        } else {
          const { data: nv, error: nvErr } = await supabase.from('variants')
            .insert({ product_id: id, size: v.size, color: v.color, stock: v.stock, attributes: attrs })
            .select().single()
          if (nvErr) throw nvErr
          if (nv) {
            if (v.retailPrice > 0) rules.push({ variant_id: nv.id, type: 'retail', min_qty: 1, price: v.retailPrice, compare_at_price: v.retailCompareAt > 0 ? v.retailCompareAt : null, active: true })
            if (v.wholesalePrice > 0) rules.push({ variant_id: nv.id, type: 'wholesale', min_qty: v.wholesaleMinQty || 6, price: v.wholesalePrice, active: true })
            if (rules.length > 0) { const { error: rErr } = await supabase.from('price_rules').insert(rules); if (rErr) throw rErr }
          }
        }
      }

      setNewImageFiles([])
      setNewImagePreviews([])
      router.push('/dashboard/productos')
      router.refresh()
    } catch (err: any) {
      setError(err.message ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      // Cascade delete: price_rules → variants → product_images → product
      const { data: variantRows } = await supabase.from('variants').select('id').eq('product_id', id)
      const variantIds = (variantRows ?? []).map((v: any) => v.id)
      if (variantIds.length > 0) {
        await supabase.from('price_rules').delete().in('variant_id', variantIds)
        await supabase.from('variants').delete().in('id', variantIds)
      }
      await supabase.from('product_images').delete().eq('product_id', id)
      await supabase.from('products').delete().eq('id', id)
      router.push('/dashboard/productos')
      router.refresh()
    } catch (err: any) { setError(err.message); setDeleting(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-zinc-400 text-sm">Cargando producto...</p>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/productos" className="text-zinc-400 hover:text-zinc-600 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">Editar producto</h1>
            {productSlug && (
              <a
                href={`/tienda/${productSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-violet-500 hover:text-violet-700 flex items-center gap-1 mt-0.5"
              >
                Ver en tienda <ExternalLink size={10} />
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setConfirmDelete(true)} className="btn-secondary text-red-500 hover:text-red-600 hover:border-red-200">
            <Trash2 size={15} /> Eliminar
          </button>
          <button form="edit-form" type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {/* Modal de borrado */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-zinc-200 p-6 max-w-sm w-full mx-4 shadow-xl">
            <h2 className="text-base font-semibold text-zinc-900 mb-2">¿Eliminar producto?</h2>
            <p className="text-sm text-zinc-500 mb-5">Se van a eliminar el producto, todas sus variantes, precios e imágenes. Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button onClick={handleDelete} disabled={deleting} className="flex-1 btn-primary bg-red-500 hover:bg-red-600 justify-center disabled:opacity-60">
                {deleting ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="flex-1 btn-secondary justify-center">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <form id="edit-form" onSubmit={handleSave} className="px-8 py-6 max-w-4xl space-y-6">

        {/* Datos básicos */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-700">Información básica</h2>
            <label className="flex items-center gap-2 text-sm text-zinc-500 cursor-pointer">
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="rounded" />
              Producto activo
            </label>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">Nombre *</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">SKU / Código</label>
              <input className="input" value={sku} onChange={e => setSku(e.target.value)} placeholder="Ej: CAM-001" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Descripción</label>
            <textarea className="input resize-none" rows={3} value={description} onChange={e => setDescription(e.target.value)} />
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
                      {subs.map(sub => {
                        const subSubs = categories.filter(c => c.parent_id === sub.id)
                        return subSubs.length > 0 ? [
                          <option key={sub.id} value={sub.id}>  {sub.name}</option>,
                          ...subSubs.map(ss => <option key={ss.id} value={ss.id}>    {ss.name}</option>)
                        ] : <option key={sub.id} value={sub.id}>  {sub.name}</option>
                      })}
                    </optgroup>
                  ) : <option key={parent.id} value={parent.id}>{parent.name}</option>
                })}
              </select>
            </div>
          )}
        </div>

        {/* Imágenes */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-700">Imágenes</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Click en ★ para cambiar la foto de portada. La portada es la imagen principal del producto.</p>
          </div>
          {images.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {images.map(img => (
                <div key={img.id} className="relative group">
                  <img src={img.url} className={`w-20 h-20 object-cover rounded-lg border-2 transition-colors ${img.is_cover ? 'border-violet-500' : 'border-zinc-200'}`} />
                  {img.is_cover && (
                    <span className="absolute bottom-0 left-0 right-0 text-[10px] text-center bg-violet-600 text-white rounded-b-lg py-0.5">Portada</span>
                  )}
                  {/* Cover toggle */}
                  {!img.is_cover && (
                    <button
                      type="button"
                      onClick={() => setCoverImage(img.id)}
                      title="Establecer como portada"
                      className="absolute top-1 left-1 w-5 h-5 bg-white/80 rounded-full text-zinc-400 hover:text-violet-600 hover:bg-white items-center justify-center hidden group-hover:flex transition-colors shadow-sm"
                    >
                      <Star size={11} />
                    </button>
                  )}
                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => removeExistingImage(img.id)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs items-center justify-center hidden group-hover:flex shadow-sm"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {newImagePreviews.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {newImagePreviews.map((src, i) => (
                <div key={i} className="relative group">
                  <img src={src} className="w-20 h-20 object-cover rounded-lg border border-zinc-200 opacity-70" />
                  <span className="absolute bottom-0 left-0 right-0 text-[10px] text-center bg-zinc-600 text-white rounded-b-lg py-0.5">Nueva</span>
                  <button
                    type="button"
                    onClick={() => removeNewImage(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs items-center justify-center hidden group-hover:flex shadow-sm"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-zinc-200 rounded-lg cursor-pointer hover:border-violet-300 hover:bg-violet-50 transition-colors">
            <Upload size={20} className="text-zinc-400 mb-1" />
            <span className="text-sm text-zinc-500">Agregar más imágenes</span>
            <span className="text-xs text-zinc-400 mt-0.5">Se redimensionan automáticamente a 600×900</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageChange} />
          </label>
        </div>

        {/* Variantes */}
        {matrixReady && (
          <VariantMatrix
            ref={matrixRef}
            mode="edit"
            initialSizes={matrixInitialSizes}
            initialColors={matrixInitialColors}
            initialCells={matrixInitialCells}
          />
        )}

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
          <button type="submit" form="edit-form" disabled={saving} className="btn-primary">
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  )
}

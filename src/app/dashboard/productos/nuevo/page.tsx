'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Upload, ArrowLeft, X, Star } from 'lucide-react'
import Link from 'next/link'
import VariantMatrix, { VariantMatrixHandle, FavoriteColor } from '@/components/VariantMatrix'
import VariantList, { VariantListHandle } from '@/components/VariantList'
import { WEIGHT_UNIT_LABELS, LENGTH_UNIT_LABELS, effectiveWeightUnit, effectiveDimensionUnit } from '@/lib/units'
import { useTutorial } from '@/components/tutorial/TutorialProvider'
import { buildProductoSteps, hint } from '@/components/tutorial/productoSteps'
import TutorialHint from '@/components/tutorial/TutorialHint'
import PageTutorialButton from '@/components/tutorial/PageTutorialButton'

// ── Attr config ───────────────────────────────────────────────────────────────
interface AttrConfig { key: string; label: string; type: 'text' | 'select' | 'color'; options?: string[] }
const SIZE_KEYS = ['talle', 'numero', 'talla', 'size']

// ── Image resize: center-crop a un ancho×alto dado, compress a ≤150KB ─
// glow usa cards cuadradas (1:1) en la tienda -> se procesa a 900x900 en vez
// de 600x900 (2:3) para que no se recorte contra el marco cuadrado del grid.
function resizeImageTo(targetW: number, targetH: number) {
  return (file: File): Promise<File> => new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      canvas.width = targetW; canvas.height = targetH
      const ctx = canvas.getContext('2d')!
      const ratio = targetW / targetH
      const sr = img.width / img.height
      let sx: number, sy: number, sw: number, sh: number
      if (sr > ratio) { sh = img.height; sw = sh * ratio; sx = (img.width - sw) / 2; sy = 0 }
      else { sw = img.width; sh = sw / ratio; sx = 0; sy = (img.height - sh) / 2 }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH)
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

export default function NuevoProductoPage() {
  const router = useRouter()
  const supabase = createClient()
  const matrixRef = useRef<VariantMatrixHandle>(null)
  const listRef = useRef<VariantListHandle>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set())
  const [categories, setCategories] = useState<{ id: string; name: string; parent_id: string | null }[]>([])
  const [widthCm, setWidthCm] = useState('')
  const [lengthCm, setLengthCm] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [description, setDescription] = useState('')
  const [minQty, setMinQty] = useState<string>('')
  const [isBestseller, setIsBestseller] = useState(false)
  const [maxInstallments, setMaxInstallments] = useState<string>('')
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])

  // Límites del plan (bloqueo de creación / subida al superar el cupo)
  const [limits, setLimits] = useState<{
    canCreateProduct: boolean; canUploadImages: boolean
    productCount: number; maxProductos: number; planNombre: string | null
  } | null>(null)

  // Custom tenant attributes (non-size, non-color) to show below the matrix
  const [extraAttrs, setExtraAttrs] = useState<AttrConfig[]>([])
  const [initialSizes, setInitialSizes] = useState<string[] | null>(null)
  const [initialColors, setInitialColors] = useState<string[] | undefined>(undefined)
  const [variantMode, setVariantMode] = useState<'sizes_colors' | 'simple'>('sizes_colors')
  const [configLoaded, setConfigLoaded] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [favoriteColors, setFavoriteColors] = useState<FavoriteColor[]>([])
  const [imageRatio, setImageRatio] = useState<'2:3' | '1:1'>('2:3')
  const [weightUnit, setWeightUnit] = useState<string>('kg')
  const [dimensionUnit, setDimensionUnit] = useState<string>('cm')
  // Override propio de este producto — vacío = usa el de la tienda.
  const [productWeightUnit, setProductWeightUnit] = useState<string>('')
  const [productDimensionUnit, setProductDimensionUnit] = useState<string>('')
  const [showRetail, setShowRetail] = useState(true)
  const [showWholesale, setShowWholesale] = useState(true)
  const [showDiscount, setShowDiscount] = useState(true)
  const [columnType, setColumnType] = useState<'color' | 'text'>('color')
  const [rowLabel, setRowLabel] = useState('')
  const [columnLabel, setColumnLabel] = useState('')
  // Override puntual para ESTE producto nuevo (vacío = usa el default del
  // tenant de arriba) — ver mismo campo en productos/[id]/page.tsx.
  const [productRowLabel, setProductRowLabel] = useState('')
  const [productColumnLabel, setProductColumnLabel] = useState('')

  // Cómo se llaman los ejes para este producto (override > tienda > genérico)
  const effRowLabel = columnType === 'text' ? (productRowLabel.trim() || rowLabel.trim() || 'Fila') : 'Talle'
  const effColumnLabel = columnType === 'text' ? (productColumnLabel.trim() || columnLabel.trim() || 'Columna') : 'Color'

  // Ver nota en productos/[id]/page.tsx: los pasos se re-registran cuando
  // cambia el modo de variantes o el nombre de los ejes.
  const { registerSteps } = useTutorial()
  useEffect(() => {
    registerSteps('productos', buildProductoSteps({
      variantMode,
      columnType,
      hasExtraAttrs: extraAttrs.length > 0,
      hasCategories: categories.length > 0,
      rowWord: effRowLabel,
      colWord: effColumnLabel,
      isNuevo: true,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantMode, columnType, extraAttrs.length, categories.length, effRowLabel, effColumnLabel])

  useEffect(() => {
    // Límites del plan — si el endpoint falla, no bloquear (best effort)
    fetch('/api/usage')
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (j) setLimits(j) })
      .catch(() => {})

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: _userRows } = await supabase.from('users').select('tenant_id').eq('id', user.id).limit(1)
  const userRow = _userRows?.[0]
      if (!userRow) return
      setTenantId(userRow?.tenant_id)
      const [{ data: cats }, { data: configData }] = await Promise.all([
        supabase.from('categories').select('id, name, parent_id').eq('tenant_id', userRow.tenant_id).eq('active', true).order('sort_order'),
        supabase.from('store_config').select('variant_attributes, preferred_colors, variant_mode, product_image_ratio, weight_unit, dimension_unit, enable_retail_pricing, enable_wholesale_pricing, enable_discount_pricing, variant_column_type, variant_row_label, variant_column_label').eq('tenant_id', userRow.tenant_id).single(),
      ])
      setCategories(cats ?? [])
      setFavoriteColors((configData as any)?.preferred_colors ?? [])
      setImageRatio((configData as any)?.product_image_ratio === '1:1' ? '1:1' : '2:3')
      setWeightUnit((configData as any)?.weight_unit ?? 'kg')
      setDimensionUnit((configData as any)?.dimension_unit ?? 'cm')
      setShowRetail((configData as any)?.enable_retail_pricing ?? true)
      setShowWholesale((configData as any)?.enable_wholesale_pricing ?? true)
      setShowDiscount((configData as any)?.enable_discount_pricing ?? true)
      setColumnType((configData as any)?.variant_column_type === 'text' ? 'text' : 'color')
      setRowLabel((configData as any)?.variant_row_label ?? '')
      setColumnLabel((configData as any)?.variant_column_label ?? '')
      const mode = (configData as any)?.variant_mode === 'simple' ? 'simple' : 'sizes_colors'
      setVariantMode(mode)

      // Extra attrs = any attrs that aren't size or color (aplica en ambos modos)
      const allAttrs: AttrConfig[] = configData?.variant_attributes ?? []
      const extra = allAttrs.filter(a => a.key !== 'color' && !SIZE_KEYS.includes(a.key))
      setExtraAttrs(extra)

      if (mode === 'simple') { setInitialSizes([]); setConfigLoaded(true); return }

      // Sizes from tenant config — si es tabla libre (columnType='text') y el
      // tenant no configuró talles/opciones propias, no tiene sentido arrancar
      // con talles de indumentaria (XS..XL): arranca en un 1x1 en blanco para
      // que cargue sus propias filas/columnas desde cero (mismo criterio que
      // ya usa productos/[id]/page.tsx para un producto existente sin variantes).
      const isTextMode = (configData as any)?.variant_column_type === 'text'
      const sizeAttr = allAttrs.find(a => SIZE_KEYS.includes(a.key))
      const sizes = sizeAttr?.options?.length
        ? sizeAttr.options
        : isTextMode ? [''] : ['XS', 'S', 'M', 'L', 'XL']
      setInitialSizes(sizes)
      if (isTextMode) setInitialColors([''])
      setConfigLoaded(true)
    }
    load()
  }, [])

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    const resizeFn = imageRatio === '1:1' ? resizeImageTo(900, 900) : resizeImageTo(600, 900)
    const resized = await Promise.all(files.map(resizeFn))
    setImageFiles(prev => [...prev, ...resized])
    setImagePreviews(prev => [...prev, ...resized.map(f => URL.createObjectURL(f))])
    e.target.value = ''
  }

  async function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (!files.length) return
    const resizeFn = imageRatio === '1:1' ? resizeImageTo(900, 900) : resizeImageTo(600, 900)
    const resized = await Promise.all(files.map(resizeFn))
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

  function toggleCategory(id: string) {
    setSelectedCategoryIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Agrega o saca un color de favoritos (por hex) — persiste en store_config
  // para el tenant entero, así aparece primero en el selector de CUALQUIER
  // producto, no solo este.
  async function toggleFavorite(color: FavoriteColor) {
    if (!tenantId) return
    const exists = favoriteColors.some(f => f.hex.toLowerCase() === color.hex.toLowerCase())
    const next = exists
      ? favoriteColors.filter(f => f.hex.toLowerCase() !== color.hex.toLowerCase())
      : [...favoriteColors, color]
    setFavoriteColors(next)
    await supabase.from('store_config').update({ preferred_colors: next }).eq('tenant_id', tenantId)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('El nombre es obligatorio'); return }
    if (!tenantId) { setError('No se pudo determinar el tenant'); return }
    // Nombres de fila/columna repetidos — se avisan acá, no bloqueando el
    // tipeo mientras se edita la tabla.
    const variantsError = variantMode === 'simple'
      ? (listRef.current?.validate?.() ?? null)
      : (matrixRef.current?.validate?.() ?? null)
    if (variantsError) { setError(variantsError); return }
    if (limits && !limits.canCreateProduct) {
      setError(`Llegaste al límite de ${limits.maxProductos} productos de tu plan${limits.planNombre ? ` ${limits.planNombre}` : ''}. Subí de plan o eliminá productos para seguir cargando.`)
      return
    }
    if (limits && !limits.canUploadImages && imageFiles.length > 0) {
      setError('Superaste el almacenamiento de tu plan — no se pueden subir más imágenes. Subí de plan o liberá espacio.')
      return
    }

    setLoading(true); setError(null)
    try {
      // Crear producto
      const slug = slugify(name) + '-' + Date.now()
      const categoryIdsArray = Array.from(selectedCategoryIds)
      // category_id = "categoría principal" (la primera tildada) — se mantiene
      // solo por compatibilidad con reportes/exports viejos que todavía la leen.
      const primaryCategoryId = categoryIdsArray[0] ?? null
      // Producto nuevo entra al tope del orden manual (mismo lugar donde
      // aparecía antes con "más recientes primero"). El default de la
      // columna (0) ya cubre esto en la mayoría de los casos, pero calculamos
      // el mínimo real para dejar espacio (-10) y no pisar otro producto que
      // ya esté en 0.
      const { data: minOrderRow } = await supabase
        .from('products')
        .select('sort_order')
        .eq('tenant_id', tenantId)
        .order('sort_order', { ascending: true })
        .limit(1)
      const topSortOrder = (minOrderRow?.[0]?.sort_order ?? 10) - 10
      const { data: product, error: productError } = await supabase
        .from('products')
        .insert({
          tenant_id: tenantId, name: name.trim(), sku: sku.trim() || null, slug,
          description: description.trim() || null, active: true,
          category_id: primaryCategoryId, is_bestseller: isBestseller,
          sort_order: topSortOrder,
          min_qty: minQty.trim() === '' ? null : Math.max(1, Number(minQty)),
          max_installments: maxInstallments.trim() === '' ? null : Math.max(1, Number(maxInstallments)),
          width_cm: widthCm ? Number(widthCm) : null,
          length_cm: lengthCm ? Number(lengthCm) : null,
          height_cm: heightCm ? Number(heightCm) : null,
          weight_kg: weightKg ? Number(weightKg) : null,
          row_label: productRowLabel.trim() || null,
          weight_unit: productWeightUnit || null,
          dimension_unit: productDimensionUnit || null,
          column_label: productColumnLabel.trim() || null,
        })
        .select().single()
      if (productError) throw productError

      // Categorías (multi) — tabla puente product_categories
      if (categoryIdsArray.length > 0) {
        const { error: catErr } = await supabase
          .from('product_categories')
          .insert(categoryIdsArray.map(category_id => ({ product_id: product.id, category_id })))
        if (catErr) throw catErr
      }

      // Subir imágenes
      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i]
        const path = `${tenantId}/${product.id}/${Date.now()}-${i}.jpg`
        const { data: up } = await supabase.storage.from('product-images').upload(path, file, { upsert: true, contentType: 'image/jpeg', cacheControl: '31536000' })
        if (up) {
          const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path)
          const { error: imgErr } = await supabase.from('product_images').insert({ product_id: product.id, url: publicUrl, sort_order: i, is_cover: i === 0 })
          if (imgErr) throw imgErr
        }
      }

      // Guardar variantes — modo simple: 1 sola variante sin talle/color.
      // Modo sizes_colors: una por celda de la matriz (extra attrs van al
      // JSONB attributes de cada variante).
      // El nombre de cada variante (modo lista) va a variants.size, que es de
      // donde la tienda arma el selector de opciones del producto.
      const variantsToSave: any[] = variantMode === 'simple'
        ? (listRef.current?.getVariants() ?? []).map(v => ({
            size: v.name || null,
            color: null,
            colorHex: null,
            attrs: v.attrs ?? {},
            stock: v.stock,
            active: v.active,
            retailPrice: v.retailPrice,
            retailCompareAt: v.retailCompareAt,
            wholesalePrice: v.wholesalePrice,
            wholesaleCompareAt: v.wholesaleCompareAt,
            wholesaleMinQty: v.wholesaleMinQty,
          }))
        : (matrixRef.current?.getVariants() ?? [])

      for (const v of variantsToSave) {
        // Ya viene armado por variante desde la matriz (identidad de celda +
        // atributos propios), sin un set global que pise a todas por igual.
        const attrs = (v as any).attrs ?? {}
        const { data: variant, error: varErr } = await supabase
          .from('variants')
          .insert({ product_id: product.id, size: v.size, color: v.color, color_hex: (v as any).colorHex, sku: null, stock: v.stock, active: (v as any).active ?? true, attributes: attrs })
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
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Nuevo producto</h1>
          <PageTutorialButton pageKey="productos" />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="px-8 py-6 max-w-4xl space-y-6">

        {limits && !limits.canCreateProduct && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Llegaste al límite de <strong>{limits.maxProductos} productos</strong> de tu plan
            {limits.planNombre ? ` ${limits.planNombre}` : ''} ({limits.productCount} cargados).{' '}
            <Link href="/dashboard/uso" className="font-medium underline underline-offset-2">Ver plan y uso</Link>
          </div>
        )}
        {limits && limits.canCreateProduct && !limits.canUploadImages && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Superaste el almacenamiento de tu plan: podés crear el producto pero sin imágenes nuevas.{' '}
            <Link href="/dashboard/uso" className="font-medium underline underline-offset-2">Ver plan y uso</Link>
          </div>
        )}

        {/* Datos básicos */}
        <div data-tutorial="prod-basica" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold text-zinc-700">Información básica</h2>
            <TutorialHint pageKey="productos" step={hint('prod-basica')} />
          </div>
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
            <label className="block text-sm font-medium text-zinc-700 mb-1">Mínimo por variante</label>
            <input
              className="input max-w-[160px]"
              type="number"
              min={1}
              value={minQty}
              onChange={e => setMinQty(e.target.value)}
              placeholder="General"
            />
            <p className="text-xs text-zinc-400 mt-1">Dejar vacío para usar el mínimo general de la tienda (configurable en Mi Tienda).</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Descripción</label>
            <textarea className="input resize-none" rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción del producto..." />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer">
            <input type="checkbox" checked={isBestseller} onChange={e => setIsBestseller(e.target.checked)} className="rounded" />
            Destacado (Best seller) — se muestra en la sección de más vendidos de la home
          </label>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Máximo de cuotas</label>
            <input
              className="input max-w-[160px]"
              type="number"
              min={1}
              value={maxInstallments}
              onChange={e => setMaxInstallments(e.target.value)}
              placeholder="Sin tope"
            />
            <p className="text-xs text-zinc-400 mt-1">Tope de cuotas para este producto al pagar con Mercado Pago. Dejar vacío para no limitar.</p>
          </div>
          {categories.length > 0 && (
            <div data-tutorial="prod-categorias">
              <div className="flex items-center gap-1.5 mb-1">
                <label className="block text-sm font-medium text-zinc-700">Categorías</label>
                <TutorialHint pageKey="productos" step={hint('prod-categorias')} />
              </div>
              <p className="text-xs text-zinc-400 mb-2">Podés tildar más de una — el producto va a aparecer en todas las que elijas</p>
              <div className="border border-zinc-200 rounded-lg divide-y divide-zinc-100 max-h-72 overflow-y-auto">
                {categories.filter(c => !c.parent_id).map(parent => {
                  const subs = categories.filter(c => c.parent_id === parent.id)
                  return (
                    <div key={parent.id} className="px-3 py-2">
                      <label className="flex items-center gap-2 text-sm text-zinc-800 cursor-pointer">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={selectedCategoryIds.has(parent.id)}
                          onChange={() => toggleCategory(parent.id)}
                        />
                        {parent.name}
                      </label>
                      {subs.map(sub => {
                        const subSubs = categories.filter(c => c.parent_id === sub.id)
                        return (
                          <div key={sub.id} className="mt-1.5 ml-6">
                            <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                              <input
                                type="checkbox"
                                className="rounded"
                                checked={selectedCategoryIds.has(sub.id)}
                                onChange={() => toggleCategory(sub.id)}
                              />
                              {sub.name}
                            </label>
                            {subSubs.map(leaf => (
                              <label key={leaf.id} className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer mt-1.5 ml-6">
                                <input
                                  type="checkbox"
                                  className="rounded"
                                  checked={selectedCategoryIds.has(leaf.id)}
                                  onChange={() => toggleCategory(leaf.id)}
                                />
                                {leaf.name}
                              </label>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Dimensiones y peso */}
        <div data-tutorial="prod-dimensiones" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-semibold text-zinc-700">Dimensiones y peso</h2>
              <TutorialHint pageKey="productos" step={hint('prod-dimensiones')} />
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">Opcional — se muestran en la etiqueta de envío. Todavía no se usan para calcular el costo del envío</p>
          </div>

          {/* Unidades de ESTE producto — vacío = usa la de Catálogo. */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Unidad de medidas</label>
              <select className="input text-sm" value={productDimensionUnit} onChange={e => setProductDimensionUnit(e.target.value)}>
                <option value="">Usar la de la tienda ({dimensionUnit})</option>
                {Object.entries(LENGTH_UNIT_LABELS).map(([u, label]) => (
                  <option key={u} value={u}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Unidad de peso / contenido</label>
              <select className="input text-sm" value={productWeightUnit} onChange={e => setProductWeightUnit(e.target.value)}>
                <option value="">Usar la de la tienda ({weightUnit})</option>
                {Object.entries(WEIGHT_UNIT_LABELS).map(([u, label]) => (
                  <option key={u} value={u}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Ancho ({effectiveDimensionUnit(productDimensionUnit, dimensionUnit)})</label>
              <input className="input" type="number" min={0} step="0.1" value={widthCm} onChange={e => setWidthCm(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Largo ({effectiveDimensionUnit(productDimensionUnit, dimensionUnit)})</label>
              <input className="input" type="number" min={0} step="0.1" value={lengthCm} onChange={e => setLengthCm(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Altura ({effectiveDimensionUnit(productDimensionUnit, dimensionUnit)})</label>
              <input className="input" type="number" min={0} step="0.1" value={heightCm} onChange={e => setHeightCm(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Peso ({effectiveWeightUnit(productWeightUnit, weightUnit)})</label>
              <input className="input" type="number" min={0} step="0.01" value={weightKg} onChange={e => setWeightKg(e.target.value)} placeholder="0" />
            </div>
          </div>
        </div>

        {/* Imágenes */}
        <div data-tutorial="prod-imagenes" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold text-zinc-700">Imágenes</h2>
            <TutorialHint pageKey="productos" step={hint('prod-imagenes')} />
          </div>
          <label
            className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${isDragging ? 'border-primary-500 bg-primary-50' : 'border-zinc-200 hover:border-primary-300 hover:bg-primary-50'}`}
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <Upload size={20} className="text-zinc-400 mb-1" />
            <span className="text-sm text-zinc-500">{isDragging ? 'Soltá las imágenes acá' : 'Arrastrá o hacé click para subir fotos'}</span>
            <span className="text-xs text-zinc-400 mt-0.5">Se redimensionan automáticamente a {imageRatio === '1:1' ? '900×900' : '600×900'}</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageChange} />
          </label>
          {imagePreviews.length > 0 && (
            <div>
              <p className="text-xs text-zinc-400 mb-2">Click en ★ para establecer como portada. La primera imagen es la portada.</p>
              <div className="flex gap-2 flex-wrap">
                {imagePreviews.map((src, i) => (
                  <div key={i} className="relative group">
                    <img src={src} className={`w-20 h-20 object-cover rounded-lg border-2 ${i === 0 ? 'border-primary-500' : 'border-zinc-200'}`} />
                    {i === 0
                      ? <span className="absolute bottom-0 left-0 right-0 text-[10px] text-center bg-primary-600 text-white rounded-b-lg py-0.5">Portada</span>
                      : <button type="button" onClick={() => moveImageToFront(i)} title="Establecer como portada"
                          className="absolute top-1 left-1 w-5 h-5 bg-white/80 rounded-full text-zinc-400 hover:text-primary-600 hover:bg-white items-center justify-center hidden group-hover:flex shadow-sm">
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
        {configLoaded && (
          variantMode === 'simple' ? (
            <VariantList
              ref={listRef}
              showRetail={showRetail}
              showWholesale={showWholesale}
              showDiscount={showDiscount}
              extraAttrs={extraAttrs}
              hintSlot={<TutorialHint pageKey="productos" step={hint('prod-lista')} />}
              groupTitle={productRowLabel}
              onGroupTitleChange={setProductRowLabel}
              tenantGroupTitle={rowLabel}
            />
          ) : initialSizes && (
            <>
              <VariantMatrix
                ref={matrixRef}
                mode="create"
                initialSizes={initialSizes}
                initialColors={initialColors}
                favoriteColors={favoriteColors}
                onToggleFavorite={toggleFavorite}
                columnType={columnType}
                rowLabel={productRowLabel.trim() || rowLabel}
                columnLabel={productColumnLabel.trim() || columnLabel}
                showRetail={showRetail}
                showWholesale={showWholesale}
                showDiscount={showDiscount}
                extraAttrs={extraAttrs}
                productRowLabel={productRowLabel}
                productColumnLabel={productColumnLabel}
                onProductRowLabelChange={setProductRowLabel}
                onProductColumnLabelChange={setProductColumnLabel}
                tenantRowLabel={rowLabel}
                tenantColumnLabel={columnLabel}
                hintSlot={<TutorialHint pageKey="productos" step={hint('prod-tabla')} />}
              />
            </>
          )
        )}

        {/* Los atributos adicionales se cargan por variante (botón "Atributos"
            en cada celda de la tabla, o en cada fila de la lista de variantes),
            no una sola vez para todo el producto. */}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div data-tutorial="prod-guardar" className="flex gap-3 pb-8">
          <Link href="/dashboard/productos" className="btn-secondary">Cancelar</Link>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Guardando...' : 'Crear producto'}
          </button>
        </div>
      </form>
    </div>
  )
}

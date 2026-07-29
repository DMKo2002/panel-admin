'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Trash2, Upload, Star, X, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react'
import VariantMatrix, { VariantMatrixHandle, CellData, cellKey, FavoriteColor } from '@/components/VariantMatrix'
import SimpleVariantForm, { SimpleVariantHandle, SimpleVariantData } from '@/components/SimpleVariantForm'
import { buildDisplayNameByRawColor } from '@/lib/colorNames'

// ── Attr config ───────────────────────────────────────────────────────────────
interface AttrConfig { key: string; label: string; type: 'text' | 'select' | 'color'; options?: string[] }
const SIZE_KEYS = ['talle', 'numero', 'talla', 'size']

// ── Image resize: center-crop a un ancho×alto dado, compress a ≤150KB ──────────
// El ratio (2:3 retrato o 1:1 cuadrada) sale de store_config.product_image_ratio,
// configurable por tienda en Mi Tienda > Catálogo.
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

// Mismo criterio de orden que usan Panel Admin y todas las tiendas: portada
// primero, después sort_order ascendente.
function sortImages<T extends { is_cover: boolean; sort_order: number }>(imgs: T[]): T[] {
  return [...imgs].sort((a, b) => {
    if (a.is_cover) return -1
    if (b.is_cover) return 1
    return (a.sort_order ?? 0) - (b.sort_order ?? 0)
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
  const simpleRef = useRef<SimpleVariantHandle>(null)
  const [dragOver, setDragOver] = useState(false)

  // Prevent browser from navigating when files are dropped outside the upload zone
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [storeDomain, setStoreDomain] = useState<string>('')
  const [imageRatio, setImageRatio] = useState<'2:3' | '1:1'>('2:3')
  const [weightUnit, setWeightUnit] = useState<'kg' | 'ml' | 'g'>('kg')
  const [productSlug, setProductSlug] = useState<string>('')
  const [showRetail, setShowRetail] = useState(true)
  const [showWholesale, setShowWholesale] = useState(true)
  const [showDiscount, setShowDiscount] = useState(true)
  const [columnType, setColumnType] = useState<'color' | 'text'>('color')
  const [rowLabel, setRowLabel] = useState('')
  const [columnLabel, setColumnLabel] = useState('')

  // Basic product fields
  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [description, setDescription] = useState('')
  // Mínimo de unidades por variante para ESTE producto. null/'' = usa el
  // mínimo global configurado en Mi Tienda.
  const [minQty, setMinQty] = useState<string>('')
  const [active, setActive] = useState(true)
  const [isBestseller, setIsBestseller] = useState(false)
  const [maxInstallments, setMaxInstallments] = useState<string>('')
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set())
  const [categories, setCategories] = useState<{ id: string; name: string; parent_id: string | null }[]>([])
  const [widthCm, setWidthCm] = useState('')
  const [lengthCm, setLengthCm] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [images, setImages] = useState<{ id: string; url: string; is_cover: boolean; sort_order: number }[]>([])
  const [dragImageIdx, setDragImageIdx] = useState<number | null>(null)
  const [dragOverImageIdx, setDragOverImageIdx] = useState<number | null>(null)
  const [newImageFiles, setNewImageFiles] = useState<File[]>([])
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([])

  // Extra tenant attrs (non-size, non-color)
  const [extraAttrs, setExtraAttrs] = useState<AttrConfig[]>([])
  const [extraAttrValues, setExtraAttrValues] = useState<Record<string, string>>({})

  // Matrix initial state
  const [matrixInitialSizes, setMatrixInitialSizes] = useState<string[]>([])
  const [matrixInitialColors, setMatrixInitialColors] = useState<string[]>([])
  const [matrixInitialColorHexes, setMatrixInitialColorHexes] = useState<string[]>([])
  const [matrixInitialCells, setMatrixInitialCells] = useState<Record<string, CellData>>({})
  const [matrixReady, setMatrixReady] = useState(false)
  const [variantMode, setVariantMode] = useState<'sizes_colors' | 'simple'>('sizes_colors')
  const [simpleInitial, setSimpleInitial] = useState<SimpleVariantData | undefined>(undefined)
  // Se incrementa cada vez que se recargan los datos frescos de la base
  // (después de guardar) — se usa como `key` de VariantMatrix para forzar
  // que reinicie su estado interno con los ids de variante reales, en vez
  // de seguir pensando que las recién creadas todavía no existen.
  const [matrixVersion, setMatrixVersion] = useState(0)
  const [favoriteColors, setFavoriteColors] = useState<FavoriteColor[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    load()
  }, [id])

  async function load() {
      const [{ data: product }, { data: { user } }] = await Promise.all([
        supabase.from('products').select('*, product_images(*), variants(*, price_rules(*))').eq('id', id).single(),
        supabase.auth.getUser(),
      ])
      if (!product) { router.push('/dashboard/productos'); return }

      setName(product.name)
      setSku(product.sku ?? '')
      setDescription(product.description ?? '')
      setMinQty(product.min_qty != null ? String(product.min_qty) : '')
      setActive(product.active ?? true)
      setIsBestseller(product.is_bestseller ?? false)
      setMaxInstallments(product.max_installments != null ? String(product.max_installments) : '')
      setProductSlug(product.slug ?? '')
      setImages(sortImages(product.product_images ?? []))
      setWidthCm(product.width_cm != null ? String(product.width_cm) : '')
      setLengthCm(product.length_cm != null ? String(product.length_cm) : '')
      setHeightCm(product.height_cm != null ? String(product.height_cm) : '')
      setWeightKg(product.weight_kg != null ? String(product.weight_kg) : '')

      // Categorías (multi) — vienen de la tabla puente product_categories.
      // Fallback a category_id para productos viejos creados antes de la
      // migración a multi-categoría (todavía no tienen fila en la tabla puente).
      const { data: pcRows } = await supabase.from('product_categories').select('category_id').eq('product_id', id)
      if (pcRows && pcRows.length > 0) {
        setSelectedCategoryIds(new Set(pcRows.map((r: any) => r.category_id)))
      } else if (product.category_id) {
        setSelectedCategoryIds(new Set([product.category_id]))
      }

      // Build matrix from existing variants
      const dbVariants: any[] = product.variants ?? []
      const sizes = [...new Set(dbVariants.map((v: any) => v.size ?? '').filter(Boolean))]

      // Nombre a mostrar por variante: si el nombre guardado es en realidad un
      // código hex (bug legacy previo a separar nombre/hex), se reemplaza acá
      // mismo por el nombre HTML/CSS más cercano — sin que el tenant tenga que
      // tocar nada. Es solo el valor mostrado en el editor; se persiste recién
      // cuando el tenant guarda el producto (ver getVariants() en VariantMatrix).
      // Misma normalización que usa la API de borrado de columnas/filas (ver
      // @/lib/colorNames) — así el nombre que ve el tenant acá es siempre el
      // mismo que se busca del lado del servidor cuando pide borrar un color.
      const displayNameByRawColor = buildDisplayNameByRawColor(dbVariants)

      const colors = [...new Set(dbVariants.map((v: any) => displayNameByRawColor[v.color ?? ''] ?? '').filter(Boolean))]
      if (colors.length === 0) colors.push('')

      // Hex real guardado por color (elegido con cuentagotas/selector) — se
      // toma del primer variant con ese nombre (ya normalizado) que tenga color_hex.
      const colorHexByName: Record<string, string> = {}
      for (const v of dbVariants) {
        const name = displayNameByRawColor[v.color ?? ''] ?? ''
        if (name && v.color_hex && !colorHexByName[name]) colorHexByName[name] = v.color_hex
      }
      const colorHexes = colors.map(c => colorHexByName[c] ?? '')

      let storeAttrs: AttrConfig[] = []
      let mode: 'sizes_colors' | 'simple' = 'sizes_colors'

      if (user) {
        const { data: _userRows } = await supabase.from('users').select('tenant_id').eq('id', user.id).limit(1)
  const userRow = _userRows?.[0]
        if (userRow) {
          setTenantId(userRow?.tenant_id)
          const [{ data: cats }, { data: configData }, { data: tenantRow }] = await Promise.all([
            supabase.from('categories').select('id, name, parent_id').eq('tenant_id', userRow.tenant_id).eq('active', true).order('sort_order'),
            supabase.from('store_config').select('variant_attributes, preferred_colors, variant_mode, product_image_ratio, weight_unit, enable_retail_pricing, enable_wholesale_pricing, enable_discount_pricing, variant_column_type, variant_row_label, variant_column_label').eq('tenant_id', userRow.tenant_id).single(),
            supabase.from('tenants').select('domain').eq('id', userRow.tenant_id).single(),
          ])
          setCategories(cats ?? [])
          setFavoriteColors((configData as any)?.preferred_colors ?? [])
          setStoreDomain(tenantRow?.domain ?? '')
          setImageRatio((configData as any)?.product_image_ratio === '1:1' ? '1:1' : '2:3')
          setWeightUnit((configData as any)?.weight_unit ?? 'kg')
          setShowRetail((configData as any)?.enable_retail_pricing ?? true)
          setShowWholesale((configData as any)?.enable_wholesale_pricing ?? true)
          setShowDiscount((configData as any)?.enable_discount_pricing ?? true)
          setColumnType((configData as any)?.variant_column_type === 'text' ? 'text' : 'color')
          setRowLabel((configData as any)?.variant_row_label ?? '')
          setColumnLabel((configData as any)?.variant_column_label ?? '')
          mode = (configData as any)?.variant_mode === 'simple' ? 'simple' : 'sizes_colors'
          setVariantMode(mode)

          storeAttrs = configData?.variant_attributes ?? []
          const extra = storeAttrs.filter((a: AttrConfig) => a.key !== 'color' && !SIZE_KEYS.includes(a.key))
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

      if (mode === 'simple') {
        // Modo simple: 1 sola variante, sin talle/color. Precarga desde la
        // primera (y única esperada) variante existente, si hay.
        const v = dbVariants[0]
        if (v) {
          const retail = v.price_rules?.find((p: any) => p.type === 'retail')
          const wholesale = v.price_rules?.find((p: any) => p.type === 'wholesale')
          setSimpleInitial({
            id: v.id,
            stock: v.stock ?? 0,
            retailPrice: Math.round(retail?.price ?? 0),
            retailCompareAt: Math.round(retail?.compare_at_price ?? 0),
            wholesalePrice: Math.round(wholesale?.price ?? 0),
            wholesaleCompareAt: Math.round(wholesale?.compare_at_price ?? 0),
            wholesaleMinQty: wholesale?.min_qty ?? 1,
          })
        } else {
          setSimpleInitial(undefined)
        }
        setMatrixReady(true)
        setMatrixVersion(v2 => v2 + 1)
        setLoading(false)
        return
      }

      // Fallback to Mi Tienda configured sizes when the product has no sizes yet
      if (sizes.length === 0) {
        const sizeAttr = storeAttrs.find((a: AttrConfig) => SIZE_KEYS.includes(a.key))
        if (sizeAttr?.options?.length) {
          sizes.push(...sizeAttr.options)
        } else {
          sizes.push('')
        }
      }

      const cells: Record<string, CellData> = {}
      for (const v of dbVariants) {
        const s = v.size ?? ''
        const c = displayNameByRawColor[v.color ?? ''] ?? ''
        const retail = v.price_rules?.find((p: any) => p.type === 'retail')
        const wholesale = v.price_rules?.find((p: any) => p.type === 'wholesale')
        cells[cellKey(s, c)] = {
          variantId: v.id,
          stock: v.stock ?? 0,
          retailPrice: Math.round(retail?.price ?? 0),
          retailCompareAt: Math.round(retail?.compare_at_price ?? 0),
          wholesalePrice: Math.round(wholesale?.price ?? 0),
          wholesaleCompareAt: Math.round(wholesale?.compare_at_price ?? 0),
          wholesaleMinQty: wholesale?.min_qty ?? 6,
        }
      }

      setMatrixInitialSizes(sizes)
      setMatrixInitialColors(colors)
      setMatrixInitialColorHexes(colorHexes)
      setMatrixInitialCells(cells)
      setMatrixReady(true)
      setMatrixVersion(v => v + 1)
      setLoading(false)
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    const resizeFn = imageRatio === '1:1' ? resizeImageTo(900, 900) : resizeImageTo(600, 900)
    const resized = await Promise.all(files.map(resizeFn))
    setNewImageFiles(prev => [...prev, ...resized])
    setNewImagePreviews(prev => [...prev, ...resized.map(f => URL.createObjectURL(f))])
    e.target.value = ''
  }

  async function handleImageDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (files.length === 0) return
    const resizeFn = imageRatio === '1:1' ? resizeImageTo(900, 900) : resizeImageTo(600, 900)
    const resized = await Promise.all(files.map(resizeFn))
    setNewImageFiles(prev => [...prev, ...resized])
    setNewImagePreviews(prev => [...prev, ...resized.map(f => URL.createObjectURL(f))])
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

  // Reordena dos imágenes adyacentes (no-portada) intercambiando su sort_order.
  // La portada nunca se mueve por acá — su posición la fija el botón ★.
  async function moveImage(index: number, direction: -1 | 1) {
    const targetIndex = index + direction
    const a = images[index]
    const b = images[targetIndex]
    if (!a || !b || a.is_cover || b.is_cover) return
    await supabase.from('product_images').update({ sort_order: b.sort_order }).eq('id', a.id)
    await supabase.from('product_images').update({ sort_order: a.sort_order }).eq('id', b.id)
    setImages(prev => sortImages(prev.map(img => {
      if (img.id === a.id) return { ...img, sort_order: b.sort_order }
      if (img.id === b.id) return { ...img, sort_order: a.sort_order }
      return img
    })))
  }

  function toggleCategory(catId: string) {
    setSelectedCategoryIds(prev => {
      const next = new Set(prev)
      next.has(catId) ? next.delete(catId) : next.add(catId)
      return next
    })
  }

  // Arrastrar y soltar para reordenar (la portada queda fija, igual que con
  // las flechas — no se puede arrastrar sobre/desde ella).
  async function reorderImages(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return
    const from = images[fromIndex]
    const to = images[toIndex]
    if (!from || !to || from.is_cover || to.is_cover) return

    const next = [...images]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)

    let seq = 0
    const withNewOrder = next.map(img => img.is_cover ? img : { ...img, sort_order: seq++ })
    setImages(sortImages(withNewOrder))

    await Promise.all(
      withNewOrder
        .filter(img => !img.is_cover)
        .map(img => supabase.from('product_images').update({ sort_order: img.sort_order }).eq('id', img.id))
    )
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError(null)
    try {
      const categoryIdsArray = Array.from(selectedCategoryIds)
      // category_id = "categoría principal" (la primera tildada) — se mantiene
      // solo por compatibilidad con reportes/exports viejos que todavía la leen.
      const primaryCategoryId = categoryIdsArray[0] ?? null

      // Actualizar producto
      const { error: prodErr } = await supabase.from('products').update({
        name: name.trim(),
        sku: sku.trim() || null,
        slug: slugify(name) + '-' + id.slice(0, 6),
        description: description.trim() || null,
        active,
        category_id: primaryCategoryId,
        min_qty: minQty.trim() === '' ? null : Math.max(1, Number(minQty)),
        is_bestseller: isBestseller,
        max_installments: maxInstallments.trim() === '' ? null : Math.max(1, Number(maxInstallments)),
        width_cm: widthCm ? Number(widthCm) : null,
        length_cm: lengthCm ? Number(lengthCm) : null,
        height_cm: heightCm ? Number(heightCm) : null,
        weight_kg: weightKg ? Number(weightKg) : null,
      }).eq('id', id)
      if (prodErr) throw prodErr

      // Categorías (multi) — se reemplaza el set completo en product_categories
      // (borra todas las filas del producto y vuelve a insertar las tildadas).
      const { error: delCatErr } = await supabase.from('product_categories').delete().eq('product_id', id)
      if (delCatErr) throw delCatErr
      if (categoryIdsArray.length > 0) {
        const { error: catErr } = await supabase
          .from('product_categories')
          .insert(categoryIdsArray.map(category_id => ({ product_id: id, category_id })))
        if (catErr) throw catErr
      }

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

      // Guardar variantes — modo simple: 1 sola (sin talle/color). Modo
      // sizes_colors: una por celda de la matriz.
      const variantsToSave = variantMode === 'simple'
        ? (simpleRef.current ? [{ ...simpleRef.current.getVariant(), size: null, color: null, colorHex: null, attrs: {} }] : [])
        : (matrixRef.current?.getVariants() ?? [])

      for (const v of variantsToSave as any[]) {
        const attrs = { ...(v.attrs ?? {}), ...extraAttrValues }
        const rules: any[] = []

        if (v.id) {
          const { error: varErr } = await supabase.from('variants').update({
            size: v.size, color: v.color, color_hex: v.colorHex, stock: v.stock, attributes: attrs,
          }).eq('id', v.id)
          if (varErr) throw varErr
          await supabase.from('price_rules').delete().eq('variant_id', v.id)
          if (v.retailPrice > 0) rules.push({ variant_id: v.id, type: 'retail', min_qty: 1, price: v.retailPrice, compare_at_price: v.retailCompareAt > 0 ? v.retailCompareAt : null, active: true })
          if (v.wholesalePrice > 0) rules.push({ variant_id: v.id, type: 'wholesale', min_qty: v.wholesaleMinQty || 6, price: v.wholesalePrice, compare_at_price: v.wholesaleCompareAt > 0 ? v.wholesaleCompareAt : null, active: true })
          if (rules.length > 0) { const { error: rErr } = await supabase.from('price_rules').insert(rules); if (rErr) throw rErr }
        } else {
          const { data: nv, error: nvErr } = await supabase.from('variants')
            .insert({ product_id: id, size: v.size, color: v.color, color_hex: v.colorHex, stock: v.stock, attributes: attrs })
            .select().single()
          if (nvErr) throw nvErr
          if (nv) {
            if (v.retailPrice > 0) rules.push({ variant_id: nv.id, type: 'retail', min_qty: 1, price: v.retailPrice, compare_at_price: v.retailCompareAt > 0 ? v.retailCompareAt : null, active: true })
            if (v.wholesalePrice > 0) rules.push({ variant_id: nv.id, type: 'wholesale', min_qty: v.wholesaleMinQty || 6, price: v.wholesalePrice, compare_at_price: v.wholesaleCompareAt > 0 ? v.wholesaleCompareAt : null, active: true })
            if (rules.length > 0) { const { error: rErr } = await supabase.from('price_rules').insert(rules); if (rErr) throw rErr }
          }
        }
      }

      setNewImageFiles([])
      setNewImagePreviews([])
      // Se queda en la misma página en vez de volver al listado, para poder
      // seguir editando — pero hay que recargar los datos frescos (ids de
      // variantes recién creadas, imágenes subidas) y remontar la matriz
      // con esos ids reales, si no un segundo guardado insertaría de nuevo
      // las mismas variantes en vez de actualizarlas.
      await load()
      router.refresh()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
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

  // Borrar una columna de color o una fila de talle entera — a diferencia de
  // vaciar los precios a mano, esto elimina de verdad las variantes en la
  // base (vía API, que bloquea el borrado si ya tienen pedidos asociados).
  async function removeVariantGroup(by: 'color' | 'size', value: string): Promise<boolean> {
    const label = by === 'color' ? 'el color' : 'el talle'
    if (!confirm(`¿Eliminar ${label} "${value}" de este producto? Esto borra las variantes correspondientes de la base — no se puede deshacer.`)) {
      return false
    }
    try {
      const res = await fetch('/api/variants/delete-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: id, by, value }),
      })
      const json = await res.json()
      if (!res.ok) {
        alert(json.error ?? 'No se pudo eliminar')
        return false
      }
      return true
    } catch (err: any) {
      alert(err.message ?? 'No se pudo eliminar')
      return false
    }
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

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-zinc-400 text-sm">Cargando producto...</p>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-10 px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/productos" className="text-zinc-400 hover:text-zinc-600 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">Editar producto</h1>
            {productSlug && storeDomain && (
              <a
                href={`https://${storeDomain}/tienda/${productSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary-500 hover:text-primary-700 flex items-center gap-1 mt-0.5"
              >
                Ver en tienda <ExternalLink size={10} />
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs text-emerald-600 font-medium">✓ Cambios guardados</span>}
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
            <textarea className="input resize-none" rows={3} value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          {categories.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Categorías</label>
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
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-700">Dimensiones y peso</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Opcional — por ahora es solo un dato de ficha, todavía no se usa para calcular el envío</p>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Ancho (cm)</label>
              <input className="input" type="number" min={0} step="0.1" value={widthCm} onChange={e => setWidthCm(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Largo (cm)</label>
              <input className="input" type="number" min={0} step="0.1" value={lengthCm} onChange={e => setLengthCm(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Altura (cm)</label>
              <input className="input" type="number" min={0} step="0.1" value={heightCm} onChange={e => setHeightCm(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Peso ({weightUnit})</label>
              <input className="input" type="number" min={0} step="0.01" value={weightKg} onChange={e => setWeightKg(e.target.value)} placeholder="0" />
            </div>
          </div>
        </div>

        {/* Imágenes */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-700">Imágenes</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Click en ★ para cambiar la foto de portada. Arrastrá las imágenes o usá las flechas para reordenar — el orden se refleja igual en la tienda.</p>
          </div>
          {images.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {images.map((img, i) => (
                <div
                  key={img.id}
                  className={`relative group transition-opacity ${dragImageIdx === i ? 'opacity-40' : ''} ${dragOverImageIdx === i && dragImageIdx !== null && dragImageIdx !== i ? 'ring-2 ring-primary-400 rounded-lg' : ''}`}
                  draggable={!img.is_cover}
                  onDragStart={() => setDragImageIdx(i)}
                  onDragOver={e => { if (!img.is_cover) { e.preventDefault(); setDragOverImageIdx(i) } }}
                  onDragLeave={() => setDragOverImageIdx(prev => prev === i ? null : prev)}
                  onDrop={e => {
                    e.preventDefault()
                    if (dragImageIdx !== null && !img.is_cover) reorderImages(dragImageIdx, i)
                    setDragImageIdx(null)
                    setDragOverImageIdx(null)
                  }}
                  onDragEnd={() => { setDragImageIdx(null); setDragOverImageIdx(null) }}
                >
                  <img src={img.url} className={`w-20 h-20 object-cover rounded-lg border-2 transition-colors ${img.is_cover ? 'border-primary-500' : 'border-zinc-200'} ${!img.is_cover ? 'cursor-grab active:cursor-grabbing' : ''}`} />
                  {img.is_cover && (
                    <span className="absolute bottom-0 left-0 right-0 text-[10px] text-center bg-primary-600 text-white rounded-b-lg py-0.5">Portada</span>
                  )}
                  {/* Cover toggle */}
                  {!img.is_cover && (
                    <button
                      type="button"
                      onClick={() => setCoverImage(img.id)}
                      title="Establecer como portada"
                      className="absolute top-1 left-1 w-5 h-5 bg-white/80 rounded-full text-zinc-400 hover:text-primary-600 hover:bg-white items-center justify-center hidden group-hover:flex transition-colors shadow-sm"
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
                  {/* Reorder (la portada no se mueve por acá) */}
                  {!img.is_cover && (
                    <>
                      <button
                        type="button"
                        onClick={() => moveImage(i, -1)}
                        disabled={i === 0 || images[i - 1]?.is_cover}
                        title="Mover antes"
                        className="absolute bottom-1 left-1 w-5 h-5 bg-white/80 rounded-full text-zinc-500 hover:text-primary-600 hover:bg-white items-center justify-center hidden group-hover:flex disabled:opacity-0 transition-colors shadow-sm"
                      >
                        <ChevronLeft size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveImage(i, 1)}
                        disabled={i === images.length - 1}
                        title="Mover después"
                        className="absolute bottom-1 right-1 w-5 h-5 bg-white/80 rounded-full text-zinc-500 hover:text-primary-600 hover:bg-white items-center justify-center hidden group-hover:flex disabled:opacity-0 transition-colors shadow-sm"
                      >
                        <ChevronRight size={12} />
                      </button>
                    </>
                  )}
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
          <label
            className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${dragOver ? 'border-primary-400 bg-primary-50' : 'border-zinc-200 hover:border-primary-300 hover:bg-primary-50'}`}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }}
            onDragEnter={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }}
            onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setDragOver(false) }}
            onDrop={handleImageDrop}
          >
            <Upload size={20} className={`mb-1 ${dragOver ? 'text-primary-400' : 'text-zinc-400'}`} />
            <span className="text-sm text-zinc-500">{dragOver ? 'Soltar imágenes aquí' : 'Agregar más imágenes'}</span>
            <span className="text-xs text-zinc-400 mt-0.5">Click o arrastrá · Se redimensionan a {imageRatio === '1:1' ? '900×900' : '600×900'}</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageChange} />
          </label>
        </div>

        {/* Variantes */}
        {matrixReady && (
          variantMode === 'simple' ? (
            <SimpleVariantForm key={matrixVersion} ref={simpleRef} initial={simpleInitial} showRetail={showRetail} showWholesale={showWholesale} showDiscount={showDiscount} />
          ) : (
            <VariantMatrix
              key={matrixVersion}
              ref={matrixRef}
              mode="edit"
              initialSizes={matrixInitialSizes}
              initialColors={matrixInitialColors}
              initialColorHexes={matrixInitialColorHexes}
              initialCells={matrixInitialCells}
              onRemoveColor={(color) => removeVariantGroup('color', color)}
              onRemoveSize={(size) => removeVariantGroup('size', size)}
              favoriteColors={favoriteColors}
              onToggleFavorite={toggleFavorite}
              columnType={columnType}
              rowLabel={rowLabel}
              columnLabel={columnLabel}
              showRetail={showRetail}
              showWholesale={showWholesale}
              showDiscount={showDiscount}
            />
          )
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

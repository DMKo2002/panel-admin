'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Upload, ArrowLeft, Pipette, X } from 'lucide-react'
import Link from 'next/link'

// ── Color palette ─────────────────────────────────────────────────────────────
const COLOR_MAP: Record<string, string> = {
  negro: '#1C1C1C', blanco: '#F5F5F0', crema: '#F0EBE1', beige: '#D4C5A9',
  marfil: '#FFFFF0', gris: '#9E9E9E', 'gris claro': '#D0D0D0', 'gris oscuro': '#555555',
  rojo: '#C0392B', bordo: '#7B2D42', vino: '#6B2737', rosa: '#E8A0B0',
  coral: '#E8714A', naranja: '#E8813A', mostaza: '#C8A84B', amarillo: '#F0CC4A',
  azul: '#3A7BC8', 'azul marino': '#1B3A6B', 'azul claro': '#7EB8E0', celeste: '#87CEEB',
  verde: '#4A9B6F', 'verde oscuro': '#2D6A4F', esmeralda: '#2E8B6E', turquesa: '#3AADA8',
  lila: '#B09BC8', violeta: '#8E44AD', morado: '#6C3483',
  camel: '#C19A6B', tabaco: '#8B6355', chocolate: '#5C3A1E', tiza: '#E8E4DC',
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function findNearestColorName(hex: string): string {
  const { r, g, b } = hexToRgb(hex)
  let minDist = Infinity
  let nearest = 'negro'
  for (const [name, colorHex] of Object.entries(COLOR_MAP)) {
    const c = hexToRgb(colorHex)
    const dist = Math.sqrt((r - c.r) ** 2 + (g - c.g) ** 2 + (b - c.b) ** 2)
    if (dist < minDist) { minDist = dist; nearest = name }
  }
  return nearest
}

function colorToHex(colorName: string): string {
  return COLOR_MAP[colorName.toLowerCase().trim()] ?? '#CCCCCC'
}

// ── Image resize: center-crop to 2:3, resize to 600×900, compress to ≤150KB ─
async function resizeImageTo600x900(file: File): Promise<File> {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      canvas.width = 600
      canvas.height = 900
      const ctx = canvas.getContext('2d')!
      const targetRatio = 2 / 3
      const srcRatio = img.width / img.height
      let sx: number, sy: number, sw: number, sh: number
      if (srcRatio > targetRatio) {
        sh = img.height; sw = sh * targetRatio; sx = (img.width - sw) / 2; sy = 0
      } else {
        sw = img.width; sh = sw / targetRatio; sx = 0; sy = (img.height - sh) / 2
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 600, 900)
      const tryCompress = (quality: number) => {
        canvas.toBlob(blob => {
          if (!blob) { resolve(file); return }
          if (blob.size <= 150 * 1024 || quality <= 0.3) {
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
          } else {
            tryCompress(quality - 0.1)
          }
        }, 'image/jpeg', quality)
      }
      tryCompress(0.85)
    }
    img.onerror = () => resolve(file)
    img.src = url
  })
}

interface Variant {
  size: string
  color: string
  sku: string
  stock: number
  retailPrice: number
  retailCompareAt: number
  wholesalePrice: number
  wholesaleMinQty: number
}

const defaultVariant = (): Variant => ({
  size: '', color: '', sku: '', stock: 0,
  retailPrice: 0, retailCompareAt: 0, wholesalePrice: 0, wholesaleMinQty: 6,
})

export default function NuevoProductoPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [categories, setCategories] = useState<{ id: string; name: string; parent_id: string | null }[]>([])

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [variants, setVariants] = useState<Variant[]>([defaultVariant()])

  const [colorPickerFor, setColorPickerFor] = useState<number | null>(null)
  const [pickerHex, setPickerHex] = useState('#1C1C1C')
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      if (!userRow) return
      setTenantId(userRow.tenant_id)
      const { data: cats } = await supabase
        .from('categories')
        .select('id, name, parent_id')
        .eq('tenant_id', userRow.tenant_id)
        .eq('active', true)
        .order('sort_order')
      setCategories(cats ?? [])
    }
    load()
  }, [])

  // Close color picker on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setColorPickerFor(null)
      }
    }
    if (colorPickerFor !== null) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [colorPickerFor])

  function addVariant() {
    setVariants(v => [...v, defaultVariant()])
  }

  function removeVariant(i: number) {
    setVariants(v => v.filter((_, idx) => idx !== i))
  }

  function updateVariant(i: number, field: keyof Variant, value: any) {
    setVariants(v => v.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    const resized = await Promise.all(files.map(resizeImageTo600x900))
    setImageFiles(prev => [...prev, ...resized])
    setImagePreviews(prev => [...prev, ...resized.map(f => URL.createObjectURL(f))])
    e.target.value = ''
  }

  function openColorPicker(i: number, currentColor: string) {
    const hex = colorToHex(currentColor) !== '#CCCCCC' ? colorToHex(currentColor) : '#1C1C1C'
    setPickerHex(hex)
    setColorPickerFor(i)
  }

  function applyColor(i: number, hex: string) {
    updateVariant(i, 'color', findNearestColorName(hex))
    setColorPickerFor(null)
  }

  async function launchEyeDropper(i: number) {
    try {
      // @ts-ignore — EyeDropper is Chrome 95+
      const dropper = new window.EyeDropper()
      const result = await dropper.open()
      applyColor(i, result.sRGBHex)
    } catch { /* cancelled or unsupported */ }
  }

  function slugify(text: string) {
    return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('El nombre es obligatorio'); return }
    if (!tenantId) { setError('No se pudo determinar el tenant'); return }

    setLoading(true)
    setError(null)

    try {
      // Crear producto
      const slug = slugify(name) + '-' + Date.now()
      const { data: product, error: productError } = await supabase
        .from('products')
        .insert({
          tenant_id: tenantId,
          name: name.trim(),
          slug,
          description: description.trim() || null,
          active: true,
          category_id: categoryId || null,
        })
        .select()
        .single()

      if (productError) throw productError

      // Subir imágenes (ya vienen resizadas)
      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i]
        const path = `${tenantId}/${product.id}/${Date.now()}-${i}.jpg`
        const { data: uploadData } = await supabase.storage
          .from('product-images')
          .upload(path, file, { upsert: true, contentType: 'image/jpeg' })
        if (uploadData) {
          const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path)
          await supabase.from('product_images').insert({
            product_id: product.id, url: publicUrl, sort_order: i, is_cover: i === 0,
          })
        }
      }

      // Crear variantes
      for (const v of variants) {
        const { data: variant } = await supabase
          .from('variants')
          .insert({
            product_id: product.id,
            size: v.size || null,
            color: v.color || null,
            sku: v.sku || null,
            stock: v.stock,
          })
          .select()
          .single()

        if (variant) {
          const rules = []
          if (v.retailPrice > 0) rules.push({
            variant_id: variant.id,
            type: 'retail',
            min_qty: 1,
            price: v.retailPrice,
            compare_at_price: v.retailCompareAt > 0 ? v.retailCompareAt : null,
            active: true,
          })
          if (v.wholesalePrice > 0) rules.push({
            variant_id: variant.id,
            type: 'wholesale',
            min_qty: v.wholesaleMinQty,
            price: v.wholesalePrice,
            active: true,
          })
          if (rules.length > 0) await supabase.from('price_rules').insert(rules)
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

      <form onSubmit={handleSubmit} className="px-8 py-6 max-w-3xl space-y-6">

        {/* Datos básicos */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-700">Información básica</h2>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Nombre *</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Campera de cuero negra" required />
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
                  ) : (
                    <option key={parent.id} value={parent.id}>{parent.name}</option>
                  )
                })}
              </select>
            </div>
          )}
        </div>

        {/* Imágenes */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-700">Imágenes</h2>
          <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-zinc-200 rounded-lg cursor-pointer hover:border-violet-300 hover:bg-violet-50 transition-colors">
            <Upload size={20} className="text-zinc-400 mb-1" />
            <span className="text-sm text-zinc-500">Subir fotos del producto</span>
            <span className="text-xs text-zinc-400 mt-0.5">Se redimensionan automáticamente a 600×900</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageChange} />
          </label>
          {imagePreviews.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {imagePreviews.map((src, i) => (
                <div key={i} className="relative">
                  <img src={src} className="w-20 h-20 object-cover rounded-lg border border-zinc-200" />
                  {i === 0 && <span className="absolute bottom-0 left-0 right-0 text-[10px] text-center bg-violet-600 text-white rounded-b-lg py-0.5">Portada</span>}
                  <button
                    type="button"
                    onClick={() => {
                      setImageFiles(prev => prev.filter((_, idx) => idx !== i))
                      setImagePreviews(prev => prev.filter((_, idx) => idx !== i))
                    }}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs items-center justify-center hidden group-hover:flex"
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Variantes */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-700">Variantes y precios</h2>
            <button type="button" onClick={addVariant} className="btn-secondary text-xs py-1.5 px-3">
              <Plus size={13} /> Agregar variante
            </button>
          </div>

          {variants.map((v, i) => (
            <div key={i} className="border border-zinc-100 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-zinc-500">Variante {i + 1}</p>
                {variants.length > 1 && (
                  <button type="button" onClick={() => removeVariant(i)} className="text-zinc-300 hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Talle</label>
                  <input className="input text-sm" value={v.size} onChange={e => updateVariant(i, 'size', e.target.value)} placeholder="S, M, L, 38..." />
                </div>

                {/* Color con picker */}
                <div className="relative">
                  <label className="block text-xs text-zinc-500 mb-1">Color</label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      title="Elegir color"
                      onClick={() => openColorPicker(i, v.color)}
                      style={{ backgroundColor: colorToHex(v.color) }}
                      className="w-8 h-8 rounded border border-zinc-200 flex-shrink-0 shadow-sm hover:scale-105 transition-transform"
                    />
                    <input
                      className="input text-sm flex-1"
                      value={v.color}
                      onChange={e => updateVariant(i, 'color', e.target.value)}
                      placeholder="Negro, Azul..."
                    />
                  </div>

                  {colorPickerFor === i && (
                    <div ref={pickerRef} className="absolute top-full left-0 mt-1 z-50 bg-white border border-zinc-200 rounded-xl shadow-xl p-4 w-64">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-medium text-zinc-700">Elegir color</p>
                        <button type="button" onClick={() => setColorPickerFor(null)} className="text-zinc-400 hover:text-zinc-600">
                          <X size={14} />
                        </button>
                      </div>
                      <div className="flex items-center gap-3 mb-3">
                        <input
                          type="color"
                          value={pickerHex}
                          onChange={e => setPickerHex(e.target.value)}
                          className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                        />
                        <div className="flex-1">
                          <p className="text-xs text-zinc-500 mb-0.5">Color seleccionado</p>
                          <p className="text-sm font-medium text-zinc-800 capitalize">{findNearestColorName(pickerHex)}</p>
                          <p className="text-xs text-zinc-400 font-mono">{pickerHex}</p>
                        </div>
                      </div>
                      {'EyeDropper' in window && (
                        <button
                          type="button"
                          onClick={() => launchEyeDropper(i)}
                          className="w-full flex items-center justify-center gap-2 text-xs py-2 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors mb-3"
                        >
                          <Pipette size={13} />
                          Cuentagotas — clickeá en la foto
                        </button>
                      )}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {Object.entries(COLOR_MAP).map(([name, hex]) => (
                          <button
                            key={name}
                            type="button"
                            title={name}
                            onClick={() => setPickerHex(hex)}
                            style={{ backgroundColor: hex }}
                            className={`w-5 h-5 rounded-full border transition-all hover:scale-110 ${pickerHex === hex ? 'border-violet-500 scale-110' : 'border-zinc-200'}`}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => applyColor(i, pickerHex)}
                        className="w-full btn-primary text-xs py-2 justify-center"
                      >
                        Aplicar — {findNearestColorName(pickerHex)}
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Stock</label>
                  <input
                    className="input text-sm"
                    type="number"
                    min="0"
                    value={v.stock || ''}
                    placeholder="0"
                    onChange={e => updateVariant(i, 'stock', parseInt(e.target.value, 10) || 0)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Precio minorista $</label>
                  <input className="input text-sm" type="number" min="0" value={v.retailPrice || ''} onChange={e => updateVariant(i, 'retailPrice', parseFloat(e.target.value) || 0)} placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Precio anterior $ <span className="text-zinc-400 font-normal">(tachado · opcional)</span></label>
                  <input className="input text-sm" type="number" min="0" value={v.retailCompareAt || ''} onChange={e => updateVariant(i, 'retailCompareAt', parseFloat(e.target.value) || 0)} placeholder="Ej: 8000" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Precio mayorista $</label>
                  <input className="input text-sm" type="number" min="0" value={v.wholesalePrice || ''} onChange={e => updateVariant(i, 'wholesalePrice', parseFloat(e.target.value) || 0)} placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Cant. mín. mayorista</label>
                  <input className="input text-sm" type="number" min="1" value={v.wholesaleMinQty} onChange={e => updateVariant(i, 'wholesaleMinQty', parseInt(e.target.value, 10) || 1)} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">{error}</div>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={loading} className="btn-primary disabled:opacity-60">
            {loading ? 'Guardando...' : 'Guardar producto'}
          </button>
          <Link href="/dashboard/productos" className="btn-secondary">Cancelar</Link>
        </div>

      </form>
    </div>
  )
}

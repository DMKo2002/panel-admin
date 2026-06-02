'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Upload, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface VariantAttribute {
  key: string
  label: string
  type: 'text' | 'select'
  options?: string[]
}

interface Variant {
  [key: string]: any
  stock: number
  retailPrice: number
  wholesalePrice: number
  wholesaleMinQty: number
}

export default function NuevoProductoPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [variantAttributes, setVariantAttributes] = useState<VariantAttribute[]>([])

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])

  const defaultVariant = () => {
    const base: Variant = { stock: 0, retailPrice: 0, wholesalePrice: 0, wholesaleMinQty: 6 }
    variantAttributes.forEach(attr => { base[attr.key] = '' })
    return base
  }

  const [variants, setVariants] = useState<Variant[]>([
    { stock: 0, retailPrice: 0, wholesalePrice: 0, wholesaleMinQty: 6 }
  ])

  useEffect(() => {
    async function loadAttributes() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      if (!userRow?.tenant_id) return
      const { data: config } = await supabase
        .from('store_config')
        .select('variant_attributes')
        .eq('tenant_id', userRow.tenant_id)
        .single()

      if (config?.variant_attributes) {
        setVariantAttributes(config.variant_attributes)
        // Inicializar variante con los atributos del tenant
        const base: Variant = { stock: 0, retailPrice: 0, wholesalePrice: 0, wholesaleMinQty: 6 }
        config.variant_attributes.forEach((attr: VariantAttribute) => { base[attr.key] = '' })
        setVariants([base])
      }
    }
    loadAttributes()
  }, [])

  function addVariant() {
    setVariants(v => [...v, defaultVariant()])
  }

  function removeVariant(i: number) {
    setVariants(v => v.filter((_, idx) => idx !== i))
  }

  function updateVariant(i: number, field: string, value: any) {
    setVariants(v => v.map((variant, idx) => idx === i ? { ...variant, [field]: value } : variant))
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setImageFiles(prev => [...prev, ...files])
    setImagePreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))])
  }

  function slugify(text: string) {
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('El nombre es obligatorio'); return }
    if (variants.length === 0) { setError('Agregá al menos una variante'); return }

    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')
      const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      const tenantId = userRow?.tenant_id
      if (!tenantId) throw new Error('Tenant no encontrado')

      // Crear producto
      const slug = slugify(name) + '-' + Date.now()
      const { data: product, error: productError } = await supabase
        .from('products')
        .insert({ tenant_id: tenantId, name: name.trim(), slug, description: description.trim() || null })
        .select()
        .single()

      if (productError) throw productError

      // Subir imágenes
      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i]
        const ext = file.name.split('.').pop()
        const path = `${tenantId}/${product.id}/${Date.now()}-${i}.${ext}`
        const { data: uploadData } = await supabase.storage.from('product-images').upload(path, file, { upsert: true })
        if (uploadData) {
          const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path)
          await supabase.from('product_images').insert({
            product_id: product.id, url: publicUrl, sort_order: i, is_cover: i === 0,
          })
        }
      }

      // Crear variantes con atributos dinámicos
      for (const v of variants) {
        const attributes: Record<string, any> = {}
        variantAttributes.forEach(attr => { attributes[attr.key] = v[attr.key] || '' })

        const { data: variant } = await supabase
          .from('variants')
          .insert({
            product_id: product.id,
            // Mantener size/color para compatibilidad
            size: attributes['talle'] || attributes['numero'] || null,
            color: attributes['color'] || null,
            attributes,
            stock: v.stock,
          })
          .select()
          .single()

        if (variant) {
          const rules = []
          if (v.retailPrice > 0) rules.push({ variant_id: variant.id, type: 'retail', min_qty: 1, price: v.retailPrice })
          if (v.wholesalePrice > 0) rules.push({ variant_id: variant.id, type: 'wholesale', min_qty: v.wholesaleMinQty, price: v.wholesalePrice })
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
        </div>

        {/* Imágenes */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-700">Imágenes</h2>
          <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-zinc-200 rounded-lg cursor-pointer hover:border-violet-300 hover:bg-violet-50 transition-colors">
            <Upload size={20} className="text-zinc-400 mb-1" />
            <span className="text-sm text-zinc-500">Subir fotos del producto</span>
            <span className="text-xs text-zinc-400 mt-0.5">JPG, PNG, WebP</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageChange} />
          </label>
          {imagePreviews.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {imagePreviews.map((src, i) => (
                <div key={i} className="relative">
                  <img src={src} className="w-20 h-20 object-cover rounded-lg border border-zinc-200" />
                  {i === 0 && <span className="absolute bottom-0 left-0 right-0 text-[10px] text-center bg-violet-600 text-white rounded-b-lg py-0.5">Portada</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Variantes dinámicas */}
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

              {/* Atributos dinámicos del tenant */}
              <div className={`grid gap-3 ${variantAttributes.length > 0 ? `grid-cols-${Math.min(variantAttributes.length, 3)}` : 'grid-cols-2'}`}>
                {variantAttributes.length > 0 ? (
                  variantAttributes.map(attr => (
                    <div key={attr.key}>
                      <label className="block text-xs text-zinc-500 mb-1">{attr.label}</label>
                      {attr.type === 'select' && attr.options ? (
                        <select
                          className="input text-sm"
                          value={v[attr.key] ?? ''}
                          onChange={e => updateVariant(i, attr.key, e.target.value)}
                        >
                          <option value="">Elegir {attr.label.toLowerCase()}...</option>
                          {attr.options.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="input text-sm"
                          value={v[attr.key] ?? ''}
                          onChange={e => updateVariant(i, attr.key, e.target.value)}
                          placeholder={attr.label}
                        />
                      )}
                    </div>
                  ))
                ) : (
                  // Fallback si no hay atributos configurados
                  <>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Talle</label>
                      <input className="input text-sm" value={v.talle ?? ''} onChange={e => updateVariant(i, 'talle', e.target.value)} placeholder="S, M, L, 38..." />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Color</label>
                      <input className="input text-sm" value={v.color ?? ''} onChange={e => updateVariant(i, 'color', e.target.value)} placeholder="Negro, Azul..." />
                    </div>
                  </>
                )}

                {/* Stock siempre presente */}
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Stock</label>
                  <input className="input text-sm" type="number" min="0" value={v.stock} onChange={e => updateVariant(i, 'stock', parseInt(e.target.value) || 0)} />
                </div>
              </div>

              {/* Precios */}
              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-zinc-50">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Precio minorista $</label>
                  <input className="input text-sm" type="number" min="0" value={v.retailPrice || ''} onChange={e => updateVariant(i, 'retailPrice', parseFloat(e.target.value) || 0)} placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Precio mayorista $</label>
                  <input className="input text-sm" type="number" min="0" value={v.wholesalePrice || ''} onChange={e => updateVariant(i, 'wholesalePrice', parseFloat(e.target.value) || 0)} placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Cant. mín. mayorista</label>
                  <input className="input text-sm" type="number" min="1" value={v.wholesaleMinQty} onChange={e => updateVariant(i, 'wholesaleMinQty', parseInt(e.target.value) || 1)} />
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

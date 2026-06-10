'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Trash2, Plus, Upload, ImageOff } from 'lucide-react'

interface Variant {
  id?: string
  size: string
  color: string
  sku: string
  stock: number
  retailPrice: number
  retailCompareAt: number   // precio anterior (tachado), 0 = sin descuento
  wholesalePrice: number
  wholesaleMinQty: number
  _delete?: boolean
}

export default function EditarProductoPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [active, setActive] = useState(true)
  const [images, setImages] = useState<{ id: string; url: string; is_cover: boolean }[]>([])
  const [newImageFiles, setNewImageFiles] = useState<File[]>([])
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([])
  const [variants, setVariants] = useState<Variant[]>([])

  useEffect(() => {
    async function load() {
      const { data: product } = await supabase
        .from('products')
        .select('*, product_images(*), variants(*, price_rules(*))')
        .eq('id', id)
        .single()

      if (!product) { router.push('/dashboard/productos'); return }

      setName(product.name)
      setDescription(product.description ?? '')
      setActive(product.active)
      setImages(product.product_images ?? [])

      const mappedVariants: Variant[] = (product.variants ?? []).map((v: any) => {
        const retail = v.price_rules?.find((p: any) => p.type === 'retail')
        const wholesale = v.price_rules?.find((p: any) => p.type === 'wholesale')
        return {
          id: v.id,
          size: v.size ?? '',
          color: v.color ?? '',
          sku: v.sku ?? '',
          stock: v.stock,
          retailPrice: retail?.price ?? 0,
          retailCompareAt: retail?.compare_at_price ?? 0,
          wholesalePrice: wholesale?.price ?? 0,
          wholesaleMinQty: wholesale?.min_qty ?? 6,
        }
      })
      setVariants(mappedVariants.length > 0 ? mappedVariants : [
        { size: '', color: '', sku: '', stock: 0, retailPrice: 0, retailCompareAt: 0, wholesalePrice: 0, wholesaleMinQty: 6 }
      ])
      setLoading(false)
    }
    load()
  }, [id])

  function slugify(text: string) {
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  }

  function addVariant() {
    setVariants(v => [...v, { size: '', color: '', sku: '', stock: 0, retailPrice: 0, retailCompareAt: 0, wholesalePrice: 0, wholesaleMinQty: 6 }])
  }

  function removeVariant(i: number) {
    setVariants(v => v.map((item, idx) => idx === i ? { ...item, _delete: true } : item))
  }

  function updateVariant(i: number, field: keyof Variant, value: any) {
    setVariants(v => v.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setNewImageFiles(prev => [...prev, ...files])
    setNewImagePreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))])
  }

  async function removeExistingImage(imgId: string) {
    await supabase.from('product_images').delete().eq('id', imgId)
    setImages(prev => prev.filter(i => i.id !== imgId))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')
      const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      const tenantId = userRow?.tenant_id

      // Actualizar producto
      await supabase.from('products').update({
        name: name.trim(),
        slug: slugify(name) + '-' + id.slice(0, 6),
        description: description.trim() || null,
        active,
      }).eq('id', id)

      // Subir nuevas imágenes
      for (let i = 0; i < newImageFiles.length; i++) {
        const file = newImageFiles[i]
        const ext = file.name.split('.').pop()
        const path = `${tenantId}/${id}/${Date.now()}-${i}.${ext}`
        const { data: uploadData } = await supabase.storage.from('product-images').upload(path, file, { upsert: true })
        if (uploadData) {
          const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path)
          await supabase.from('product_images').insert({
            product_id: id,
            url: publicUrl,
            sort_order: images.length + i,
            is_cover: images.length === 0 && i === 0,
          })
        }
      }

      // Actualizar variantes
      for (const v of variants) {
        if (v._delete && v.id) {
          await supabase.from('variants').delete().eq('id', v.id)
          continue
        }
        if (v._delete) continue

        if (v.id) {
          // Actualizar existente
          await supabase.from('variants').update({
            size: v.size || null,
            color: v.color || null,
            sku: v.sku || null,
            stock: v.stock,
          }).eq('id', v.id)

          // Borrar price_rules viejos y recrear
          await supabase.from('price_rules').delete().eq('variant_id', v.id)
          const rules = []
          if (v.retailPrice > 0) rules.push({
            variant_id: v.id, type: 'retail', min_qty: 1, price: v.retailPrice,
            compare_at_price: v.retailCompareAt > 0 ? v.retailCompareAt : null,
          })
          if (v.wholesalePrice > 0) rules.push({ variant_id: v.id, type: 'wholesale', min_qty: v.wholesaleMinQty, price: v.wholesalePrice })
          if (rules.length > 0) await supabase.from('price_rules').insert(rules)
        } else {
          // Crear nueva variante
          const { data: newVariant } = await supabase.from('variants').insert({
            product_id: id,
            size: v.size || null,
            color: v.color || null,
            sku: v.sku || null,
            stock: v.stock,
          }).select().single()

          if (newVariant) {
            const rules = []
            if (v.retailPrice > 0) rules.push({
              variant_id: newVariant.id, type: 'retail', min_qty: 1, price: v.retailPrice,
              compare_at_price: v.retailCompareAt > 0 ? v.retailCompareAt : null,
            })
            if (v.wholesalePrice > 0) rules.push({ variant_id: newVariant.id, type: 'wholesale', min_qty: v.wholesaleMinQty, price: v.wholesalePrice })
            if (rules.length > 0) await supabase.from('price_rules').insert(rules)
          }
        }
      }

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
      await supabase.from('products').update({ active: false }).eq('id', id)
      router.push('/dashboard/productos')
      router.refresh()
    } catch (err: any) {
      setError(err.message)
      setDeleting(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-zinc-400 text-sm">Cargando producto...</p>
    </div>
  )

  const activeVariants = variants.filter(v => !v._delete)

  return (
    <div>
      <div className="px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/productos" className="text-zinc-400 hover:text-zinc-600 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-xl font-semibold text-zinc-900">Editar producto</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="btn-secondary text-red-500 hover:text-red-600 hover:border-red-200"
          >
            <Trash2 size={15} />
            Eliminar
          </button>
          <button
            form="edit-form"
            type="submit"
            disabled={saving}
            className="btn-primary disabled:opacity-60"
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {/* Modal de confirmación de borrado */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-zinc-200 p-6 max-w-sm w-full mx-4 shadow-xl">
            <h2 className="text-base font-semibold text-zinc-900 mb-2">¿Eliminar producto?</h2>
            <p className="text-sm text-zinc-500 mb-5">El producto se va a desactivar. Podés reactivarlo después desde la base de datos.</p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 btn-primary bg-red-500 hover:bg-red-600 justify-center disabled:opacity-60"
              >
                {deleting ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="flex-1 btn-secondary justify-center">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <form id="edit-form" onSubmit={handleSave} className="px-8 py-6 max-w-3xl space-y-6">

        {/* Datos básicos */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-700">Información básica</h2>
            <label className="flex items-center gap-2 text-sm text-zinc-500 cursor-pointer">
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="rounded" />
              Producto activo
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Nombre *</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Descripción</label>
            <textarea className="input resize-none" rows={3} value={description} onChange={e => setDescription(e.target.value)} />
          </div>
        </div>

        {/* Imágenes existentes */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-700">Imágenes</h2>

          {images.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {images.map((img, i) => (
                <div key={img.id} className="relative group">
                  <img src={img.url} className="w-20 h-20 object-cover rounded-lg border border-zinc-200" />
                  {img.is_cover && (
                    <span className="absolute bottom-0 left-0 right-0 text-[10px] text-center bg-violet-600 text-white rounded-b-lg py-0.5">
                      Portada
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeExistingImage(img.id)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs items-center justify-center hidden group-hover:flex"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-zinc-200 rounded-lg cursor-pointer hover:border-violet-300 hover:bg-violet-50 transition-colors">
            <Upload size={16} className="text-zinc-400 mb-1" />
            <span className="text-sm text-zinc-500">Agregar más fotos</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageChange} />
          </label>

          {newImagePreviews.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {newImagePreviews.map((src, i) => (
                <img key={i} src={src} className="w-20 h-20 object-cover rounded-lg border border-violet-200" />
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

          {activeVariants.map((v, i) => {
            const realIdx = variants.indexOf(v)
            return (
              <div key={v.id ?? i} className="border border-zinc-100 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-zinc-500">Variante {i + 1}</p>
                  {activeVariants.length > 1 && (
                    <button type="button" onClick={() => removeVariant(realIdx)} className="text-zinc-300 hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Talle</label>
                    <input className="input text-sm" value={v.size} onChange={e => updateVariant(realIdx, 'size', e.target.value)} placeholder="S, M, L, 38..." />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Color</label>
                    <input className="input text-sm" value={v.color} onChange={e => updateVariant(realIdx, 'color', e.target.value)} placeholder="Negro, Azul..." />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Stock</label>
                    <input className="input text-sm" type="number" min="0" value={v.stock} onChange={e => updateVariant(realIdx, 'stock', parseInt(e.target.value) || 0)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Precio minorista $</label>
                    <input className="input text-sm" type="number" min="0" value={v.retailPrice || ''} onChange={e => updateVariant(realIdx, 'retailPrice', parseFloat(e.target.value) || 0)} placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">
                      Precio anterior $ <span className="text-zinc-400 font-normal">(tachado · opcional)</span>
                    </label>
                    <input
                      className="input text-sm"
                      type="number"
                      min="0"
                      value={v.retailCompareAt || ''}
                      onChange={e => updateVariant(realIdx, 'retailCompareAt', parseFloat(e.target.value) || 0)}
                      placeholder="Ej: 8000 → muestra tachado"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Precio mayorista $</label>
                    <input className="input text-sm" type="number" min="0" value={v.wholesalePrice || ''} onChange={e => updateVariant(realIdx, 'wholesalePrice', parseFloat(e.target.value) || 0)} placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Cant. mín. mayorista</label>
                    <input className="input text-sm" type="number" min="1" value={v.wholesaleMinQty} onChange={e => updateVariant(realIdx, 'wholesaleMinQty', parseInt(e.target.value) || 1)} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">{error}</div>
        )}

      </form>
    </div>
  )
}

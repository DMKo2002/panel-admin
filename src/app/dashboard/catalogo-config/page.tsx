'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { StoreConfig } from '@/lib/types'
import { Plus, Trash2, X } from 'lucide-react'

interface VariantAttribute {
  key: string
  label: string
  type: 'text' | 'select'
  options?: string[]
}

export default function CatalogoConfigPage() {
  const supabase = createClient()
  const [config, setConfig] = useState<StoreConfig | null>(null)
  const [attributes, setAttributes] = useState<VariantAttribute[]>([])
  const [savingAttrs, setSavingAttrs] = useState(false)
  const [savedAttrs, setSavedAttrs] = useState(false)
  const [errorAttrs, setErrorAttrs] = useState<string | null>(null)
  const [newOption, setNewOption] = useState<Record<number, string>>({})
  const [savingFormat, setSavingFormat] = useState(false)
  const [savedFormat, setSavedFormat] = useState(false)
  const [errorFormat, setErrorFormat] = useState<string | null>(null)
  const [savingVariants, setSavingVariants] = useState(false)
  const [savedVariants, setSavedVariants] = useState(false)
  const [errorVariants, setErrorVariants] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: _userRows } = await supabase.from('users').select('tenant_id').eq('id', user.id).limit(1)
      const userRow = _userRows?.[0]
      if (!userRow) return
      const { data } = await supabase.from('store_config').select('*').eq('tenant_id', userRow.tenant_id).single()
      setConfig(data)
      if ((data as any)?.variant_attributes) setAttributes((data as any).variant_attributes as any)
    }
    load()
  }, [])

  function update(field: keyof StoreConfig, value: any) {
    setConfig(c => c ? { ...c, [field]: value } : c)
  }

  async function handleSaveAttributes() {
    if (!config) return
    setSavingAttrs(true)
    setErrorAttrs(null)
    const { error } = await supabase.from('store_config').update({ variant_attributes: attributes }).eq('id', config.id)
    setSavingAttrs(false)
    if (error) {
      console.error('Error guardando atributos:', error)
      setErrorAttrs(error.message || 'No se pudo guardar. Reintentá o contactá a soporte.')
      return
    }
    setSavedAttrs(true); setTimeout(() => setSavedAttrs(false), 2000)
  }

  async function handleSaveFormat() {
    if (!config) return
    setSavingFormat(true)
    setErrorFormat(null)
    const { error } = await supabase.from('store_config').update({
      product_image_ratio: (config as any).product_image_ratio ?? '2:3',
      weight_unit:      (config as any).weight_unit ?? 'kg',
    }).eq('id', config.id)
    setSavingFormat(false)
    if (error) {
      console.error('Error guardando formato de catálogo:', error)
      setErrorFormat(error.message || 'No se pudo guardar. Reintentá o contactá a soporte.')
      return
    }
    setSavedFormat(true); setTimeout(() => setSavedFormat(false), 2000)
  }

  async function handleSaveVariants() {
    if (!config) return
    setSavingVariants(true)
    setErrorVariants(null)
    const { error } = await supabase.from('store_config').update({
      variant_mode: (config as any).variant_mode ?? 'sizes_colors',
      variant_column_type: (config as any).variant_column_type ?? 'color',
    }).eq('id', config.id)
    setSavingVariants(false)
    if (error) {
      console.error('Error guardando config de variantes:', error)
      setErrorVariants(error.message || 'No se pudo guardar. Reintentá o contactá a soporte.')
      return
    }
    setSavedVariants(true); setTimeout(() => setSavedVariants(false), 2000)
  }

  function addAttribute() {
    setAttributes(prev => [...prev, { key: `attr_${Date.now()}`, label: '', type: 'text', options: [] }])
  }
  function removeAttribute(i: number) {
    setAttributes(prev => prev.filter((_, idx) => idx !== i))
  }
  function updateAttribute(i: number, field: keyof VariantAttribute, value: any) {
    setAttributes(prev => prev.map((attr, idx) => {
      if (idx !== i) return attr
      const updated = { ...attr, [field]: value }
      if (field === 'label') updated.key = value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '')
      if (field === 'type' && value === 'select' && !updated.options) updated.options = []
      return updated
    }))
  }
  function addOption(attrIdx: number) {
    const val = newOption[attrIdx]?.trim()
    if (!val) return
    setAttributes(prev => prev.map((attr, idx) => idx !== attrIdx ? attr : { ...attr, options: [...(attr.options ?? []), val] }))
    setNewOption(prev => ({ ...prev, [attrIdx]: '' }))
  }
  function removeOption(attrIdx: number, optIdx: number) {
    setAttributes(prev => prev.map((attr, idx) => idx !== attrIdx ? attr : { ...attr, options: (attr.options ?? []).filter((_, i) => i !== optIdx) }))
  }

  return (
    <div>
      <div className="sticky top-0 z-10 px-8 py-6 border-b border-zinc-200 bg-white">
        <h1 className="text-xl font-semibold text-zinc-900">Catálogo</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Cómo se cargan y muestran tus productos</p>
      </div>

      <div className="px-8 py-6 max-w-2xl space-y-5">

        {/* Tabla de variantes */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-700">Tabla de variantes</h2>
              <p className="text-xs text-zinc-400 mt-0.5">Cómo se cargan las variantes (talle/color) de cada producto</p>
            </div>
            <button onClick={handleSaveVariants} disabled={savingVariants} className="btn-secondary text-xs py-1.5 disabled:opacity-60">
              {savedVariants ? '✓ Guardado' : savingVariants ? 'Guardando...' : 'Guardar'}
            </button>
            {errorVariants && <p className="text-xs text-red-600 mt-1.5">{errorVariants}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">Usar tabla de variantes</label>
            <select className="input max-w-xs" value={(config as any)?.variant_mode ?? 'sizes_colors'} onChange={e => update('variant_mode' as any, e.target.value)}>
              <option value="sizes_colors">Sí — tabla con filas y columnas (ej: talle × color)</option>
              <option value="simple">No — una sola variante por producto (ej: cosmética)</option>
            </select>
            <p className="text-xs text-zinc-400 mt-1">Con "No", cada producto tiene un solo stock y precio, sin filas ni columnas.</p>
          </div>
          {((config as any)?.variant_mode ?? 'sizes_colors') === 'sizes_colors' && (
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Tipo de columna</label>
              <select className="input max-w-xs" value={(config as any)?.variant_column_type ?? 'color'} onChange={e => update('variant_column_type' as any, e.target.value)}>
                <option value="color">Color — selector de color con paleta y cuentagotas</option>
                <option value="text">Texto libre — sin selector de color (ej: modelo, material)</option>
              </select>
              <p className="text-xs text-zinc-400 mt-1">
                Las filas (ej: talles) siempre son texto libre. Esto solo cambia cómo se cargan las columnas.
                {(config as any)?.variant_column_type === 'text' && ' Nota: hasta que se actualice la tienda, las columnas de texto libre pueden mostrar un punto de color gris al lado del nombre — es solo visual, no afecta el stock ni el precio.'}
              </p>
            </div>
          )}
        </div>

        {/* Atributos de productos */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-700">Atributos de productos</h2>
              <p className="text-xs text-zinc-400 mt-0.5">Campos que aparecen al cargar cada producto</p>
            </div>
            <button onClick={handleSaveAttributes} disabled={savingAttrs} className="btn-secondary text-xs py-1.5 disabled:opacity-60">
              {savedAttrs ? '✓ Guardado' : savingAttrs ? 'Guardando...' : 'Guardar atributos'}
            </button>
            {errorAttrs && <p className="text-xs text-red-600 mt-1.5">{errorAttrs}</p>}
          </div>
          <div className="space-y-3">
            {attributes.map((attr, i) => (
              <div key={i} className="border border-zinc-100 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Nombre del atributo</label>
                      <input className="input text-sm" value={attr.label} onChange={e => updateAttribute(i, 'label', e.target.value)} placeholder="Ej: Talle, Color..." />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Tipo</label>
                      <select className="input text-sm" value={attr.type} onChange={e => updateAttribute(i, 'type', e.target.value as any)}>
                        <option value="text">Texto libre</option>
                        <option value="select">Lista de opciones</option>
                      </select>
                    </div>
                  </div>
                  <button onClick={() => removeAttribute(i)} className="text-zinc-300 hover:text-red-400 transition-colors mt-6 flex-shrink-0"><Trash2 size={15} /></button>
                </div>
                {attr.type === 'select' && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-2">Opciones disponibles</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {(attr.options ?? []).map((opt, optIdx) => (
                        <span key={optIdx} className="inline-flex items-center gap-1 px-2.5 py-1 bg-zinc-100 rounded-full text-xs text-zinc-700">
                          {opt}
                          <button onClick={() => removeOption(i, optIdx)} className="text-zinc-400 hover:text-red-400"><X size={11} /></button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input className="input text-sm flex-1" value={newOption[i] ?? ''} onChange={e => setNewOption(prev => ({ ...prev, [i]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(i) } }} placeholder="Nueva opción..." />
                      <button onClick={() => addOption(i)} className="btn-secondary text-xs px-3 py-1.5 flex-shrink-0"><Plus size={13} /> Agregar</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <button onClick={addAttribute} className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 transition-colors">
            <Plus size={14} /> Agregar atributo
          </button>
        </div>

        {/* Formato y unidades */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-700">Formato y unidades</h2>
              <p className="text-xs text-zinc-400 mt-0.5">Cómo se procesan las fotos de producto y en qué unidad se carga el peso</p>
            </div>
            <button onClick={handleSaveFormat} disabled={savingFormat} className="btn-secondary text-xs py-1.5 disabled:opacity-60">
              {savedFormat ? '✓ Guardado' : savingFormat ? 'Guardando...' : 'Guardar'}
            </button>
            {errorFormat && <p className="text-xs text-red-600 mt-1.5">{errorFormat}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Formato de imagen de producto</label>
              <select className="input" value={(config as any)?.product_image_ratio ?? '2:3'} onChange={e => update('product_image_ratio' as any, e.target.value)}>
                <option value="2:3">Retrato (2:3) — indumentaria</option>
                <option value="1:1">Cuadrada (1:1) — ej. cosmética</option>
              </select>
              <p className="text-xs text-zinc-400 mt-1">Define cómo se recortan las fotos al subirlas y cómo se ven en el grid de la tienda.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Unidad de peso</label>
              <select className="input" value={(config as any)?.weight_unit ?? 'kg'} onChange={e => update('weight_unit' as any, e.target.value)}>
                <option value="kg">Kilogramos (kg)</option>
                <option value="g">Gramos (g)</option>
                <option value="ml">Mililitros (ml)</option>
              </select>
              <p className="text-xs text-zinc-400 mt-1">Solo cambia la etiqueta del campo "Peso" en la ficha de producto.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

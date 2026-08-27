'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { StoreConfig } from '@/lib/types'
import { Plus, Trash2, X } from 'lucide-react'
import { useTutorial, type TutorialStep } from '@/components/tutorial/TutorialProvider'
import TutorialHint from '@/components/tutorial/TutorialHint'
import PageTutorialButton from '@/components/tutorial/PageTutorialButton'

interface VariantAttribute {
  key: string
  label: string
  type: 'text' | 'select'
  options?: string[]
}

// Un solo array fuente de verdad: lo usa tanto el tour completo de la página
// (Instrucciones de uso, en el header) como los botones (?) individuales.
const CATALOGO_STEPS: TutorialStep[] = [
  {
    id: 'catalogo-variants',
    target: '[data-tutorial="catalogo-variants"]',
    title: 'Tabla de variantes',
    content: 'Definí cómo se cargan las variantes de cada producto. Con la tabla activada armás combinaciones tipo talle × color; si tu catálogo no usa esa lógica (ej. bazaar, comestibles, cosmética), elegí "No" para cargar las presentaciones en una lista de texto libre (ej. suelto, pack x5, caja x40), cada una con su propio stock y precio. También podés cambiar la columna de la tabla a "Texto libre" si no es color (ej. modelo, ancho) y renombrar filas/columnas.',
  },
  {
    id: 'catalogo-attributes',
    target: '[data-tutorial="catalogo-attributes"]',
    title: 'Atributos de productos',
    content: 'Agregá campos extra que se cargan en cada producto (ej. material, género). Pueden ser de texto libre o una lista de opciones fijas para elegir — útil para mantener los datos consistentes entre productos.',
  },
  {
    id: 'catalogo-format',
    target: '[data-tutorial="catalogo-format"]',
    title: 'Formato y unidades',
    content: 'El formato de imagen define cómo se recortan las fotos al subirlas y cómo se ven en el grid de la tienda (retrato para indumentaria, cuadrada para otros rubros). La unidad de peso solo cambia la etiqueta del campo "Peso" en la ficha de producto.',
  },
]

export default function CatalogoConfigPage() {
  const supabase = createClient()
  const { registerSteps } = useTutorial()
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
  const [savingAll, setSavingAll] = useState(false)
  const [savedAll, setSavedAll] = useState(false)
  const [errorAll, setErrorAll] = useState<string | null>(null)

  useEffect(() => {
    registerSteps('catalogo-config', CATALOGO_STEPS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: _userRows } = await supabase.from('users').select('tenant_id').eq('id', user.id).limit(1)
      const userRow = _userRows?.[0]
      if (!userRow) return
      // Columnas explícitas, no select('*') — store_config tiene permisos
      // por columna, un select('*') devuelve 403 y esta página se queda sin
      // datos en silencio. Ver CLAUDE.md, sección de permisos de store_config.
      const { data, error } = await supabase
        .from('store_config')
        .select('id, variant_attributes, product_image_ratio, weight_unit, dimension_unit, variant_mode, variant_column_type, variant_row_label, variant_column_label')
        .eq('tenant_id', userRow.tenant_id)
        .single()
      if (error) {
        console.error('Error cargando configuracion de catalogo:', error)
        setErrorAll('No se pudo cargar la configuración. Recargá la página o contactá a soporte.')
        return
      }
      // `data` solo trae las 8 columnas seleccionadas arriba (a propósito, por
      // permisos), no el StoreConfig completo — mismo criterio de cast que la
      // línea de abajo, no cambia nada en tiempo de ejecución.
      setConfig(data as any)
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
      dimension_unit:   (config as any).dimension_unit ?? 'cm',
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
    const mode = (config as any).variant_mode ?? 'sizes_colors'
    const { error } = await supabase.from('store_config').update({
      variant_mode: mode,
      // En modo 'simple' no hay eje de color — forzamos 'text' para que el
      // título de variante (variant_row_label) se muestre como encabezado
      // en la tienda en vez de quedar pisado por el "Talle" hardcodeado que
      // usa AddToCartButton cuando columnType es 'color'.
      variant_column_type: mode === 'simple' ? 'text' : ((config as any).variant_column_type ?? 'color'),
      variant_row_label: (config as any).variant_row_label?.trim() || null,
      variant_column_label: (config as any).variant_column_label?.trim() || null,
    }).eq('id', config.id)
    setSavingVariants(false)
    if (error) {
      console.error('Error guardando config de variantes:', error)
      setErrorVariants(error.message || 'No se pudo guardar. Reintentá o contactá a soporte.')
      return
    }
    setSavedVariants(true); setTimeout(() => setSavedVariants(false), 2000)
  }

  // Guarda las 3 secciones de la página a la vez — mismo patrón que el botón
  // "Guardar todos los cambios" de Apariencia, para que Catálogo no sea la
  // única página de Configuración sin un botón único arriba.
  async function handleSaveAll() {
    setSavingAll(true); setErrorAll(null); setSavedAll(false)
    await Promise.all([handleSaveAttributes(), handleSaveFormat(), handleSaveVariants()])
    setSavingAll(false)
    if (!config) return
    setSavedAll(true)
    setTimeout(() => setSavedAll(false), 2000)
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
      <div className="sticky top-0 z-10 px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Catálogo</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Cómo se cargan y muestran tus productos</p>
          <PageTutorialButton pageKey="catalogo-config" />
        </div>
        <button onClick={handleSaveAll} disabled={savingAll} className="btn-primary disabled:opacity-60">
          {savedAll ? '✓ Guardado' : savingAll ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      <div className="px-8 py-6 max-w-2xl space-y-5">

        {/* Tabla de variantes */}
        <div data-tutorial="catalogo-variants" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-semibold text-zinc-700">Tabla de variantes</h2>
                <TutorialHint pageKey="catalogo-config" step={CATALOGO_STEPS[0]} />
              </div>
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
              <option value="simple">No — variantes en texto libre, sin cruce de filas y columnas</option>
            </select>
            <p className="text-xs text-zinc-400 mt-1">Con "No", cada producto puede tener varias presentaciones con nombre libre (ej: "Pack x5", "Caja x40"), cada una con su propio stock y precio.</p>
          </div>
          {((config as any)?.variant_mode ?? 'sizes_colors') === 'sizes_colors' && (
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Tipo de columna</label>
              <select className="input max-w-xs" value={(config as any)?.variant_column_type ?? 'color'} onChange={e => update('variant_column_type' as any, e.target.value)}>
                <option value="color">Color — selector de color con paleta y cuentagotas</option>
                <option value="text">Texto libre — sin selector de color (ej: modelo, material, ancho)</option>
              </select>
              <p className="text-xs text-zinc-400 mt-1">
                En modo "Color" las filas y columnas siempre dicen "Talle" y "Color", igual que hoy.
              </p>
            </div>
          )}
          {((config as any)?.variant_mode ?? 'sizes_colors') === 'simple' && (
            <div className="pt-3 border-t border-zinc-100">
              <label className="block text-xs font-medium text-zinc-600 mb-1">Título de variante por defecto</label>
              <input
                className="input max-w-xs"
                value={(config as any)?.variant_row_label ?? ''}
                onChange={e => update('variant_row_label' as any, e.target.value)}
                placeholder="Ej: Cantidad, Sabor, Contenido neto..."
              />
              <p className="text-xs text-zinc-400 mt-1">
                Encabezado que se muestra arriba de las presentaciones en la tienda (ej: "Cantidad" con "x1" / "Caja x24" abajo). Se puede pisar por producto al cargarlo.
              </p>
            </div>
          )}
          {((config as any)?.variant_mode ?? 'sizes_colors') === 'sizes_colors' && (config as any)?.variant_column_type === 'text' && (
            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-zinc-100">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Nombre de las filas</label>
                <input
                  className="input"
                  value={(config as any)?.variant_row_label ?? ''}
                  onChange={e => update('variant_row_label' as any, e.target.value)}
                  placeholder="Ej: Ancho, Marca..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Nombre de las columnas</label>
                <input
                  className="input"
                  value={(config as any)?.variant_column_label ?? ''}
                  onChange={e => update('variant_column_label' as any, e.target.value)}
                  placeholder="Ej: Largo, Color..."
                />
              </div>
              <p className="text-xs text-zinc-400 col-span-2">
                Así se van a ver en la carga de productos y en tu tienda — ej: filas "Ancho" (10, 15, 20...) × columnas "Largo" (10, 20, 30...) para armar cada combinación como una variante propia, con su stock y precio.
              </p>
            </div>
          )}
        </div>

        {/* Atributos de productos */}
        <div data-tutorial="catalogo-attributes" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-semibold text-zinc-700">Atributos de productos</h2>
                <TutorialHint pageKey="catalogo-config" step={CATALOGO_STEPS[1]} />
              </div>
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
        <div data-tutorial="catalogo-format" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-semibold text-zinc-700">Formato y unidades</h2>
                <TutorialHint pageKey="catalogo-config" step={CATALOGO_STEPS[2]} />
              </div>
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
              <label className="block text-xs font-medium text-zinc-600 mb-1">Unidad de peso / contenido</label>
              <select className="input" value={(config as any)?.weight_unit ?? 'kg'} onChange={e => update('weight_unit' as any, e.target.value)}>
                <option value="kg">Kilogramos (kg)</option>
                <option value="g">Gramos (g)</option>
                <option value="mg">Miligramos (mg)</option>
                <option value="l">Litros (l)</option>
                <option value="ml">Mililitros (ml)</option>
              </select>
              <p className="text-xs text-zinc-400 mt-1">Se usa en el campo "Peso" de cada producto y en la etiqueta de envío.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Unidad de medidas</label>
              <select className="input" value={(config as any)?.dimension_unit ?? 'cm'} onChange={e => update('dimension_unit' as any, e.target.value)}>
                <option value="cm">Centímetros (cm)</option>
                <option value="mm">Milímetros (mm)</option>
                <option value="m">Metros (m)</option>
                <option value="in">Pulgadas (in)</option>
              </select>
              <p className="text-xs text-zinc-400 mt-1">Se usa en ancho, largo y altura de cada producto, y en la etiqueta de envío.</p>
            </div>
          </div>
          <p className="text-xs text-amber-600">
            Ojo: cambiar una unidad NO convierte los valores ya cargados en tus productos — solo cambia cómo se muestran. Si ya cargaste medidas, revisalas después de cambiar acá.
          </p>
        </div>

      </div>
    </div>
  )
}

'use client'

import { useState, useRef, useImperativeHandle, forwardRef } from 'react'
import { Plus, X, Tag } from 'lucide-react'

// Lista de variantes para tenants que NO usan la tabla (variant_mode='simple').
//
// Antes esto era un formulario de UNA sola variante (stock + precios, sin
// nombre): servía para cosmética o productos sin talle/color, pero dejaba
// afuera el caso de "el mismo producto en varias presentaciones" (ej: ramen
// suelto, pack x5, pack x10) sin obligar al tenant a armar una tabla 2D.
//
// Ahora es una lista: cada variante tiene su propio nombre, stock, precios y
// atributos adicionales. Un producto con una sola variante sin nombre se
// guarda igual que siempre (size = null), así que nada de lo ya cargado
// cambia de comportamiento.

export interface AttrConfig {
  key: string
  label: string
  type?: 'text' | 'select' | 'color'
  options?: string[]
}

export interface ListVariantData {
  id?: string
  // Nombre visible de la variante (se guarda en variants.size). Vacío en una
  // lista de una sola variante = producto sin selector, como hasta ahora.
  name: string
  stock: number
  // Ver nota en VariantMatrix.CellData — false = "Sin stock" tildado.
  active: boolean
  retailPrice: number
  retailCompareAt: number
  wholesalePrice: number
  wholesaleCompareAt: number
  wholesaleMinQty: number
  // Atributos adicionales propios de ESTA variante. Vacío = no se guarda.
  attrs: Record<string, string>
}

export interface VariantListHandle {
  getVariants: () => ListVariantData[]
  validate: () => string | null
}

interface Row extends ListVariantData { rowId: string }

let LIST_SEQ = 0
const newRowId = () => `lv${LIST_SEQ++}`

const emptyVariant = (): ListVariantData => ({
  name: '', stock: 0, active: true, retailPrice: 0, retailCompareAt: 0,
  wholesalePrice: 0, wholesaleCompareAt: 0, wholesaleMinQty: 1, attrs: {},
})

function cleanAttrs(attrs?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v != null && String(v).trim() !== '') out[k] = String(v).trim()
  }
  return out
}

interface Props {
  initial?: ListVariantData[]
  showRetail?: boolean
  showWholesale?: boolean
  showDiscount?: boolean
  extraAttrs?: AttrConfig[]
  // Signo de pregunta del tutorial, si la página lo provee.
  hintSlot?: React.ReactNode
  // Se llama SOLO al borrar una variante que ya está guardada en la base.
  // Una recién agregada se saca del estado local sin preguntar nada.
  onRemoveVariant?: (variantId: string, label: string) => Promise<boolean>
}

const VariantList = forwardRef<VariantListHandle, Props>(({
  initial,
  showRetail = true,
  showWholesale = true,
  showDiscount = true,
  extraAttrs = [],
  hintSlot,
  onRemoveVariant,
}, ref) => {
  const seed = useRef<Row[] | null>(null)
  if (seed.current === null) {
    const base = initial?.length ? initial : [emptyVariant()]
    seed.current = base.map(v => ({ ...emptyVariant(), ...v, rowId: newRowId() }))
  }
  const [rows, setRows] = useState<Row[]>(seed.current)
  const [attrPanelFor, setAttrPanelFor] = useState<string | null>(null)

  // Nombre que se va a guardar para una variante: el que escribió el tenant,
  // o "Variante N" si lo dejó vacío y hay más de una (si hay una sola, el
  // vacío es legítimo: producto sin selector de variante en la tienda).
  function resolvedName(row: Row, idx: number, total: number): string {
    const typed = row.name.trim()
    if (typed) return typed
    return total > 1 ? `Variante ${idx + 1}` : ''
  }

  useImperativeHandle(ref, () => ({
    getVariants: () => rows.map((r, i) => ({
      id: r.id,
      name: resolvedName(r, i, rows.length),
      stock: r.stock,
      active: r.active,
      retailPrice: r.retailPrice,
      retailCompareAt: r.retailCompareAt,
      wholesalePrice: r.wholesalePrice,
      wholesaleCompareAt: r.wholesaleCompareAt,
      wholesaleMinQty: r.wholesaleMinQty,
      attrs: cleanAttrs(r.attrs),
    })),
    validate: () => {
      const names = rows.map((r, i) => resolvedName(r, i, rows.length).toLowerCase()).filter(Boolean)
      const dupe = names.find((n, i) => names.indexOf(n) !== i)
      if (dupe) return `Hay más de una variante llamada "${dupe}". Cambiá el nombre de una antes de guardar.`
      return null
    },
  }))

  function update(rowId: string, patch: Partial<ListVariantData>) {
    setRows(prev => prev.map(r => (r.rowId === rowId ? { ...r, ...patch } : r)))
  }

  function updateAttr(rowId: string, key: string, value: string) {
    setRows(prev => prev.map(r => (r.rowId === rowId ? { ...r, attrs: { ...r.attrs, [key]: value } } : r)))
  }

  function addVariant() {
    setRows(prev => [...prev, { ...emptyVariant(), rowId: newRowId() }])
  }

  async function handleRemove(rowId: string, idx: number) {
    const row = rows.find(r => r.rowId === rowId)
    if (!row) return
    // Ya guardada en la base → confirmación + borrado real (lo maneja el
    // padre). Recién agregada → se saca y listo, es solo visual hasta guardar.
    if (row.id && onRemoveVariant) {
      const ok = await onRemoveVariant(row.id, resolvedName(row, idx, rows.length) || 'esta variante')
      if (!ok) return
    }
    setRows(prev => prev.filter(r => r.rowId !== rowId))
  }

  const attrCount = (row: Row) => Object.keys(cleanAttrs(row.attrs)).length

  return (
    <div data-tutorial="prod-lista" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold text-zinc-700">Variantes, stock y precios</h2>
          {hintSlot}
        </div>
        <span className="text-[11px] text-zinc-400">
          {rows.length === 1 ? '1 variante' : `${rows.length} variantes`}
        </span>
      </div>

      <div className="space-y-3">
        {rows.map((row, idx) => (
          <div key={row.rowId}
            className={`rounded-lg border p-3 space-y-3 ${row.active === false ? 'border-red-200 bg-red-50/40' : 'border-zinc-200 bg-zinc-50/40'}`}>

            {/* Nombre de la variante */}
            <div className="flex items-center gap-2">
              <input
                className="input text-sm font-medium flex-1"
                value={row.name}
                placeholder={rows.length > 1 ? `Variante ${idx + 1}` : 'Nombre (opcional — ej: Pack x5)'}
                onChange={e => update(row.rowId, { name: e.target.value })}
              />
              {extraAttrs.length > 0 && (
                <button type="button" onClick={() => setAttrPanelFor(attrPanelFor === row.rowId ? null : row.rowId)}
                  className={`text-xs px-3 py-2 rounded-lg border transition-colors flex items-center gap-1.5 flex-shrink-0 ${attrCount(row) > 0 ? 'border-primary-200 bg-primary-50 text-primary-700' : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50'}`}>
                  <Tag size={12} />
                  {attrCount(row) > 0 ? `${attrCount(row)} atributo${attrCount(row) > 1 ? 's' : ''}` : 'Atributos'}
                </button>
              )}
              {rows.length > 1 && (
                <button type="button" onClick={() => handleRemove(row.rowId, idx)}
                  title="Eliminar esta variante"
                  className="text-zinc-300 hover:text-red-500 transition-colors flex-shrink-0 p-2">
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Stock y precios */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Stock</label>
                <input
                  className="input text-sm disabled:opacity-40 disabled:bg-zinc-50" type="number" min="0"
                  value={row.stock || ''} placeholder="0"
                  disabled={row.active === false}
                  onChange={e => update(row.rowId, { stock: parseInt(e.target.value, 10) || 0 })}
                />
                <label className="flex items-center gap-1 mt-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="w-3 h-3 accent-red-500"
                    checked={row.active === false}
                    onChange={e => update(row.rowId, { active: !e.target.checked })}
                  />
                  <span className="text-[10px] text-red-500 leading-none">Sin stock</span>
                </label>
              </div>
              {showRetail && (
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">$ Minorista</label>
                  <input
                    className="input text-sm" type="number" min="0" step="1"
                    value={row.retailPrice || ''} placeholder="0"
                    onChange={e => update(row.rowId, { retailPrice: Math.round(parseFloat(e.target.value) || 0) })}
                  />
                </div>
              )}
              {showRetail && showDiscount && (
                <div>
                  <label className="block text-xs text-orange-500 mb-1">$ Min. rebajado</label>
                  <input
                    className="input text-sm" type="number" min="0" step="1"
                    value={row.retailCompareAt || ''} placeholder="0"
                    onChange={e => update(row.rowId, { retailCompareAt: Math.round(parseFloat(e.target.value) || 0) })}
                  />
                </div>
              )}
              {showWholesale && (
                <div>
                  <label className="block text-xs text-primary-600 mb-1">$ Mayorista</label>
                  <input
                    className="input text-sm" type="number" min="0" step="1"
                    value={row.wholesalePrice || ''} placeholder="0"
                    onChange={e => update(row.rowId, { wholesalePrice: Math.round(parseFloat(e.target.value) || 0) })}
                  />
                </div>
              )}
              {showWholesale && showDiscount && (
                <div>
                  <label className="block text-xs text-primary-500 mb-1">$ May. rebajado</label>
                  <input
                    className="input text-sm" type="number" min="0" step="1"
                    value={row.wholesaleCompareAt || ''} placeholder="0"
                    onChange={e => update(row.rowId, { wholesaleCompareAt: Math.round(parseFloat(e.target.value) || 0) })}
                  />
                </div>
              )}
              {showWholesale && (
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">May. mín. cant.</label>
                  <input
                    className="input text-sm" type="number" min="1"
                    value={row.wholesaleMinQty || ''} placeholder="6"
                    onChange={e => update(row.rowId, { wholesaleMinQty: parseInt(e.target.value, 10) || 1 })}
                  />
                </div>
              )}
            </div>

            {/* Atributos propios de esta variante */}
            {attrPanelFor === row.rowId && extraAttrs.length > 0 && (
              <div className="border-t border-zinc-200 pt-3">
                <p className="text-[11px] text-zinc-400 mb-2">
                  Solo aplican a esta variante. Lo que dejes vacío no se muestra en la tienda.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {extraAttrs.map(attr => (
                    <div key={attr.key}>
                      <label className="block text-xs text-zinc-500 mb-1">{attr.label}</label>
                      {attr.type === 'select' && attr.options?.length ? (
                        <select className="input text-sm" value={row.attrs[attr.key] ?? ''}
                          onChange={e => updateAttr(row.rowId, attr.key, e.target.value)}>
                          <option value="">— Sin valor —</option>
                          {attr.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        <input className="input text-sm" value={row.attrs[attr.key] ?? ''}
                          placeholder="— Sin valor —"
                          onChange={e => updateAttr(row.rowId, attr.key, e.target.value)} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <button type="button" onClick={addVariant}
        className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1 font-medium">
        <Plus size={13} /> Agregar variante
      </button>

      <p className="text-xs text-zinc-400">
        {rows.length === 1
          ? 'Con una sola variante sin nombre, el producto se vende directo (la tienda no muestra selector). Agregá más variantes si lo vendés en distintas presentaciones.'
          : 'Cada variante se muestra como una opción a elegir en la ficha del producto, con su propio precio, stock y atributos.'}
      </p>
      <p className="text-[11px] text-zinc-400">
        Las variantes que agregues recién se crean al guardar — hasta entonces las podés sacar con la X sin que pase nada.
      </p>
    </div>
  )
})

VariantList.displayName = 'VariantList'

export default VariantList

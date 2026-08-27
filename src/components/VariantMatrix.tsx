'use client'

import { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react'
import { Plus, Pipette, X, Star, Tag } from 'lucide-react'
import { nearestColorName, isPlaceholderName } from '@/lib/colorNames'

export interface FavoriteColor { name: string; hex: string }

export { nearestColorName, isPlaceholderName }

// ── Color palette ─────────────────────────────────────────────────────────────
const COLOR_MAP: Record<string, string> = {
  negro: '#1C1C1C', blanco: '#F5F5F0', crema: '#F0EBE1', beige: '#D4C5A9',
  marfil: '#FFFFF0', gris: '#9E9E9E', 'gris claro': '#D0D0D0', 'gris oscuro': '#555555',
  rojo: '#C0392B', bordo: '#7B2D42', vino: '#6B2737', rosa: '#E8A0B0',
  'rosa pálido': '#F2C4CE', salmón: '#E8957A',
  coral: '#E8714A', naranja: '#E8813A', mostaza: '#C8A84B', amarillo: '#F0CC4A',
  azul: '#3A7BC8', 'azul marino': '#1B3A6B', 'azul claro': '#7EB8E0', celeste: '#87CEEB',
  'celeste pálido': '#A8C8CA', 'azul pálido': '#B0C4DE', 'azul acero': '#7A9BB5',
  verde: '#4A9B6F', 'verde oscuro': '#2D6A4F', 'verde agua': '#7BBFB5', esmeralda: '#2E8B6E', turquesa: '#3AADA8',
  lila: '#B09BC8', violeta: '#8E44AD', morado: '#6C3483', lavanda: '#C8B8DC',
  camel: '#C19A6B', tabaco: '#8B6355', chocolate: '#5C3A1E', tiza: '#E8E4DC',
  arena: '#C8B89A', caqui: '#A89870',
}
function colorToHex(name: string): string {
  if (/^#[0-9A-Fa-f]{3,6}$/.test(name.trim())) return name.trim()
  return COLOR_MAP[name.toLowerCase().trim()] ?? '#CCCCCC'
}

// hexToRgb, CSS_NAMED_COLORS, nearestColorName e isPlaceholderName viven en
// @/lib/colorNames (importado arriba y re-exportado) para poder compartirse
// también con la API de borrado de columnas/filas, que corre en el servidor.

// ── Types ─────────────────────────────────────────────────────────────────────

// Config de atributos adicionales del tenant (store_config.variant_attributes).
// Los VALORES viven por celda (CellData.attrs), no por producto — dos variantes
// del mismo producto pueden tener distinto peso, sabor, etc.
export interface AttrConfig {
  key: string
  label: string
  type?: 'text' | 'select' | 'color'
  options?: string[]
}

export interface CellData {
  variantId?: string   // defined for existing variants (edit mode)
  stock: number
  // Override manual — el tenant marca esta variante puntual como no
  // disponible para la venta, sin importar el stock cargado. Pensado sobre
  // todo para tenants con ignore_stock (stock "infinito"/no controlado),
  // donde no hay forma de que un talle/color se quede "sin stock" solo.
  // false = "Sin stock" tildado. Default true (disponible).
  active: boolean
  retailPrice: number
  retailCompareAt: number
  wholesalePrice: number
  wholesaleCompareAt: number
  wholesaleMinQty: number
  // Atributos adicionales PROPIOS de esta celda (ej: { peso: '600 g',
  // sabor: 'Picante' }). Vacío/ausente = no se guarda ese atributo para
  // esta variante (queda NULL y la tienda no lo muestra).
  attrs?: Record<string, string>
}

export interface VariantForSave {
  id?: string
  size: string | null
  color: string | null
  colorHex: string | null
  attrs: Record<string, string>
  stock: number
  active: boolean
  retailPrice: number
  retailCompareAt: number
  wholesalePrice: number
  wholesaleCompareAt: number
  wholesaleMinQty: number
}

export interface VariantMatrixHandle {
  getVariants: () => VariantForSave[]
  // Devuelve un mensaje de error si la tabla no está en condiciones de
  // guardarse (nombres repetidos), o null si está OK. El padre lo llama
  // antes de guardar — a diferencia de bloquear el tipeo, esto deja
  // escribir libremente y solo avisa al final.
  validate: () => string | null
}

// ── Identidad de filas y columnas ─────────────────────────────────────────────
// IMPORTANTE: cada fila y columna tiene un id interno estable, y los datos de
// las celdas se indexan por ESE id — nunca por el nombre visible.
//
// Antes la clave de cada celda era `${nombreFila}\x00${nombreColumna}`, y eso
// traía dos bugs graves e inevitables: (1) dos filas sin nombre (o con el
// mismo nombre) compartían literalmente la misma celda y se pisaban los datos
// entre sí, y (2) renombrar era en realidad "mover los datos de una clave a
// otra", así que había que bloquear los renombres que colisionaban — lo que
// desde el teclado se siente como "no me deja editar el nombre".
//
// Con ids estables el nombre es solo una etiqueta: se puede dejar vacío,
// repetir temporalmente o reescribir entero sin que ningún dato se mueva.
interface Axis {
  id: string
  name: string
  hex?: string   // solo columnas, en modo 'color'
}

let AXIS_SEQ = 0
const newAxisId = () => `ax${AXIS_SEQ++}`

const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL']
const DEFAULT_COLORS = ['nuevo']

// Separador de claves — se mantiene exportado con la MISMA firma de antes
// (por nombre) porque es el contrato con el que la página de producto arma
// `initialCells`. Internamente la matriz usa `ck(rowId, colId)`.
export const SEP = '\x00'
export const cellKey = (size: string, color: string) => `${size}${SEP}${color}`
const ck = (rowId: string, colId: string) => `${rowId}${SEP}${colId}`

const emptyCell = (): CellData => ({ stock: 0, active: true, retailPrice: 0, retailCompareAt: 0, wholesalePrice: 0, wholesaleCompareAt: 0, wholesaleMinQty: 6, attrs: {} })

// Saca los atributos vacíos — un atributo en blanco no se guarda (queda NULL
// en variants.attributes y la tienda directamente no lo muestra).
function cleanAttrs(attrs?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v != null && String(v).trim() !== '') out[k] = String(v).trim()
  }
  return out
}

interface Props {
  mode: 'create' | 'edit'
  initialSizes?: string[]
  initialColors?: string[]
  initialColorHexes?: string[]
  initialCells?: Record<string, CellData>
  // Se llama SOLO cuando la fila/columna que se quiere borrar ya tiene
  // variantes guardadas en la base (se pasan sus ids). El padre confirma con
  // el tenant y llama a la API; devuelve true si se borró. Una fila/columna
  // recién agregada que todavía no se guardó NO pasa por acá: se saca del
  // estado local y listo, es un cambio puramente visual hasta guardar.
  onRemoveColor?: (variantIds: string[], label: string) => Promise<boolean>
  onRemoveSize?: (variantIds: string[], label: string) => Promise<boolean>
  // Colores favoritos del tenant (persisten en store_config, no acá) —
  // se muestran primero en el selector de color de CUALQUIER producto.
  favoriteColors?: FavoriteColor[]
  onToggleFavorite?: (color: FavoriteColor) => void
  // 'color' (default) = columnas con swatch + selector de color, como siempre.
  // 'text' = columnas de texto libre, sin nada de color — para tenants que
  // usan la tabla para otra cosa que no sea indumentaria.
  columnType?: 'color' | 'text'
  // Solo se usan cuando columnType='text' — nombran los ejes (ej: "Ancho"/"Largo").
  // Vacío = "Fila"/"Columna" genérico. En modo 'color' siempre dice "Talle"/"Color".
  rowLabel?: string
  columnLabel?: string
  // Qué filas de precio mostrar en cada celda — default true en los tres.
  showRetail?: boolean
  showWholesale?: boolean
  showDiscount?: boolean
  // Atributos adicionales configurados por el tenant en Catálogo. Los valores
  // se cargan por celda desde el panel de cada variante.
  extraAttrs?: AttrConfig[]
  // Edición de los nombres de eje PARA ESTE PRODUCTO. Viven acá adentro y no
  // en la página para quedar pegados a la tabla: son el encabezado de lo que
  // se está por cargar, y antes quedaban separados de ella por el panel de
  // edición masiva. Solo se muestran si se pasa el callback y columnType es
  // 'text' (en modo color los ejes son Talle/Color y no se renombran).
  productRowLabel?: string
  productColumnLabel?: string
  onProductRowLabelChange?: (v: string) => void
  onProductColumnLabelChange?: (v: string) => void
  // Defaults del tenant (store_config) — se usan de placeholder y en la ayuda.
  tenantRowLabel?: string
  tenantColumnLabel?: string
  // Signo de pregunta del tutorial, si la página lo provee. Se recibe como
  // nodo para que este componente no dependa del motor de tutoriales.
  hintSlot?: React.ReactNode
}

// ── Component ─────────────────────────────────────────────────────────────────
const VariantMatrix = forwardRef<VariantMatrixHandle, Props>(({
  mode,
  initialSizes = DEFAULT_SIZES,
  initialColors = DEFAULT_COLORS,
  initialColorHexes = [],
  initialCells = {},
  onRemoveColor,
  onRemoveSize,
  favoriteColors = [],
  onToggleFavorite,
  columnType = 'color',
  rowLabel = '',
  columnLabel = '',
  showRetail = true,
  showWholesale = true,
  showDiscount = true,
  extraAttrs = [],
  productRowLabel = '',
  productColumnLabel = '',
  onProductRowLabelChange,
  onProductColumnLabelChange,
  tenantRowLabel = '',
  tenantColumnLabel = '',
  hintSlot,
}, ref) => {
  const effRowLabel = columnType === 'text' ? (rowLabel.trim() || 'Fila') : 'Talle'
  const effColumnLabel = columnType === 'text' ? (columnLabel.trim() || 'Columna') : 'Color'

  // Semilla inicial — se calcula UNA sola vez. Traduce el `initialCells` que
  // manda el padre (indexado por NOMBRE, que es el contrato de siempre) a la
  // indexación interna por id.
  const seed = useRef<{ rows: Axis[]; cols: Axis[]; cells: Record<string, CellData> } | null>(null)
  if (seed.current === null) {
    const rows: Axis[] = (initialSizes.length ? initialSizes : ['']).map(n => ({ id: newAxisId(), name: n }))
    const cols: Axis[] = (initialColors.length ? initialColors : DEFAULT_COLORS).map((n, i) => ({
      id: newAxisId(), name: n, hex: initialColorHexes[i] ?? '',
    }))
    const cells: Record<string, CellData> = {}
    for (const r of rows) {
      for (const c of cols) {
        const fromParent = initialCells[cellKey(r.name, c.name)]
        cells[ck(r.id, c.id)] = fromParent ? { ...emptyCell(), ...fromParent } : emptyCell()
      }
    }
    seed.current = { rows, cols, cells }
  }

  const [rows, setRows] = useState<Axis[]>(seed.current.rows)
  const [cols, setCols] = useState<Axis[]>(seed.current.cols)
  const [cells, setCells] = useState<Record<string, CellData>>(seed.current.cells)

  // Color picker
  const [pickerForCol, setPickerForCol] = useState<string | null>(null)
  const [pickerHex, setPickerHex] = useState('#1C1C1C')
  const pickerRef = useRef<HTMLDivElement>(null)

  // Panel de atributos de una celda puntual ({rowId, colId}) o de todas ('all')
  const [attrPanel, setAttrPanel] = useState<{ rowId: string; colId: string } | 'all' | null>(null)
  const [bulkAttrs, setBulkAttrs] = useState<Record<string, string>>({})

  // Bulk edit
  const [bulk, setBulk] = useState({ stock: '', retail: '', compareRetail: '', wholesale: '', compareWholesale: '' })

  // Close color picker on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerForCol(null)
    }
    if (pickerForCol !== null) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pickerForCol])

  const getCell = (rowId: string, colId: string): CellData => cells[ck(rowId, colId)] ?? emptyCell()

  // Nombres repetidos — se marcan en rojo mientras se escribe, pero NO se
  // bloquea el tipeo (bloquearlo es lo que hacía sentir que el campo estaba
  // trabado). Se valida recién al guardar, vía validate().
  function duplicateNames(list: Axis[]): Set<string> {
    const seen = new Map<string, string>()
    const dupes = new Set<string>()
    for (const a of list) {
      const k = a.name.trim().toLowerCase()
      if (!k) continue
      const prev = seen.get(k)
      if (prev) { dupes.add(prev); dupes.add(a.id) } else seen.set(k, a.id)
    }
    return dupes
  }
  const dupRows = duplicateNames(rows)
  const dupCols = duplicateNames(cols)

  // ── Exposed API ────────────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    getVariants: () => {
      const result: VariantForSave[] = []
      for (const r of rows) {
        for (const c of cols) {
          const cell = getCell(r.id, c.id)
          const size = r.name.trim()
          const color = c.name.trim()
          const attrs: Record<string, string> = { ...cleanAttrs(cell.attrs) }
          if (size) attrs.talle = size
          if (color) attrs.color = color
          result.push({
            id: cell.variantId,
            size: size || null,
            color: color || null,
            colorHex: c.hex || null,
            attrs,
            stock: cell.stock,
            active: cell.active,
            retailPrice: cell.retailPrice,
            retailCompareAt: cell.retailCompareAt,
            wholesalePrice: cell.wholesalePrice,
            wholesaleCompareAt: cell.wholesaleCompareAt,
            wholesaleMinQty: cell.wholesaleMinQty,
          })
        }
      }
      return result
    },
    validate: () => {
      if (dupRows.size > 0) {
        return `Hay ${effRowLabel.toLowerCase()}s repetidas en la tabla. Cambiá el nombre de las que están marcadas en rojo antes de guardar.`
      }
      if (dupCols.size > 0) {
        return `Hay ${effColumnLabel.toLowerCase()}s repetidas en la tabla. Cambiá el nombre de las que están marcadas en rojo antes de guardar.`
      }
      return null
    },
  }))

  // ── Cell updaters ──────────────────────────────────────────────────────────
  function updateCell(rowId: string, colId: string, field: keyof CellData, value: any) {
    const key = ck(rowId, colId)
    setCells(prev => ({ ...prev, [key]: { ...(prev[key] ?? emptyCell()), [field]: value } }))
  }

  function updateCellAttr(rowId: string, colId: string, attrKey: string, value: string) {
    const key = ck(rowId, colId)
    setCells(prev => {
      const cell = prev[key] ?? emptyCell()
      return { ...prev, [key]: { ...cell, attrs: { ...(cell.attrs ?? {}), [attrKey]: value } } }
    })
  }

  // Aplica un set de atributos a TODAS las celdas — solo pisa las claves que
  // se completaron (una clave vacía se deja como está en cada celda).
  function applyAttrsToAll() {
    const toApply = cleanAttrs(bulkAttrs)
    if (Object.keys(toApply).length === 0) { setAttrPanel(null); return }
    setCells(prev => {
      const next = { ...prev }
      for (const r of rows) {
        for (const c of cols) {
          const key = ck(r.id, c.id)
          const cell = next[key] ?? emptyCell()
          next[key] = { ...cell, attrs: { ...(cell.attrs ?? {}), ...toApply } }
        }
      }
      return next
    })
    setBulkAttrs({})
    setAttrPanel(null)
  }

  // ── Row management ─────────────────────────────────────────────────────────
  function addRow() {
    const row: Axis = { id: newAxisId(), name: '' }
    setRows(prev => [...prev, row])
    setCells(prev => {
      const next = { ...prev }
      for (const c of cols) next[ck(row.id, c.id)] = emptyCell()
      return next
    })
  }

  function removeRowLocal(rowId: string) {
    setRows(prev => prev.filter(r => r.id !== rowId))
    setCells(prev => {
      const next = { ...prev }
      for (const c of cols) delete next[ck(rowId, c.id)]
      return next
    })
  }

  // Ids de variantes YA guardadas en la base para una fila/columna entera.
  const savedIdsForRow = (rowId: string) =>
    cols.map(c => getCell(rowId, c.id).variantId).filter(Boolean) as string[]
  const savedIdsForCol = (colId: string) =>
    rows.map(r => getCell(r.id, colId).variantId).filter(Boolean) as string[]

  // Borrar una fila: si todavía no tiene NADA guardado en la base, es un
  // cambio puramente visual — se saca y listo, sin confirmación ni API.
  // Solo se pide confirmación (y se borra de verdad) si ya está persistida.
  async function handleRemoveRowClick(rowId: string) {
    const row = rows.find(r => r.id === rowId)
    if (!row) return
    const ids = savedIdsForRow(rowId)
    if (ids.length > 0 && onRemoveSize) {
      const ok = await onRemoveSize(ids, row.name.trim() || `(${effRowLabel.toLowerCase()} sin nombre)`)
      if (!ok) return
    }
    removeRowLocal(rowId)
  }

  function renameRow(rowId: string, name: string) {
    setRows(prev => prev.map(r => (r.id === rowId ? { ...r, name } : r)))
  }

  // ── Column management ──────────────────────────────────────────────────────
  function addColumn() {
    const col: Axis = { id: newAxisId(), name: '', hex: '' }
    setCols(prev => [...prev, col])
    setCells(prev => {
      const next = { ...prev }
      for (const r of rows) next[ck(r.id, col.id)] = emptyCell()
      return next
    })
  }

  function removeColumnLocal(colId: string) {
    setCols(prev => prev.filter(c => c.id !== colId))
    setCells(prev => {
      const next = { ...prev }
      for (const r of rows) delete next[ck(r.id, colId)]
      return next
    })
  }

  async function handleRemoveColumnClick(colId: string) {
    const col = cols.find(c => c.id === colId)
    if (!col) return
    const ids = savedIdsForCol(colId)
    if (ids.length > 0 && onRemoveColor) {
      const ok = await onRemoveColor(ids, col.name.trim() || `(${effColumnLabel.toLowerCase()} sin nombre)`)
      if (!ok) return
    }
    removeColumnLocal(colId)
  }

  function renameColumn(colId: string, name: string) {
    setCols(prev => prev.map(c => (c.id === colId ? { ...c, name } : c)))
  }

  // ── Color picker for column header ─────────────────────────────────────────
  // El hex real vive aparte del nombre: cambiar el hex NUNCA pisa un nombre
  // que el tenant ya haya tipeado — solo autocompleta si sigue en placeholder.
  function setColumnHex(colId: string, hex: string) {
    setCols(prev => prev.map(c => (c.id === colId ? { ...c, hex } : c)))
    const col = cols.find(c => c.id === colId)
    if (col && (!col.name.trim() || isPlaceholderName(col.name))) {
      const suggested = nearestColorName(hex)
      if (suggested) renameColumn(colId, suggested)
    }
  }

  function openPicker(colId: string) {
    const col = cols.find(c => c.id === colId)
    const existing = col?.hex || (col && colorToHex(col.name) !== '#CCCCCC' ? colorToHex(col.name) : '#1C1C1C')
    setPickerHex(existing || '#1C1C1C')
    setPickerForCol(colId)
  }

  function applyPickerColor(colId: string) {
    setColumnHex(colId, pickerHex)
    setPickerForCol(null)
  }

  async function launchEyeDropper(colId: string) {
    try {
      // @ts-ignore
      const result = await new window.EyeDropper().open()
      setColumnHex(colId, result.sRGBHex)
      setPickerForCol(null)
    } catch { }
  }

  // ── Bulk edit ──────────────────────────────────────────────────────────────
  function applyBulk() {
    setCells(prev => {
      const next = { ...prev }
      for (const r of rows) {
        for (const c of cols) {
          const key = ck(r.id, c.id)
          const cell = { ...(next[key] ?? emptyCell()) }
          if (bulk.stock !== '') cell.stock = parseInt(bulk.stock, 10) || 0
          if (bulk.retail !== '') cell.retailPrice = Math.round(parseFloat(bulk.retail) || 0)
          if (bulk.compareRetail !== '') cell.retailCompareAt = Math.round(parseFloat(bulk.compareRetail) || 0)
          if (bulk.wholesale !== '') cell.wholesalePrice = Math.round(parseFloat(bulk.wholesale) || 0)
          if (bulk.compareWholesale !== '') cell.wholesaleCompareAt = Math.round(parseFloat(bulk.compareWholesale) || 0)
          next[key] = cell
        }
      }
      return next
    })
    setBulk({ stock: '', retail: '', compareRetail: '', wholesale: '', compareWholesale: '' })
  }

  // Cuántos atributos cargados tiene una celda — para el contador del botón.
  const attrCount = (rowId: string, colId: string) => Object.keys(cleanAttrs(getCell(rowId, colId).attrs)).length

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      <div className="flex items-center gap-1.5">
        <h2 className="text-sm font-semibold text-zinc-700">Variantes, stock y precios</h2>
        {hintSlot}
      </div>

      {/* ── Bulk edit panel ────────────────────────────────────────────────── */}
      <div data-tutorial="prod-bulk" className="bg-primary-50 border border-primary-100 rounded-xl p-4">
        <p className="text-xs font-semibold text-primary-700 mb-3">Editar todas las celdas a la vez</p>
        <div className="flex flex-wrap items-end gap-3">
          {[
            { label: 'Stock', field: 'stock' as const, w: 'w-20', show: true },
            { label: '$ Minorista', field: 'retail' as const, w: 'w-28', show: showRetail },
            { label: '$ Min. rebajado', field: 'compareRetail' as const, w: 'w-28', show: showRetail && showDiscount },
            { label: '$ Mayorista', field: 'wholesale' as const, w: 'w-28', show: showWholesale },
            { label: '$ May. rebajado', field: 'compareWholesale' as const, w: 'w-28', show: showWholesale && showDiscount },
          ].filter(f => f.show).map(({ label, field, w }) => (
            <div key={field}>
              <label className="block text-xs text-primary-600 mb-1">{label}</label>
              <input
                className={`input text-sm ${w}`}
                type="number" min="0" step="1"
                value={bulk[field]}
                onChange={e => setBulk(b => ({ ...b, [field]: e.target.value }))}
                placeholder="—"
              />
            </div>
          ))}
          <button type="button" onClick={applyBulk}
            className="btn-primary text-xs py-2 px-4 bg-primary-600 hover:bg-primary-700 border-primary-600">
            Aplicar a todas
          </button>
          {extraAttrs.length > 0 && (
            <button type="button" onClick={() => setAttrPanel('all')}
              className="text-xs py-2 px-4 rounded-lg border border-primary-200 text-primary-700 hover:bg-primary-100 transition-colors flex items-center gap-1.5">
              <Tag size={12} /> Atributos para todas
            </button>
          )}
        </div>
        <p className="text-[10px] text-primary-400 mt-2">Solo los campos que completes se van a aplicar. Los demás se dejan como están.</p>
      </div>

      {/* ── Nombres de los ejes de ESTE producto ───────────────────────────── */}
      {columnType === 'text' && onProductRowLabelChange && onProductColumnLabelChange && (
        <div data-tutorial="prod-ejes" className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">
              Nombre de las filas (solo este producto)
            </label>
            <input
              className="input text-sm max-w-[220px]"
              value={productRowLabel}
              onChange={e => onProductRowLabelChange(e.target.value)}
              placeholder={tenantRowLabel || 'Fila'}
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">
              Nombre de las columnas (solo este producto)
            </label>
            <input
              className="input text-sm max-w-[220px]"
              value={productColumnLabel}
              onChange={e => onProductColumnLabelChange(e.target.value)}
              placeholder={tenantColumnLabel || 'Columna'}
            />
          </div>
          <p className="text-[10px] text-zinc-400 w-full">
            Vacío = usa el de la tienda (“{tenantRowLabel || 'Fila'}” / “{tenantColumnLabel || 'Columna'}”, configurado en Mi Tienda &gt; Catálogo). Lo que pongas acá solo aplica a este producto.
          </p>
        </div>
      )}

      {/* ── Matrix table ───────────────────────────────────────────────────── */}
      <div data-tutorial="prod-tabla" className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="border-collapse w-full">
          <thead>
            <tr className="bg-zinc-50">
              {/* Esquina — vacía a propósito: el nombre del eje ya se entiende
                  por los valores de cada fila y por el botón de agregar. */}
              <th className="px-3 py-3 text-left border-b border-r border-zinc-200 sticky left-0 bg-zinc-50 z-10 min-w-[90px]" />

              {/* Column headers — swatch+picker en modo 'color', texto libre en modo 'text' */}
              {cols.map(col => (
                <th key={col.id} className="px-2 py-2 border-b border-r border-zinc-200 min-w-[150px]">
                  <div className="flex items-center justify-center gap-1.5">
                    {columnType === 'color' && (
                      // Color swatch — usa el hex guardado; si todavía no eligió uno, lo deriva del nombre
                      <button type="button" onClick={() => openPicker(col.id)}
                        style={{ backgroundColor: col.hex || colorToHex(col.name) }}
                        title="Elegir color"
                        className="w-5 h-5 rounded-full border border-zinc-300 flex-shrink-0 hover:scale-110 transition-transform shadow-sm" />
                    )}
                    {/* Nombre de columna — texto libre, se puede dejar vacío o
                        reescribir entero sin que se muevan los datos */}
                    <input
                      className={`text-xs font-semibold bg-transparent border-b focus:outline-none text-center capitalize ${dupCols.has(col.id) ? 'text-red-600 border-red-400' : 'text-zinc-700 border-transparent hover:border-zinc-300 focus:border-primary-400'}`}
                      style={{ width: '80px' }}
                      value={col.name}
                      onChange={e => renameColumn(col.id, e.target.value)}
                      placeholder={`${effColumnLabel}...`}
                      title={dupCols.has(col.id) ? 'Este nombre está repetido — cambialo antes de guardar' : undefined}
                    />
                    {/* Borrar columna — si todavía no está guardada, sale sin preguntar */}
                    {cols.length > 1 && (
                      <button type="button" onClick={() => handleRemoveColumnClick(col.id)}
                        title="Eliminar esta columna"
                        className="text-zinc-300 hover:text-red-400 transition-colors flex-shrink-0">
                        <X size={11} />
                      </button>
                    )}
                  </div>
                </th>
              ))}

              {/* Agregar columna — a la DERECHA de la última, que es donde
                  realmente se agrega (antes estaba en la esquina izquierda y
                  daba a entender que la nueva columna entraba por ahí). */}
              <th className="px-3 py-3 border-b border-zinc-200 align-middle w-px whitespace-nowrap">
                <button type="button" onClick={addColumn}
                  className="text-[11px] text-primary-600 hover:text-primary-700 flex items-center gap-1 font-medium">
                  <Plus size={11} /> {effColumnLabel}
                </button>
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map(row => (
              <tr key={row.id} className="border-t border-zinc-100 hover:bg-zinc-50/30 transition-colors">
                {/* Row label cell */}
                <td className="px-3 py-2 border-r border-zinc-200 sticky left-0 bg-white z-10">
                  <div className="flex items-center gap-1.5">
                    <input
                      className={`text-xs font-semibold bg-transparent border-b focus:outline-none ${dupRows.has(row.id) ? 'text-red-600 border-red-400' : 'text-zinc-700 border-transparent hover:border-zinc-300 focus:border-primary-400'}`}
                      style={{ width: '56px' }}
                      value={row.name}
                      onChange={e => renameRow(row.id, e.target.value)}
                      placeholder={`${effRowLabel}...`}
                      title={dupRows.has(row.id) ? 'Este nombre está repetido — cambialo antes de guardar' : undefined}
                    />
                    {rows.length > 1 && (
                      <button type="button" onClick={() => handleRemoveRowClick(row.id)}
                        title={`Eliminar esta ${effRowLabel.toLowerCase()}`}
                        className="text-zinc-300 hover:text-red-400 transition-colors flex-shrink-0">
                        <X size={11} />
                      </button>
                    )}
                  </div>
                </td>

                {/* Data cells */}
                {cols.map(col => {
                  const cell = getCell(row.id, col.id)
                  const nAttrs = attrCount(row.id, col.id)

                  return (
                    <td key={col.id} className="p-1.5 border-r border-zinc-100 align-top">
                      <div className={`rounded-lg border transition-all divide-y divide-zinc-100 ${cell.active === false ? 'border-red-200 bg-red-50/40' : 'border-zinc-100 bg-white hover:border-zinc-200'}`}>

                        {/* Fila 1 — Stock (ancho completo) */}
                        <div className="p-1.5">
                          <p className="text-[9px] text-zinc-400 leading-none mb-1">Stock</p>
                          <input
                            className="w-full text-sm font-semibold border border-zinc-200 rounded px-1.5 py-1.5 focus:outline-none focus:border-primary-400 bg-white text-center disabled:opacity-40 disabled:bg-zinc-50"
                            type="number" min="0"
                            value={cell.stock || ''}
                            placeholder="0"
                            disabled={cell.active === false}
                            onChange={e => updateCell(row.id, col.id, 'stock', parseInt(e.target.value, 10) || 0)}
                          />
                          <label className="flex items-center gap-1 mt-1.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              className="w-3 h-3 accent-red-500"
                              checked={cell.active === false}
                              onChange={e => updateCell(row.id, col.id, 'active', !e.target.checked)}
                            />
                            <span className="text-[9px] text-red-500 leading-none">Sin stock</span>
                          </label>
                        </div>

                        {/* Fila 2 — Minorista | Minorista rebajado */}
                        {showRetail && (
                          <div className={showDiscount ? 'grid grid-cols-2 divide-x divide-zinc-100' : ''}>
                            <div className="p-1.5">
                              <p className="text-[9px] text-zinc-400 leading-none mb-1">$ Min.</p>
                              <input
                                className="w-full text-xs border border-zinc-200 rounded px-1 py-1 focus:outline-none focus:border-primary-400 bg-white text-center"
                                type="number" min="0" step="1"
                                value={cell.retailPrice || ''}
                                placeholder="0"
                                onChange={e => updateCell(row.id, col.id, 'retailPrice', Math.round(parseFloat(e.target.value) || 0))}
                              />
                            </div>
                            {showDiscount && (
                              <div className="p-1.5 bg-orange-50/50">
                                <p className="text-[9px] text-orange-400 leading-none mb-1">$ Min. reb.</p>
                                <input
                                  className="w-full text-xs border border-orange-100 rounded px-1 py-1 focus:outline-none focus:border-orange-300 bg-white text-center"
                                  type="number" min="0" step="1"
                                  value={cell.retailCompareAt || ''}
                                  placeholder="0"
                                  onChange={e => updateCell(row.id, col.id, 'retailCompareAt', Math.round(parseFloat(e.target.value) || 0))}
                                />
                              </div>
                            )}
                          </div>
                        )}

                        {/* Fila 3 — Mayorista | Mayorista rebajado */}
                        {showWholesale && (
                          <div className={showDiscount ? 'grid grid-cols-2 divide-x divide-primary-100' : ''}>
                            <div className="p-1.5 bg-primary-50/40">
                              <p className="text-[9px] text-primary-500 leading-none mb-1">$ May.</p>
                              <input
                                className="w-full text-xs border border-primary-100 rounded px-1 py-1 focus:outline-none focus:border-primary-400 bg-white text-center"
                                type="number" min="0" step="1"
                                value={cell.wholesalePrice || ''}
                                placeholder="0"
                                onChange={e => updateCell(row.id, col.id, 'wholesalePrice', Math.round(parseFloat(e.target.value) || 0))}
                              />
                            </div>
                            {showDiscount && (
                              <div className="p-1.5 bg-primary-50/40">
                                <p className="text-[9px] text-primary-400 leading-none mb-1">$ May. reb.</p>
                                <input
                                  className="w-full text-xs border border-primary-100 rounded px-1 py-1 focus:outline-none focus:border-primary-400 bg-white text-center"
                                  type="number" min="0" step="1"
                                  value={cell.wholesaleCompareAt || ''}
                                  placeholder="0"
                                  onChange={e => updateCell(row.id, col.id, 'wholesaleCompareAt', Math.round(parseFloat(e.target.value) || 0))}
                                />
                              </div>
                            )}
                          </div>
                        )}

                        {/* Fila 4 — Atributos propios de ESTA celda */}
                        {extraAttrs.length > 0 && (
                          <button type="button" onClick={() => setAttrPanel({ rowId: row.id, colId: col.id })}
                            className={`w-full flex items-center justify-center gap-1 py-1.5 text-[9px] transition-colors ${nAttrs > 0 ? 'text-primary-600 hover:bg-primary-50' : 'text-zinc-400 hover:bg-zinc-50'}`}>
                            <Tag size={9} />
                            {nAttrs > 0 ? `${nAttrs} atributo${nAttrs > 1 ? 's' : ''}` : 'Atributos'}
                          </button>
                        )}

                      </div>
                    </td>
                  )
                })}

                {/* Columna vacía que alinea con el botón de agregar columna */}
                <td />
              </tr>
            ))}

            {/* Add row */}
            <tr className="border-t border-zinc-100">
              <td className="px-3 py-2 sticky left-0 bg-white">
                <button type="button" onClick={addRow}
                  className="text-[11px] text-primary-600 hover:text-primary-700 flex items-center gap-1 font-medium">
                  <Plus size={11} /> {effRowLabel}
                </button>
              </td>
              {cols.map(c => <td key={c.id} />)}
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-400">
        Cada celda muestra: stock{showRetail ? ' · precio minorista' : ''}{showRetail && showDiscount ? ' · precio min. rebajado (tachado)' : ''}{showWholesale ? ' · precio mayorista' : ''}{showWholesale && showDiscount ? ' · precio may. rebajado' : ''}. Solo completá los campos que aplican
      </p>
      {mode === 'edit' && (
        <p className="text-[11px] text-zinc-400">
          Las {effRowLabel.toLowerCase()}s y {effColumnLabel.toLowerCase()}s que agregues recién se crean al guardar — hasta entonces las podés sacar con la X sin que pase nada.
        </p>
      )}

      {/* ── Panel de atributos — de una celda puntual o de todas a la vez ──── */}
      {attrPanel !== null && extraAttrs.length > 0 && (() => {
        const isAll = attrPanel === 'all'
        const target = isAll ? null : (attrPanel as { rowId: string; colId: string })
        const row = target ? rows.find(r => r.id === target.rowId) : null
        const col = target ? cols.find(c => c.id === target.colId) : null
        const values: Record<string, string> = isAll
          ? bulkAttrs
          : (getCell(target!.rowId, target!.colId).attrs ?? {})

        const setValue = (key: string, val: string) => {
          if (isAll) setBulkAttrs(prev => ({ ...prev, [key]: val }))
          else updateCellAttr(target!.rowId, target!.colId, key, val)
        }

        const title = isAll
          ? 'Atributos para todas las celdas'
          : `Atributos de ${[row?.name.trim(), col?.name.trim()].filter(Boolean).join(' / ') || 'esta variante'}`

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white border border-zinc-200 rounded-xl shadow-xl p-5 w-96 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-zinc-700">{title}</p>
                <button type="button" onClick={() => setAttrPanel(null)} className="text-zinc-400 hover:text-zinc-600">
                  <X size={16} />
                </button>
              </div>
              <p className="text-[11px] text-zinc-400 mb-4">
                {isAll
                  ? 'Lo que completes se copia a todas las celdas. Lo que dejes vacío no toca nada.'
                  : 'Solo aplican a esta variante. Lo que dejes vacío no se muestra en la tienda.'}
              </p>

              <div className="space-y-3">
                {extraAttrs.map(attr => (
                  <div key={attr.key}>
                    <label className="block text-xs font-medium text-zinc-600 mb-1">{attr.label}</label>
                    {attr.type === 'select' && attr.options?.length ? (
                      <select className="input text-sm" value={values[attr.key] ?? ''}
                        onChange={e => setValue(attr.key, e.target.value)}>
                        <option value="">— Sin valor —</option>
                        {attr.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    ) : (
                      <input className="input text-sm" value={values[attr.key] ?? ''}
                        placeholder="— Sin valor —"
                        onChange={e => setValue(attr.key, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mt-5">
                {isAll ? (
                  <>
                    <button type="button" onClick={applyAttrsToAll} className="flex-1 btn-primary text-xs py-2 justify-center">
                      Aplicar a todas
                    </button>
                    <button type="button" onClick={() => { setBulkAttrs({}); setAttrPanel(null) }}
                      className="px-4 text-xs rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50 transition-colors">
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setAttrPanel(null)} className="flex-1 btn-primary text-xs py-2 justify-center">
                    Listo
                  </button>
                )}
              </div>
              <p className="text-[10px] text-zinc-400 mt-3">
                Los atributos se guardan junto con el producto — acordate de tocar “Guardar” al terminar.
              </p>
            </div>
          </div>
        )
      })()}

      {/* ── Color picker — modal fijo centrado, siempre arriba de todo y sin
          necesidad de scrollear para verlo entero (antes colgaba del botón
          y en pantallas chicas quedaba cortado) ──────────────────────────── */}
      {pickerForCol !== null && (() => {
        const colId = pickerForCol
        const col = cols.find(c => c.id === colId)
        if (!col) return null
        const isFav = favoriteColors.some(f => f.hex.toLowerCase() === pickerHex.toLowerCase())
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div ref={pickerRef}
              className="bg-white border border-zinc-200 rounded-xl shadow-xl p-4 w-72 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-zinc-700">Elegir color</p>
                <button type="button" onClick={() => setPickerForCol(null)} className="text-zinc-400 hover:text-zinc-600">
                  <X size={14} />
                </button>
              </div>
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">Hex</p>
              <div className="flex items-center gap-3 mb-3">
                <input type="color" value={pickerHex}
                  onChange={e => setPickerHex(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border-0 p-0" />
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Seleccionado</p>
                  <p className="text-sm font-semibold text-zinc-800 font-mono">{pickerHex}</p>
                </div>
              </div>

              <div className="h-px bg-zinc-100 mb-3" />

              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">Nombre</p>
              <input
                type="text"
                value={col.name}
                onChange={e => renameColumn(colId, e.target.value)}
                placeholder="Ej: Azul"
                className="w-full text-sm border border-zinc-200 rounded-lg px-2.5 py-2 mb-1 focus:outline-none focus:border-primary-400"
              />
              <p className="text-[10px] text-zinc-400 mb-3">
                Se sugiere solo. Cambiarlo no toca el hex de arriba.
              </p>

              <div className="h-px bg-zinc-100 mb-3" />

              {'EyeDropper' in window && (
                <button type="button" onClick={() => launchEyeDropper(colId)}
                  className="w-full flex items-center justify-center gap-2 text-xs py-2 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors mb-3">
                  <Pipette size={13} /> Cuentagotas — clickeá en la foto
                </button>
              )}

              {favoriteColors.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-primary-400 uppercase tracking-wide mb-1.5">Tus favoritos</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {favoriteColors.map(fav => (
                      <div key={fav.hex} className="relative group">
                        <button type="button" title={fav.name}
                          onClick={() => { setPickerHex(fav.hex); renameColumn(colId, fav.name) }}
                          style={{ backgroundColor: fav.hex }}
                          className={`w-6 h-6 rounded-full border transition-all hover:scale-110 ${pickerHex.toLowerCase() === fav.hex.toLowerCase() ? 'border-primary-500 scale-110' : 'border-zinc-300'}`} />
                        {onToggleFavorite && (
                          <button type="button" onClick={() => onToggleFavorite(fav)} title="Sacar de favoritos"
                            className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-500 text-white rounded-full items-center justify-center hidden group-hover:flex">
                            <X size={8} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="h-px bg-zinc-100 mb-3" />
                </>
              )}

              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">Paleta rápida</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {Object.entries(COLOR_MAP).map(([name, hex]) => (
                  <button key={name} type="button" title={name}
                    onClick={() => {
                      setPickerHex(hex)
                      // Mismo criterio que favoritos: autocompletar el nombre al
                      // tocar el swatch, salvo que el tenant ya haya tipeado uno propio.
                      if (!col.name.trim() || isPlaceholderName(col.name)) renameColumn(colId, name)
                    }}
                    style={{ backgroundColor: hex }}
                    className={`w-5 h-5 rounded-full border transition-all hover:scale-110 ${pickerHex === hex ? 'border-primary-500 scale-110' : 'border-zinc-200'}`} />
                ))}
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={() => applyPickerColor(colId)}
                  className="flex-1 btn-primary text-xs py-2 justify-center">
                  Aplicar — {pickerHex}
                </button>
                {onToggleFavorite && (
                  <button type="button"
                    onClick={() => onToggleFavorite({ name: col.name.trim() || nearestColorName(pickerHex) || 'Color', hex: pickerHex })}
                    title={isFav ? 'Sacar de favoritos' : 'Guardar como favorito'}
                    className={`px-3 rounded-lg border flex items-center justify-center transition-colors flex-shrink-0 ${isFav ? 'border-amber-300 bg-amber-50 text-amber-500' : 'border-zinc-200 text-zinc-400 hover:text-amber-500 hover:border-amber-300'}`}>
                    <Star size={14} fill={isFav ? 'currentColor' : 'none'} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
})

VariantMatrix.displayName = 'VariantMatrix'

export default VariantMatrix

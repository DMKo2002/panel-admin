'use client'

import { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react'
import { Plus, Pipette, X } from 'lucide-react'

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

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '').trim()
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean
  if (!/^[0-9A-Fa-f]{6}$/.test(full)) return null
  return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16) }
}

// Paleta estándar de nombres de color HTML/CSS (los 147 "named colors" de la
// especificación) — es la fuente que se usa para SUGERIR un nombre por default
// cuando el tenant elige un hex. Separada de COLOR_MAP (que es la paleta corta
// en español para los botones rápidos del selector y el fallback de colorToHex).
const CSS_NAMED_COLORS: [string, string][] = [
  ['Azul Alicia', '#F0F8FF'], ['Blanco Antiguo', '#FAEBD7'], ['Aqua', '#00FFFF'], ['Aguamarina', '#7FFFD4'],
  ['Azur', '#F0FFFF'], ['Beige', '#F5F5DC'], ['Bizcocho', '#FFE4C4'], ['Negro', '#000000'],
  ['Almendra', '#FFEBCD'], ['Azul', '#0000FF'], ['Azul Violeta', '#8A2BE2'], ['Marrón', '#A52A2A'],
  ['Madera', '#DEB887'], ['Azul Cadete', '#5F9EA0'], ['Verde Chartreuse', '#7FFF00'], ['Chocolate', '#D2691E'],
  ['Coral', '#FF7F50'], ['Azul Aciano', '#6495ED'], ['Seda de Maíz', '#FFF8DC'], ['Carmesí', '#DC143C'],
  ['Cian', '#00FFFF'], ['Azul Oscuro', '#00008B'], ['Cian Oscuro', '#008B8B'], ['Dorado Oscuro', '#B8860B'],
  ['Gris Oscuro', '#A9A9A9'], ['Verde Oscuro', '#006400'], ['Caqui Oscuro', '#BDB76B'], ['Magenta Oscuro', '#8B008B'],
  ['Verde Oliva Oscuro', '#556B2F'], ['Naranja Oscuro', '#FF8C00'], ['Orquídea Oscuro', '#9932CC'], ['Rojo Oscuro', '#8B0000'],
  ['Salmón Oscuro', '#E9967A'], ['Verde Mar Oscuro', '#8FBC8F'], ['Azul Pizarra Oscuro', '#483D8B'], ['Gris Pizarra Oscuro', '#2F4F4F'],
  ['Turquesa Oscuro', '#00CED1'], ['Violeta Oscuro', '#9400D3'], ['Rosa Intenso', '#FF1493'], ['Celeste Intenso', '#00BFFF'],
  ['Gris Tenue', '#696969'], ['Azul Dodger', '#1E90FF'], ['Ladrillo', '#B22222'], ['Blanco Floral', '#FFFAF0'],
  ['Verde Bosque', '#228B22'], ['Fucsia', '#FF00FF'], ['Gris Perla', '#DCDCDC'], ['Blanco Fantasma', '#F8F8FF'],
  ['Dorado', '#FFD700'], ['Vara de Oro', '#DAA520'], ['Gris', '#808080'], ['Verde', '#008000'],
  ['Verde Amarillento', '#ADFF2F'], ['Verde Melón', '#F0FFF0'], ['Rosa Fuerte', '#FF69B4'], ['Rojo Indio', '#CD5C5C'],
  ['Índigo', '#4B0082'], ['Marfil', '#FFFFF0'], ['Caqui', '#F0E68C'], ['Lavanda', '#E6E6FA'],
  ['Rosa Lavanda', '#FFF0F5'], ['Verde Césped', '#7CFC00'], ['Amarillo Limón', '#FFFACD'], ['Celeste', '#ADD8E6'],
  ['Coral Claro', '#F08080'], ['Cian Claro', '#E0FFFF'], ['Amarillo Dorado Claro', '#FAFAD2'], ['Gris Claro', '#D3D3D3'],
  ['Verde Claro', '#90EE90'], ['Rosa Claro', '#FFB6C1'], ['Salmón Claro', '#FFA07A'], ['Verde Mar Claro', '#20B2AA'],
  ['Celeste Cielo Claro', '#87CEFA'], ['Gris Pizarra Claro', '#778899'], ['Azul Acero Claro', '#B0C4DE'], ['Amarillo Claro', '#FFFFE0'],
  ['Lima', '#00FF00'], ['Verde Lima', '#32CD32'], ['Lino', '#FAF0E6'], ['Magenta', '#FF00FF'],
  ['Granate', '#800000'], ['Aguamarina Medio', '#66CDAA'], ['Azul Medio', '#0000CD'], ['Orquídea Medio', '#BA55D3'],
  ['Púrpura Medio', '#9370DB'], ['Verde Mar Medio', '#3CB371'], ['Azul Pizarra Medio', '#7B68EE'], ['Verde Primavera Medio', '#00FA9A'],
  ['Turquesa Medio', '#48D1CC'], ['Rojo Violeta Medio', '#C71585'], ['Azul Medianoche', '#191970'], ['Crema de Menta', '#F5FFFA'],
  ['Rosa Neblina', '#FFE4E1'], ['Mocasín', '#FFE4B5'], ['Blanco Navajo', '#FFDEAD'], ['Azul Marino', '#000080'],
  ['Encaje Antiguo', '#FDF5E6'], ['Oliva', '#808000'], ['Verde Oliva', '#6B8E23'], ['Naranja', '#FFA500'],
  ['Rojo Anaranjado', '#FF4500'], ['Orquídea', '#DA70D6'], ['Dorado Pálido', '#EEE8AA'], ['Verde Pálido', '#98FB98'],
  ['Turquesa Pálido', '#AFEEEE'], ['Rojo Violeta Pálido', '#DB7093'], ['Papaya', '#FFEFD5'], ['Durazno', '#FFDAB9'],
  ['Perú', '#CD853F'], ['Rosa', '#FFC0CB'], ['Ciruela', '#DDA0DD'], ['Azul Polvo', '#B0E0E6'],
  ['Púrpura', '#800080'], ['Púrpura Rebecca', '#663399'], ['Rojo', '#FF0000'], ['Marrón Rosado', '#BC8F8F'],
  ['Azul Real', '#4169E1'], ['Marrón Silla', '#8B4513'], ['Salmón', '#FA8072'], ['Marrón Arena', '#F4A460'],
  ['Verde Mar', '#2E8B57'], ['Concha de Mar', '#FFF5EE'], ['Siena', '#A0522D'], ['Plateado', '#C0C0C0'],
  ['Celeste Cielo', '#87CEEB'], ['Azul Pizarra', '#6A5ACD'], ['Gris Pizarra', '#708090'], ['Blanco Nieve', '#FFFAFA'],
  ['Verde Primavera', '#00FF7F'], ['Azul Acero', '#4682B4'], ['Bronceado', '#D2B48C'], ['Verde Azulado', '#008080'],
  ['Cardo', '#D8BFD8'], ['Tomate', '#FF6347'], ['Turquesa', '#40E0D0'], ['Violeta', '#EE82EE'],
  ['Trigo', '#F5DEB3'], ['Blanco', '#FFFFFF'], ['Humo Blanco', '#F5F5F5'], ['Amarillo', '#FFFF00'],
  ['Verde Amarillo', '#9ACD32'],
]

// Nombre HTML/CSS más cercano al hex elegido, por distancia RGB — se usa para
// sugerir un nombre por default cuando el tenant elige un hex con el
// cuentagotas/selector y todavía no le puso nombre propio.
export function nearestColorName(hex: string): string {
  const target = hexToRgb(hex)
  if (!target) return ''
  let best = ''
  let bestDist = Infinity
  for (const [label, h] of CSS_NAMED_COLORS) {
    const rgb = hexToRgb(h)
    if (!rgb) continue
    const dist = (rgb.r - target.r) ** 2 + (rgb.g - target.g) ** 2 + (rgb.b - target.b) ** 2
    if (dist < bestDist) { bestDist = dist; best = label }
  }
  return best
}

// "nuevo" / "nuevo-2" son los placeholders que pone addColor(); un nombre que
// es literalmente un código hex (ej: "#CD5C5C") es el resto de datos viejos
// de antes de separar nombre/hex — en ningún caso es un nombre "tipeado a
// propósito" por el tenant, así que en ambos casos está bien pisarlo con la
// sugerencia automática. Apenas escribe un nombre de verdad, nunca más se
// lo tocamos automáticamente.
export function isPlaceholderName(name: string): boolean {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return true
  if (/^nuevo(-\d+)?$/i.test(trimmed)) return true
  if (/^#[0-9A-Fa-f]{3,8}$/.test(trimmed)) return true
  return false
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface CellData {
  variantId?: string   // defined for existing variants (edit mode)
  stock: number
  retailPrice: number
  retailCompareAt: number
  wholesalePrice: number
  wholesaleCompareAt: number
  wholesaleMinQty: number
}

export interface VariantForSave {
  id?: string
  size: string | null
  color: string | null
  colorHex: string | null
  attrs: Record<string, string>
  stock: number
  retailPrice: number
  retailCompareAt: number
  wholesalePrice: number
  wholesaleCompareAt: number
  wholesaleMinQty: number
}

export interface VariantMatrixHandle {
  getVariants: () => VariantForSave[]
}

interface Props {
  mode: 'create' | 'edit'
  initialSizes?: string[]
  initialColors?: string[]
  initialColorHexes?: string[]
  initialCells?: Record<string, CellData>
  // En modo "edit" borrar una columna/fila puede implicar borrar variantes
  // reales en la base (con historial de pedidos, etc.) — el padre decide si
  // se puede hacer (confirm + API) y devuelve true/false. Si no se pasa
  // (modo "create"), se borra directo del estado local sin preguntar.
  onRemoveColor?: (color: string) => Promise<boolean>
  onRemoveSize?: (size: string) => Promise<boolean>
}

const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL']
const DEFAULT_COLORS = ['nuevo']

// Key separator — chosen to be unlikely in real size/color names
export const SEP = '\x00'
export const cellKey = (size: string, color: string) => `${size}${SEP}${color}`
const emptyCell = (): CellData => ({ stock: 0, retailPrice: 0, retailCompareAt: 0, wholesalePrice: 0, wholesaleCompareAt: 0, wholesaleMinQty: 6 })

// ── Component ─────────────────────────────────────────────────────────────────
const VariantMatrix = forwardRef<VariantMatrixHandle, Props>(({
  mode,
  initialSizes = DEFAULT_SIZES,
  initialColors = DEFAULT_COLORS,
  initialColorHexes = [],
  initialCells = {},
  onRemoveColor,
  onRemoveSize,
}, ref) => {
  const [sizes, setSizes] = useState<string[]>(initialSizes)
  const [colors, setColors] = useState<string[]>(initialColors)
  // Hex real elegido con cuentagotas/selector — paralelo a `colors` por índice,
  // pero independiente: renombrar el color NUNCA toca este array.
  const [colorHexes, setColorHexes] = useState<string[]>(
    initialColors.map((_, i) => initialColorHexes[i] ?? '')
  )
  const [cells, setCells] = useState<Record<string, CellData>>(() => {
    const init: Record<string, CellData> = {}
    for (const s of initialSizes)
      for (const c of initialColors)
        init[cellKey(s, c)] = initialCells[cellKey(s, c)] ?? emptyCell()
    return init
  })

  // Color picker
  const [pickerForCol, setPickerForCol] = useState<number | null>(null)
  const [pickerHex, setPickerHex] = useState('#1C1C1C')
  const pickerRef = useRef<HTMLDivElement>(null)

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

  // ── Exposed API ────────────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    getVariants: () => {
      const result: VariantForSave[] = []
      for (const size of sizes) {
        colors.forEach((color, ci) => {
          const cell = cells[cellKey(size, color)] ?? emptyCell()
          result.push({
            id: cell.variantId,
            size: size || null,
            color: color || null,
            colorHex: colorHexes[ci] || null,
            attrs: { talle: size, color },
            ...cell,
          })
        })
      }
      return result
    },
  }))

  // ── Cell updaters ──────────────────────────────────────────────────────────
  function updateCell(size: string, color: string, field: keyof CellData, value: any) {
    const key = cellKey(size, color)
    setCells(prev => ({ ...prev, [key]: { ...(prev[key] ?? emptyCell()), [field]: value } }))
  }

  // ── Size (row) management ──────────────────────────────────────────────────
  function addSize() {
    const newSize = ''
    setSizes(prev => [...prev, newSize])
    setCells(prev => {
      const next = { ...prev }
      for (const c of colors) next[cellKey(newSize, c)] = emptyCell()
      return next
    })
  }

  function removeSize(idx: number) {
    const size = sizes[idx]
    setSizes(prev => prev.filter((_, i) => i !== idx))
    setCells(prev => {
      const next = { ...prev }
      for (const c of colors) delete next[cellKey(size, c)]
      return next
    })
  }

  // En modo "edit" esto puede implicar borrar variantes reales en la base
  // (ver onRemoveSize en el padre) — se espera su confirmación antes de
  // tocar el estado local. En modo "create" no hay callback, se borra directo.
  async function handleRemoveSizeClick(idx: number) {
    const size = sizes[idx]
    if (onRemoveSize) {
      const ok = await onRemoveSize(size)
      if (!ok) return
    }
    removeSize(idx)
  }

  function renameSize(idx: number, newName: string) {
    const oldName = sizes[idx]
    setSizes(prev => prev.map((s, i) => i === idx ? newName : s))
    setCells(prev => {
      const next = { ...prev }
      for (const c of colors) {
        const old = cellKey(oldName, c)
        const nk = cellKey(newName, c)
        if (next[old]) { next[nk] = next[old]; delete next[old] }
      }
      return next
    })
  }

  // ── Color (column) management ──────────────────────────────────────────────
  function addColor() {
    // Generate a unique placeholder so it never collides with an existing color name
    const base = 'nuevo'
    const existing = new Set(colors)
    let candidate = base
    let n = 2
    while (existing.has(candidate)) { candidate = `${base}-${n++}` }
    const newColor = candidate
    setColors(prev => [...prev, newColor])
    setColorHexes(prev => [...prev, ''])
    setCells(prev => {
      const next = { ...prev }
      for (const s of sizes) next[cellKey(s, newColor)] = emptyCell()
      return next
    })
  }

  function removeColor(idx: number) {
    const color = colors[idx]
    setColors(prev => prev.filter((_, i) => i !== idx))
    setColorHexes(prev => prev.filter((_, i) => i !== idx))
    setCells(prev => {
      const next = { ...prev }
      for (const s of sizes) delete next[cellKey(s, color)]
      return next
    })
  }

  // En modo "edit" esto puede implicar borrar variantes reales en la base
  // (ver onRemoveColor en el padre) — se espera su confirmación antes de
  // tocar el estado local. En modo "create" no hay callback, se borra directo.
  async function handleRemoveColorClick(idx: number) {
    const color = colors[idx]
    if (onRemoveColor) {
      const ok = await onRemoveColor(color)
      if (!ok) return
    }
    removeColor(idx)
  }

  function renameColor(idx: number, newName: string) {
    const oldName = colors[idx]
    if (oldName === newName) return
    // Si ya existe OTRA columna con ese mismo nombre, renombrar acá pisaría
    // sus datos (precio/stock) al mezclarse bajo la misma cellKey, o dejaría
    // talles huérfanos sin moverse — exactamente el bug que partió variantes
    // en dos. Se bloquea y se avisa en vez de arriesgar el dato.
    const trimmedNew = newName.trim()
    if (trimmedNew && colors.some((c, i) => i !== idx && c.trim().toLowerCase() === trimmedNew.toLowerCase())) {
      alert(`Ya existe un color llamado "${trimmedNew}" en este producto. Para fusionarlos, primero borrá una de las dos columnas duplicadas y volvé a intentar.`)
      return
    }
    setColors(prev => prev.map((c, i) => i === idx ? newName : c))
    setCells(prev => {
      const next = { ...prev }
      for (const s of sizes) {
        const old = cellKey(s, oldName)
        const nk = cellKey(s, newName)
        if (old in next) { next[nk] = next[old]; delete next[old] }
      }
      return next
    })
  }

  // ── Color picker for column header ─────────────────────────────────────────
  // El hex real vive en colorHexes, separado del nombre visible (colors).
  // Cambiar el hex NUNCA pisa un nombre que el tenant ya haya tipeado —
  // solo se autocompleta el nombre si todavía está en el placeholder "nuevo".
  function setColumnHex(colIdx: number, hex: string) {
    setColorHexes(prev => prev.map((h, i) => i === colIdx ? hex : h))
    if (isPlaceholderName(colors[colIdx])) {
      const suggested = nearestColorName(hex)
      if (suggested) renameColor(colIdx, suggested)
    }
  }

  function openPicker(colIdx: number) {
    const existing = colorHexes[colIdx] || (colorToHex(colors[colIdx]) !== '#CCCCCC' ? colorToHex(colors[colIdx]) : '#1C1C1C')
    setPickerHex(existing)
    setPickerForCol(colIdx)
  }

  function applyPickerColor(colIdx: number) {
    setColumnHex(colIdx, pickerHex)
    setPickerForCol(null)
  }

  async function launchEyeDropper(colIdx: number) {
    try {
      // @ts-ignore
      const result = await new window.EyeDropper().open()
      setColumnHex(colIdx, result.sRGBHex)
      setPickerForCol(null)
    } catch { }
  }

  // ── Bulk edit ──────────────────────────────────────────────────────────────
  function applyBulk() {
    setCells(prev => {
      const next = { ...prev }
      for (const s of sizes) {
        for (const c of colors) {
          const key = cellKey(s, c)
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Bulk edit panel ────────────────────────────────────────────────── */}
      <div className="bg-violet-50 border border-violet-100 rounded-xl p-4">
        <p className="text-xs font-semibold text-violet-700 mb-3">Editar todas las celdas a la vez</p>
        <div className="flex flex-wrap items-end gap-3">
          {[
            { label: 'Stock', field: 'stock' as const, w: 'w-20' },
            { label: '$ Minorista', field: 'retail' as const, w: 'w-28' },
            { label: '$ Min. rebajado', field: 'compareRetail' as const, w: 'w-28' },
            { label: '$ Mayorista', field: 'wholesale' as const, w: 'w-28' },
            { label: '$ May. rebajado', field: 'compareWholesale' as const, w: 'w-28' },
          ].map(({ label, field, w }) => (
            <div key={field}>
              <label className="block text-xs text-violet-600 mb-1">{label}</label>
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
            className="btn-primary text-xs py-2 px-4 bg-violet-600 hover:bg-violet-700 border-violet-600">
            Aplicar a todas
          </button>
        </div>
        <p className="text-[10px] text-violet-400 mt-2">Solo los campos que completes se van a aplicar. Los demás se dejan como están.</p>
      </div>

      {/* ── Matrix table ───────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="border-collapse w-full">
          <thead>
            <tr className="bg-zinc-50">
              {/* Top-left: add color button */}
              <th className="px-3 py-3 text-left border-b border-r border-zinc-200 sticky left-0 bg-zinc-50 z-10 min-w-[90px]">
                <button type="button" onClick={addColor}
                  className="text-[11px] text-violet-600 hover:text-violet-700 flex items-center gap-1 font-medium">
                  <Plus size={11} /> Color
                </button>
              </th>

              {/* Color column headers */}
              {colors.map((color, ci) => (
                <th key={ci} className="px-2 py-2 border-b border-r border-zinc-200 last:border-r-0 min-w-[150px]">
                  <div className="relative flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1.5">
                      {/* Color swatch — usa el hex guardado; si todavía no eligió uno, lo deriva del nombre */}
                      <button type="button" onClick={() => openPicker(ci)}
                        style={{ backgroundColor: colorHexes[ci] || colorToHex(color) }}
                        title="Elegir color"
                        className="w-5 h-5 rounded-full border border-zinc-300 flex-shrink-0 hover:scale-110 transition-transform shadow-sm" />
                      {/* Color name input — texto libre, nunca se pisa automáticamente */}
                      <input
                        className="text-xs font-semibold text-zinc-700 bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-violet-400 focus:outline-none text-center capitalize"
                        style={{ width: '80px' }}
                        value={color}
                        onChange={e => renameColor(ci, e.target.value)}
                        placeholder="Color..."
                      />
                      {/* Borrar columna — en modo edición pide confirmación y borra las variantes reales */}
                      {colors.length > 1 && (
                        <button type="button" onClick={() => handleRemoveColorClick(ci)}
                          title="Eliminar este color"
                          className="text-zinc-300 hover:text-red-400 transition-colors flex-shrink-0">
                          <X size={11} />
                        </button>
                      )}
                    </div>

                    {/* Color picker popup */}
                    {pickerForCol === ci && (
                      <div ref={pickerRef}
                        className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 bg-white border border-zinc-200 rounded-xl shadow-xl p-4 w-64">
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
                          value={color}
                          onChange={e => renameColor(ci, e.target.value)}
                          placeholder="Ej: Azul"
                          className="w-full text-sm border border-zinc-200 rounded-lg px-2.5 py-2 mb-1 focus:outline-none focus:border-violet-400"
                        />
                        <p className="text-[10px] text-zinc-400 mb-3">
                          Se sugiere solo. Cambiarlo no toca el hex de arriba.
                        </p>

                        <div className="h-px bg-zinc-100 mb-3" />

                        {'EyeDropper' in window && (
                          <button type="button" onClick={() => launchEyeDropper(ci)}
                            className="w-full flex items-center justify-center gap-2 text-xs py-2 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors mb-3">
                            <Pipette size={13} /> Cuentagotas — clickeá en la foto
                          </button>
                        )}
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {Object.entries(COLOR_MAP).map(([name, hex]) => (
                            <button key={name} type="button" title={name}
                              onClick={() => setPickerHex(hex)}
                              style={{ backgroundColor: hex }}
                              className={`w-5 h-5 rounded-full border transition-all hover:scale-110 ${pickerHex === hex ? 'border-violet-500 scale-110' : 'border-zinc-200'}`} />
                          ))}
                        </div>
                        <button type="button" onClick={() => applyPickerColor(ci)}
                          className="w-full btn-primary text-xs py-2 justify-center">
                          Aplicar — {pickerHex}
                        </button>
                      </div>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {sizes.map((size, si) => (
              <tr key={si} className="border-t border-zinc-100 hover:bg-zinc-50/30 transition-colors">
                {/* Size label cell */}
                <td className="px-3 py-2 border-r border-zinc-200 sticky left-0 bg-white z-10">
                  <div className="flex items-center gap-1.5">
                    <input
                      className="text-xs font-semibold text-zinc-700 bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-violet-400 focus:outline-none"
                      style={{ width: '56px' }}
                      value={size}
                      onChange={e => renameSize(si, e.target.value)}
                      placeholder="Talle..."
                    />
                    {sizes.length > 1 && (
                      <button type="button" onClick={() => handleRemoveSizeClick(si)}
                        title="Eliminar este talle"
                        className="text-zinc-300 hover:text-red-400 transition-colors flex-shrink-0">
                        <X size={11} />
                      </button>
                    )}
                  </div>
                </td>

                {/* Data cells */}
                {colors.map((color, ci) => {
                  const key = cellKey(size, color)
                  const cell = cells[key] ?? emptyCell()

                  return (
                    <td key={ci} className="p-1.5 border-r border-zinc-100 last:border-r-0 align-top">
                      <div className="rounded-lg border border-zinc-100 bg-white hover:border-zinc-200 transition-all divide-y divide-zinc-100">

                        {/* Fila 1 — Stock (ancho completo) */}
                        <div className="p-1.5">
                          <p className="text-[9px] text-zinc-400 leading-none mb-1">Stock</p>
                          <input
                            className="w-full text-sm font-semibold border border-zinc-200 rounded px-1.5 py-1.5 focus:outline-none focus:border-violet-400 bg-white text-center"
                            type="number" min="0"
                            value={cell.stock || ''}
                            placeholder="0"
                            onChange={e => updateCell(size, color, 'stock', parseInt(e.target.value, 10) || 0)}
                          />
                        </div>

                        {/* Fila 2 — Minorista | Minorista rebajado */}
                        <div className="grid grid-cols-2 divide-x divide-zinc-100">
                          <div className="p-1.5">
                            <p className="text-[9px] text-zinc-400 leading-none mb-1">$ Min.</p>
                            <input
                              className="w-full text-xs border border-zinc-200 rounded px-1 py-1 focus:outline-none focus:border-violet-400 bg-white text-center"
                              type="number" min="0" step="1"
                              value={cell.retailPrice || ''}
                              placeholder="0"
                              onChange={e => updateCell(size, color, 'retailPrice', Math.round(parseFloat(e.target.value) || 0))}
                            />
                          </div>
                          <div className="p-1.5 bg-orange-50/50">
                            <p className="text-[9px] text-orange-400 leading-none mb-1">$ Min. reb.</p>
                            <input
                              className="w-full text-xs border border-orange-100 rounded px-1 py-1 focus:outline-none focus:border-orange-300 bg-white text-center"
                              type="number" min="0" step="1"
                              value={cell.retailCompareAt || ''}
                              placeholder="0"
                              onChange={e => updateCell(size, color, 'retailCompareAt', Math.round(parseFloat(e.target.value) || 0))}
                            />
                          </div>
                        </div>

                        {/* Fila 3 — Mayorista | Mayorista rebajado */}
                        <div className="grid grid-cols-2 divide-x divide-violet-100">
                          <div className="p-1.5 bg-violet-50/40">
                            <p className="text-[9px] text-violet-500 leading-none mb-1">$ May.</p>
                            <input
                              className="w-full text-xs border border-violet-100 rounded px-1 py-1 focus:outline-none focus:border-violet-400 bg-white text-center"
                              type="number" min="0" step="1"
                              value={cell.wholesalePrice || ''}
                              placeholder="0"
                              onChange={e => updateCell(size, color, 'wholesalePrice', Math.round(parseFloat(e.target.value) || 0))}
                            />
                          </div>
                          <div className="p-1.5 bg-violet-50/40">
                            <p className="text-[9px] text-violet-400 leading-none mb-1">$ May. reb.</p>
                            <input
                              className="w-full text-xs border border-violet-100 rounded px-1 py-1 focus:outline-none focus:border-violet-400 bg-white text-center"
                              type="number" min="0" step="1"
                              value={cell.wholesaleCompareAt || ''}
                              placeholder="0"
                              onChange={e => updateCell(size, color, 'wholesaleCompareAt', Math.round(parseFloat(e.target.value) || 0))}
                            />
                          </div>
                        </div>

                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}

            {/* Add size row */}
            <tr className="border-t border-zinc-100">
              <td className="px-3 py-2 sticky left-0 bg-white">
                <button type="button" onClick={addSize}
                  className="text-[11px] text-violet-600 hover:text-violet-700 flex items-center gap-1 font-medium">
                  <Plus size={11} /> Talle
                </button>
              </td>
              {colors.map((_, ci) => <td key={ci} />)}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-400">
        Cada celda muestra: stock · precio minorista · precio min. rebajado (tachado) · precio mayorista · precio may. rebajado · Solo completá los campos que aplican
      </p>
    </div>
  )
})

export default VariantMatrix

'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Badge from '@/components/Badge'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, ImageOff, Search, X, SlidersHorizontal, LayoutGrid, List, Trash2, CheckSquare, Square,
  ArrowUpDown, GripVertical, MoveVertical, ArrowUpToLine, ArrowDownToLine, Loader2, Check,
} from 'lucide-react'

interface ProductItem {
  id: string
  name: string
  sku?: string
  active: boolean
  cover?: string | null
  retailPrice?: number
  wholesalePrice?: number
  compareAtPrice?: number
  totalStock: number
  colors: string[]
  category?: string
  // Orden manual del tenant — menor aparece primero. Ver "Editar orden" abajo.
  sortOrder: number
}

interface ProductosGridProps {
  products: ProductItem[]
  categories: { id: string; name: string; slug: string }[]
  ignoreStock?: boolean
}

const formatPrice = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

async function deleteProduct(supabase: ReturnType<typeof createClient>, id: string) {
  const { data: variantRows } = await supabase.from('variants').select('id').eq('product_id', id)
  const variantIds = (variantRows ?? []).map((v: any) => v.id)
  if (variantIds.length > 0) {
    await supabase.from('price_rules').delete().in('variant_id', variantIds)
    await supabase.from('variants').delete().in('id', variantIds)
  }
  await supabase.from('product_images').delete().eq('product_id', id)
  await supabase.from('products').delete().eq('id', id)
}

export default function ProductosGrid({ products, categories, ignoreStock = false }: ProductosGridProps) {
  const router = useRouter()
  const supabase = createClient()

  const [q, setQ] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [stockFilter, setStockFilter] = useState<'all' | 'sin_stock' | 'bajo' | 'ok'>('all')
  const [discountOnly, setDiscountOnly] = useState(false)
  const [orden, setOrden] = useState<'reciente' | 'precio-asc' | 'precio-desc' | 'nombre' | 'stock-asc'>('reciente')
  const [showFilters, setShowFilters] = useState(false)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  // ── Editar orden (drag & drop, estilo springboard de iOS) ──────────────────
  // Modo aparte: mientras está activo se ignoran búsqueda/filtros/orden y se
  // muestran TODOS los productos (activos e inactivos) en su sort_order
  // actual, para que arrastrar tenga sentido (vecinos reales, no de una
  // sublista filtrada). orderedList vive en estado propio, separado de
  // `products` (prop), y se resincroniza cada vez que se entra al modo.
  const [editingOrder, setEditingOrder] = useState(false)
  const [orderedList, setOrderedList] = useState<ProductItem[]>([])
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [moveMenuFor, setMoveMenuFor] = useState<string | null>(null)
  const [savingOrder, setSavingOrder] = useState(false)

  function startEditingOrder() {
    setOrderedList([...products].sort((a, b) => a.sortOrder - b.sortOrder))
    setEditingOrder(true)
  }

  function finishEditingOrder() {
    setEditingOrder(false)
    setMoveMenuFor(null)
    router.refresh()
  }

  async function persistOrder(list: ProductItem[]) {
    setSavingOrder(true)
    try {
      await Promise.all(
        list.map((p, i) => supabase.from('products').update({ sort_order: (i + 1) * 10 }).eq('id', p.id))
      )
    } finally {
      setSavingOrder(false)
    }
  }

  function reorder(fromId: string, toId: string) {
    if (fromId === toId) return
    setOrderedList(prev => {
      const next = [...prev]
      const fromIdx = next.findIndex(p => p.id === fromId)
      const toIdx = next.findIndex(p => p.id === toId)
      if (fromIdx === -1 || toIdx === -1) return prev
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      persistOrder(next)
      return next
    })
  }

  function moveToEnd(id: string, position: 'top' | 'bottom') {
    setOrderedList(prev => {
      const next = prev.filter(p => p.id !== id)
      const moved = prev.find(p => p.id === id)
      if (!moved) return prev
      position === 'top' ? next.unshift(moved) : next.push(moved)
      persistOrder(next)
      return next
    })
    setMoveMenuFor(null)
  }

  const filtered = useMemo(() => {
    let list = [...products]
    if (q.trim()) {
      const term = q.toLowerCase()
      list = list.filter(p =>
        p.name.toLowerCase().includes(term) ||
        (p.sku != null && p.sku.toLowerCase().includes(term))
      )
    }
    if (catFilter) list = list.filter(p => p.category === catFilter)
    if (stockFilter === 'sin_stock') list = list.filter(p => p.totalStock === 0)
    else if (stockFilter === 'bajo') list = list.filter(p => p.totalStock > 0 && p.totalStock <= 3)
    else if (stockFilter === 'ok') list = list.filter(p => p.totalStock > 3)
    if (discountOnly) list = list.filter(p => p.compareAtPrice && p.compareAtPrice > (p.retailPrice ?? 0))
    switch (orden) {
      case 'precio-asc': list.sort((a, b) => (a.retailPrice ?? 0) - (b.retailPrice ?? 0)); break
      case 'precio-desc': list.sort((a, b) => (b.retailPrice ?? 0) - (a.retailPrice ?? 0)); break
      case 'nombre': list.sort((a, b) => a.name.localeCompare(b.name, 'es')); break
      case 'stock-asc': list.sort((a, b) => a.totalStock - b.totalStock); break
    }
    return list
  }, [products, q, catFilter, stockFilter, discountOnly, orden])

  const activeFilterCount = [
    catFilter,
    stockFilter !== 'all' ? stockFilter : '',
    discountOnly ? 'discount' : '',
  ].filter(Boolean).length

  function clearFilters() {
    setCatFilter(''); setStockFilter('all'); setDiscountOnly(false); setOrden('reciente'); setQ('')
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length && filtered.length > 0) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(p => p.id)))
    }
  }

  async function handleDeleteSingle(id: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('¿Eliminar este producto? Se eliminarán también sus variantes e imágenes.')) return
    setDeleting(true)
    try {
      await deleteProduct(supabase, id)
      router.refresh()
    } catch { }
    setDeleting(false)
  }

  async function handleBulkDelete() {
    setDeleting(true)
    try {
      for (const id of Array.from(selected)) {
        await deleteProduct(supabase, id)
      }
      setSelected(new Set())
      setConfirmBulkDelete(false)
      router.refresh()
    } catch { }
    setDeleting(false)
  }

  const EmptyState = () => (
    products.length === 0 ? (
      <div className="py-16 text-center">
        <p className="text-zinc-400 mb-4">Todavia no hay productos cargados</p>
        <Link href="/dashboard/productos/nuevo" className="btn-primary inline-flex">
          <Plus size={16} /> Crear primer producto
        </Link>
      </div>
    ) : (
      <div className="py-16 text-center">
        <p className="text-zinc-400 mb-2">No hay productos con los filtros aplicados</p>
        <button onClick={clearFilters} className="text-sm text-zinc-500 underline hover:text-zinc-700">Limpiar filtros</button>
      </div>
    )
  )

  return (
    <div>
      {/* Barra de busqueda y controles */}
      <div className="px-8 py-4 border-b border-zinc-200 bg-white flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text" value={q} onChange={e => setQ(e.target.value)}
              placeholder="Buscar por nombre o SKU..."
              className="w-full pl-9 pr-8 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 transition-colors"
            />
            {q && (
              <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700">
                <X size={14} />
              </button>
            )}
          </div>

          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-colors ${showFilters || activeFilterCount > 0 ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 text-zinc-600 hover:border-zinc-400'}`}
          >
            <SlidersHorizontal size={15} />
            Filtros
            {activeFilterCount > 0 && (
              <span className={`text-xs font-medium rounded-full px-1.5 ${showFilters || activeFilterCount > 0 ? 'bg-white text-zinc-900' : 'bg-zinc-800 text-white'}`}>
                {activeFilterCount}
              </span>
            )}
          </button>

          <select
            value={orden} onChange={e => setOrden(e.target.value as any)}
            className="text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-zinc-400 transition-colors text-zinc-600 bg-white"
          >
            <option value="reciente">Orden manual</option>
            <option value="precio-asc">Precio arriba</option>
            <option value="precio-desc">Precio abajo</option>
            <option value="nombre">Nombre A-Z</option>
            <option value="stock-asc">Stock arriba</option>
          </select>

          {/* Vista toggle */}
          <div className="flex items-center border border-zinc-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setView('grid')}
              className={`p-2 transition-colors ${view === 'grid' ? 'bg-zinc-900 text-white' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50'}`}
              title="Vista galeria"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setView('list')}
              className={`p-2 transition-colors ${view === 'list' ? 'bg-zinc-900 text-white' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50'}`}
              title="Vista lista"
            >
              <List size={15} />
            </button>
          </div>

          <button
            onClick={startEditingOrder}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-zinc-200 text-zinc-600 rounded-lg hover:border-zinc-400 transition-colors"
            title="Arrastrar para reordenar los productos en la tienda"
          >
            <ArrowUpDown size={15} />
            Editar orden
          </button>

          <span className="text-sm text-zinc-400 ml-auto">{filtered.length} productos</span>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <button
              onClick={() => setConfirmBulkDelete(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2 size={14} />
              Eliminar {selected.size} seleccionados
            </button>
          )}
        </div>

        {showFilters && (
          <div className="flex flex-wrap items-center gap-4 pt-1 pb-1">
            {categories.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Categoria</span>
                <div className="flex gap-1">
                  <button onClick={() => setCatFilter('')} className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${!catFilter ? 'bg-zinc-900 text-white border-zinc-900' : 'border-zinc-200 text-zinc-600 hover:border-zinc-400'}`}>Todas</button>
                  {categories.map(c => (
                    <button key={c.id} onClick={() => setCatFilter(catFilter === c.slug ? '' : c.slug)} className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${catFilter === c.slug ? 'bg-zinc-900 text-white border-zinc-900' : 'border-zinc-200 text-zinc-600 hover:border-zinc-400'}`}>{c.name}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Stock</span>
              <div className="flex gap-1">
                {([
                  { value: 'all', label: 'Todos' },
                  { value: 'sin_stock', label: 'Sin stock' },
                  { value: 'bajo', label: 'Stock bajo' },
                  { value: 'ok', label: 'OK' },
                ] as const).map(opt => (
                  <button key={opt.value} onClick={() => setStockFilter(opt.value)} className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${stockFilter === opt.value ? 'bg-zinc-900 text-white border-zinc-900' : 'border-zinc-200 text-zinc-600 hover:border-zinc-400'}`}>{opt.label}</button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={discountOnly} onChange={e => setDiscountOnly(e.target.checked)} className="w-4 h-4 accent-zinc-900 rounded" />
              <span className="text-xs text-zinc-600">Solo en descuento</span>
            </label>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="text-xs text-zinc-400 hover:text-zinc-700 underline transition-colors ml-auto">Limpiar filtros</button>
            )}
          </div>
        )}
      </div>

      {/* Bulk delete modal */}
      {confirmBulkDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-zinc-200 p-6 max-w-sm w-full mx-4 shadow-xl">
            <h2 className="text-base font-semibold text-zinc-900 mb-2">¿Eliminar {selected.size} productos?</h2>
            <p className="text-sm text-zinc-500 mb-5">Se eliminarán también todas sus variantes, precios e imágenes. Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button onClick={handleBulkDelete} disabled={deleting} className="flex-1 py-2 px-4 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition-colors">
                {deleting ? 'Eliminando...' : 'Sí, eliminar todo'}
              </button>
              <button onClick={() => setConfirmBulkDelete(false)} className="flex-1 btn-secondary justify-center">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {editingOrder && (
        <div className="sticky top-[73px] z-10 px-8 py-3 border-b border-amber-200 bg-amber-50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <ArrowUpDown size={15} />
            <span>Arrastrá los productos para reordenarlos — así se van a ver en tu tienda.</span>
            {savingOrder && <span className="flex items-center gap-1 text-amber-600"><Loader2 size={13} className="animate-spin" /> Guardando...</span>}
          </div>
          <button onClick={finishEditingOrder} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors">
            <Check size={14} /> Listo
          </button>
        </div>
      )}

      <div className="px-8 py-6">

        {/* MODO EDITAR ORDEN — grilla arrastrable estilo springboard de iOS */}
        {editingOrder && (
          <div className="grid grid-cols-3 gap-4">
            {orderedList.map((product) => (
              <div
                key={product.id}
                draggable
                onDragStart={() => setDraggingId(product.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (draggingId) reorder(draggingId, product.id) }}
                onDragEnd={() => setDraggingId(null)}
                className={`relative bg-white rounded-xl border overflow-hidden cursor-grab active:cursor-grabbing transition-opacity ${draggingId === product.id ? 'opacity-40' : 'border-zinc-200'}`}
              >
                <div className="absolute top-2 left-2 z-10 w-6 h-6 bg-white/90 rounded-full flex items-center justify-center text-zinc-400 shadow-sm">
                  <GripVertical size={14} />
                </div>

                {/* Botón "Mover a" — alternativa al drag para no arriesgar un mover-arriba de más */}
                <div className="absolute top-2 right-2 z-10">
                  <button
                    onClick={() => setMoveMenuFor(moveMenuFor === product.id ? null : product.id)}
                    className="w-6 h-6 bg-white/90 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-white transition-colors shadow-sm"
                    title="Mover a..."
                  >
                    <MoveVertical size={13} />
                  </button>
                  {moveMenuFor === product.id && (
                    <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg border border-zinc-200 shadow-lg overflow-hidden">
                      <button
                        onClick={() => moveToEnd(product.id, 'top')}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left text-zinc-600 hover:bg-zinc-50 transition-colors"
                      >
                        <ArrowUpToLine size={13} /> Mover arriba de todo
                      </button>
                      <button
                        onClick={() => moveToEnd(product.id, 'bottom')}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left text-zinc-600 hover:bg-zinc-50 transition-colors border-t border-zinc-100"
                      >
                        <ArrowDownToLine size={13} /> Mover abajo de todo
                      </button>
                    </div>
                  )}
                </div>

                <div className="h-40 bg-zinc-50 flex items-center justify-center relative overflow-hidden pointer-events-none">
                  {product.cover
                    ? <img src={product.cover} alt={product.name} className="w-full h-full object-cover" />
                    : <ImageOff size={28} className="text-zinc-300" />
                  }
                  {!product.active && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                      <Badge variant="zinc">Inactivo</Badge>
                    </div>
                  )}
                </div>
                <div className="p-4 pointer-events-none">
                  <p className="font-medium text-zinc-900 text-sm truncate">{product.name}</p>
                  {product.sku && <p className="text-[11px] text-zinc-400 font-mono mt-0.5">{product.sku}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* VISTA GALERIA */}
        {!editingOrder && view === 'grid' && (
          <div>
            {filtered.length > 0 && (
              <div className="flex items-center gap-2 mb-3">
                <button onClick={toggleSelectAll} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 transition-colors">
                  {selected.size === filtered.length && filtered.length > 0
                    ? <CheckSquare size={14} className="text-zinc-700" />
                    : <Square size={14} />
                  }
                  {selected.size === filtered.length && filtered.length > 0 ? 'Deseleccionar todo' : 'Seleccionar todo'}
                </button>
              </div>
            )}
            <div className="grid grid-cols-3 gap-4">
              {filtered.length === 0 ? (
                <div className="col-span-3"><EmptyState /></div>
              ) : filtered.map((product) => {
                const hasDiscount = product.compareAtPrice && product.compareAtPrice > (product.retailPrice ?? 0)
                const discountPct = hasDiscount ? Math.round((1 - product.retailPrice! / product.compareAtPrice!) * 100) : null
                const isSelected = selected.has(product.id)
                return (
                  <div key={product.id} className={`relative bg-white rounded-xl border overflow-hidden transition-all group ${isSelected ? 'border-primary-400 shadow-sm ring-1 ring-primary-200' : 'border-zinc-200 hover:border-zinc-300 hover:shadow-sm'}`}>
                    {/* Selection checkbox */}
                    <button
                      onClick={() => toggleSelect(product.id)}
                      className="absolute top-2 left-2 z-10 w-5 h-5 rounded flex items-center justify-center transition-opacity"
                      title="Seleccionar"
                    >
                      {isSelected
                        ? <CheckSquare size={16} className="text-primary-600 drop-shadow" />
                        : <Square size={16} className="text-white drop-shadow opacity-0 group-hover:opacity-100 transition-opacity" />
                      }
                    </button>
                    {/* Delete button */}
                    <button
                      onClick={(e) => handleDeleteSingle(product.id, e)}
                      disabled={deleting}
                      className="absolute top-2 right-2 z-10 w-6 h-6 bg-white/90 rounded-full flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-white transition-colors shadow-sm opacity-0 group-hover:opacity-100"
                      title="Eliminar"
                    >
                      <Trash2 size={12} />
                    </button>
                    <Link href={`/dashboard/productos/${product.id}`}>
                      <div className="h-40 bg-zinc-50 flex items-center justify-center relative overflow-hidden">
                        {product.cover
                          ? <img src={product.cover} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          : <ImageOff size={28} className="text-zinc-300" />
                        }
                        {!product.active && (
                          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                            <Badge variant="zinc">Inactivo</Badge>
                          </div>
                        )}
                        {discountPct && (
                          <div className="absolute top-2 left-8 bg-zinc-900 text-white text-[10px] tracking-wide uppercase px-2 py-0.5 rounded">
                            -{discountPct}%
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <p className="font-medium text-zinc-900 text-sm truncate">{product.name}</p>
                        {product.sku && <p className="text-[11px] text-zinc-400 font-mono mt-0.5">{product.sku}</p>}
                        <div className="mt-1.5 space-y-0.5">
                          {product.retailPrice != null && (
                            <p className="text-xs text-zinc-500">
                              Minorista: <span className="text-zinc-800 font-medium">{formatPrice(product.retailPrice)}</span>
                              {hasDiscount && <span className="text-zinc-400 line-through ml-1.5">{formatPrice(product.compareAtPrice!)}</span>}
                            </p>
                          )}
                          {product.wholesalePrice != null && (
                            <p className="text-xs text-zinc-500">Mayorista: <span className="text-zinc-800 font-medium">{formatPrice(product.wholesalePrice)}</span></p>
                          )}
                        </div>
                        <div className="mt-3">
                          {ignoreStock
                            ? <Badge variant="green">Disponible</Badge>
                            : product.totalStock === 0
                            ? <Badge variant="red">Sin stock</Badge>
                            : product.totalStock <= 3
                            ? <Badge variant="amber">Stock bajo: {product.totalStock}</Badge>
                            : <Badge variant="green">Stock: {product.totalStock}</Badge>
                          }
                        </div>
                      </div>
                    </Link>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* VISTA LISTA */}
        {!editingOrder && view === 'list' && (
          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            {filtered.length === 0 ? <EmptyState /> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100">
                    <th className="px-4 py-3 w-8">
                      <button onClick={toggleSelectAll}>
                        {selected.size === filtered.length && filtered.length > 0
                          ? <CheckSquare size={14} className="text-zinc-700" />
                          : <Square size={14} className="text-zinc-300" />
                        }
                      </button>
                    </th>
                    <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3 w-12"></th>
                    <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Producto</th>
                    <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">SKU</th>
                    <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Minorista</th>
                    <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Mayorista</th>
                    <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Stock</th>
                    <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Estado</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((product) => {
                    const hasDiscount = product.compareAtPrice && product.compareAtPrice > (product.retailPrice ?? 0)
                    const isSelected = selected.has(product.id)
                    return (
                      <tr key={product.id} className={`border-b border-zinc-50 transition-colors ${isSelected ? 'bg-primary-50' : 'hover:bg-zinc-50'}`}>
                        <td className="px-4 py-2">
                          <button onClick={() => toggleSelect(product.id)}>
                            {isSelected
                              ? <CheckSquare size={14} className="text-primary-600" />
                              : <Square size={14} className="text-zinc-300" />
                            }
                          </button>
                        </td>
                        <td className="px-4 py-2 cursor-pointer" onClick={() => { window.location.href = `/dashboard/productos/${product.id}` }}>
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-100 flex items-center justify-center flex-shrink-0">
                            {product.cover
                              ? <img src={product.cover} alt={product.name} className="w-full h-full object-cover" />
                              : <ImageOff size={14} className="text-zinc-300" />
                            }
                          </div>
                        </td>
                        <td className="px-4 py-2 cursor-pointer" onClick={() => { window.location.href = `/dashboard/productos/${product.id}` }}>
                          <p className="font-medium text-zinc-900 truncate max-w-xs">{product.name}</p>
                        </td>
                        <td className="px-4 py-2">
                          {product.sku
                            ? <span className="font-mono text-xs text-zinc-500">{product.sku}</span>
                            : <span className="text-zinc-300">-</span>
                          }
                        </td>
                        <td className="px-4 py-2">
                          {product.retailPrice != null ? (
                            <span>
                              <span className="font-medium text-zinc-800">{formatPrice(product.retailPrice)}</span>
                              {hasDiscount && <span className="text-zinc-400 line-through text-xs ml-1.5">{formatPrice(product.compareAtPrice!)}</span>}
                            </span>
                          ) : <span className="text-zinc-300">-</span>}
                        </td>
                        <td className="px-4 py-2">
                          {product.wholesalePrice != null
                            ? <span className="font-medium text-zinc-800">{formatPrice(product.wholesalePrice)}</span>
                            : <span className="text-zinc-300">-</span>
                          }
                        </td>
                        <td className="px-4 py-2">
                          {ignoreStock
                            ? <Badge variant="green">Disponible</Badge>
                            : product.totalStock === 0
                            ? <Badge variant="red">Sin stock</Badge>
                            : product.totalStock <= 3
                            ? <Badge variant="amber">{product.totalStock}</Badge>
                            : <Badge variant="green">{product.totalStock}</Badge>
                          }
                        </td>
                        <td className="px-4 py-2">
                          {product.active ? <Badge variant="green">Activo</Badge> : <Badge variant="zinc">Inactivo</Badge>}
                        </td>
                        <td className="px-4 py-2">
                          <button
                            onClick={(e) => handleDeleteSingle(product.id, e)}
                            disabled={deleting}
                            className="text-zinc-300 hover:text-red-400 transition-colors disabled:opacity-50"
                            title="Eliminar"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

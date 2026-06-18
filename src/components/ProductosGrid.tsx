'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import Badge from '@/components/Badge'
import { Plus, ImageOff, Search, X, SlidersHorizontal, LayoutGrid, List } from 'lucide-react'

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
}

interface ProductosGridProps {
  products: ProductItem[]
  categories: { id: string; name: string; slug: string }[]
}

const formatPrice = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

export default function ProductosGrid({ products, categories }: ProductosGridProps) {
  const [q, setQ] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [stockFilter, setStockFilter] = useState<'all' | 'sin_stock' | 'bajo' | 'ok'>('all')
  const [discountOnly, setDiscountOnly] = useState(false)
  const [orden, setOrden] = useState<'reciente' | 'precio-asc' | 'precio-desc' | 'nombre' | 'stock-asc'>('reciente')
  const [showFilters, setShowFilters] = useState(false)
  const [view, setView] = useState<'grid' | 'list'>('grid')

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
            <option value="reciente">Mas recientes</option>
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

          <span className="text-sm text-zinc-400 ml-auto">{filtered.length} productos</span>
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

      <div className="px-8 py-6">

        {/* VISTA GALERIA */}
        {view === 'grid' && (
          <div className="grid grid-cols-3 gap-4">
            {filtered.length === 0 ? (
              <div className="col-span-3"><EmptyState /></div>
            ) : filtered.map((product) => {
              const hasDiscount = product.compareAtPrice && product.compareAtPrice > (product.retailPrice ?? 0)
              const discountPct = hasDiscount ? Math.round((1 - product.retailPrice! / product.compareAtPrice!) * 100) : null
              return (
                <Link key={product.id} href={`/dashboard/productos/${product.id}`}
                  className="bg-white rounded-xl border border-zinc-200 overflow-hidden hover:border-zinc-300 hover:shadow-sm transition-all cursor-pointer group"
                >
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
                      <div className="absolute top-2 left-2 bg-zinc-900 text-white text-[10px] tracking-wide uppercase px-2 py-0.5 rounded">
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
                      {product.totalStock === 0
                        ? <Badge variant="red">Sin stock</Badge>
                        : product.totalStock <= 3
                        ? <Badge variant="amber">Stock bajo: {product.totalStock}</Badge>
                        : <Badge variant="green">Stock: {product.totalStock}</Badge>
                      }
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {/* VISTA LISTA */}
        {view === 'list' && (
          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            {filtered.length === 0 ? <EmptyState /> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100">
                    <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3 w-12"></th>
                    <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Producto</th>
                    <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">SKU</th>
                    <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Minorista</th>
                    <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Mayorista</th>
                    <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Stock</th>
                    <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((product) => {
                    const hasDiscount = product.compareAtPrice && product.compareAtPrice > (product.retailPrice ?? 0)
                    return (
                      <tr key={product.id} className="border-b border-zinc-50 hover:bg-zinc-50 transition-colors cursor-pointer"
                        onClick={() => { window.location.href = `/dashboard/productos/${product.id}` }}
                      >
                        <td className="px-4 py-2">
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-100 flex items-center justify-center flex-shrink-0">
                            {product.cover
                              ? <img src={product.cover} alt={product.name} className="w-full h-full object-cover" />
                              : <ImageOff size={14} className="text-zinc-300" />
                            }
                          </div>
                        </td>
                        <td className="px-4 py-2">
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
                          {product.totalStock === 0
                            ? <Badge variant="red">Sin stock</Badge>
                            : product.totalStock <= 3
                            ? <Badge variant="amber">{product.totalStock}</Badge>
                            : <Badge variant="green">{product.totalStock}</Badge>
                          }
                        </td>
                        <td className="px-4 py-2">
                          {product.active ? <Badge variant="green">Activo</Badge> : <Badge variant="zinc">Inactivo</Badge>}
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

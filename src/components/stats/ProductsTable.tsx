'use client'

import { useMemo, useState } from 'react'
import { Search, ArrowUp, ArrowDown, Package } from 'lucide-react'

interface ProductAgg {
  productId: string | null
  productName: string
  categoryName: string
  skus: string[]
  variants: string[]
  quantity: number
  netSales: number
}

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

type SortKey = 'quantity' | 'netSales'

export default function ProductsTable({ products }: { products: ProductAgg[] }) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('quantity')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = products
    if (q) {
      list = list.filter(p =>
        p.productName.toLowerCase().includes(q) ||
        p.skus.some(sku => sku.toLowerCase().includes(q))
      )
    }
    const sorted = [...list].sort((a, b) => {
      const diff = a[sortKey] - b[sortKey]
      return sortDir === 'desc' ? -diff : diff
    })
    return sorted
  }, [products, search, sortKey, sortDir])

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-zinc-700">Productos más vendidos</h2>
        <div className="relative w-64">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o SKU..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Producto</th>
              <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">SKU</th>
              <SortableHeader label="Cantidad" active={sortKey === 'quantity'} dir={sortDir} onClick={() => toggleSort('quantity')} />
              <SortableHeader label="Venta neta" active={sortKey === 'netSales'} dir={sortDir} onClick={() => toggleSort('netSales')} />
              <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Categoría</th>
              <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Variantes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.productId ?? p.productName} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50 transition-colors">
                <td className="px-4 py-3 text-zinc-900 font-medium">{p.productName}</td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-500">{p.skus.join(', ') || '—'}</td>
                <td className="px-4 py-3 text-zinc-700">{p.quantity}</td>
                <td className="px-4 py-3 font-medium text-zinc-900">{formatPrice(p.netSales)}</td>
                <td className="px-4 py-3 text-zinc-600">{p.categoryName}</td>
                <td className="px-4 py-3 text-zinc-500 text-xs">{p.variants.join(', ') || '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400 text-sm">
                  <div className="flex flex-col items-center gap-2">
                    <Package size={20} className="text-zinc-300" />
                    {products.length === 0 ? 'Sin ventas en este período' : 'Sin resultados para tu búsqueda'}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SortableHeader({ label, active, dir, onClick }: {
  label: string
  active: boolean
  dir: 'asc' | 'desc'
  onClick: () => void
}) {
  return (
    <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">
      <button
        onClick={onClick}
        className={`flex items-center gap-1 hover:text-zinc-700 transition-colors ${active ? 'text-zinc-700' : ''}`}
      >
        {label}
        {active ? (
          dir === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />
        ) : (
          <ArrowDown size={12} className="text-zinc-200" />
        )}
      </button>
    </th>
  )
}

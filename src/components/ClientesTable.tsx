'use client'

// Buscador + filtro de historial de compra para /dashboard/clientes
// (2026-09-03, pedido de ARam) -- la tabla en si no cambio de columnas,
// solo se le agrego esta barra arriba. El filtrado es 100% client-side
// (useMemo sobre la lista completa que ya viene resuelta con stats desde
// page.tsx -- ver ClienteRow) porque la cantidad de clientes por tenant es
// chica (cientos, no miles); si algun tenant crece mucho esto habria que
// pasarlo a un fetch server-side con query params, pero hoy no hace falta.

import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import DeleteCustomerButton from '@/components/DeleteCustomerButton'

export interface ClienteRow {
  id: string
  full_name: string
  last_name: string | null
  email: string | null
  phone: string | null
  type: string | null
  company_name: string | null
  created_at: string
  orderCount: number
  totalSpent: number
  pendingCount: number
  lastOrderDate: string | null
  woo_orders_count: number
  woo_total_spent: number
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function TypeBadge({ type }: { type: string }) {
  const isWholesale = type === 'wholesale' || type === 'mayorista'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
      isWholesale ? 'bg-primary-50 text-primary-700' : 'bg-zinc-100 text-zinc-600'
    }`}>
      {isWholesale ? 'Mayorista' : 'Minorista'}
    </span>
  )
}

// Mismo criterio que ya usaba la columna "Pedidos" para decidir si mostrar
// algo o un "--": cuenta tanto pedidos reales (orderCount, de la tabla
// orders) como historial legado importado de WooCommerce (woo_orders_count)
// -- un cliente migrado con pedidos viejos en Woo pero ninguno nuevo todavia
// SI cuenta como "con historial de compra".
function hasHistory(c: ClienteRow) {
  return c.orderCount > 0 || c.woo_orders_count > 0
}

type HistoryFilter = 'all' | 'with' | 'without'

const HISTORY_OPTIONS: { value: HistoryFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'with', label: 'Con historial de compra' },
  { value: 'without', label: 'Sin historial de compra' },
]

export default function ClientesTable({ customers }: { customers: ClienteRow[] }) {
  const [q, setQ] = useState('')
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all')

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return customers.filter(c => {
      if (historyFilter === 'with' && !hasHistory(c)) return false
      if (historyFilter === 'without' && hasHistory(c)) return false
      if (!query) return true
      const haystack = [
        c.full_name,
        c.last_name,
        c.email,
        c.phone,
        c.company_name,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(query)
    })
  }, [customers, q, historyFilter])

  return (
    <div className="px-8 pb-8">
      {/* Barra de busqueda y filtro */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar por nombre, email o telefono..."
            className="w-full pl-9 pr-8 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 transition-colors"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Historial de compra</span>
          <div className="flex gap-1">
            {HISTORY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setHistoryFilter(opt.value)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  historyFilter === opt.value
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'border-zinc-200 text-zinc-600 hover:border-zinc-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <span className="text-sm text-zinc-400 ml-auto">{filtered.length} de {customers.length} clientes</span>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-zinc-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Cliente</th>
              <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Tipo</th>
              <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Empresa</th>
              <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Pedidos</th>
              <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Total gastado</th>
              <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Pend. pago</th>
              <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Ultimo pedido</th>
              <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Registrado</th>
              <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} className="border-b border-zinc-50 hover:bg-zinc-50 transition-colors last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium text-zinc-800">{c.full_name}{c.last_name ? ` ${c.last_name}` : ''}</p>
                  <p className="text-xs text-zinc-400">{c.email}</p>
                  {c.phone && <p className="text-xs text-zinc-300">{c.phone}</p>}
                </td>
                <td className="px-4 py-3"><TypeBadge type={c.type ?? 'retail'} /></td>
                <td className="px-4 py-3 text-xs text-zinc-500">{c.company_name ?? '—'}</td>
                <td className="px-4 py-3">
                  {c.orderCount > 0 ? (
                    <span className="text-sm font-semibold text-zinc-900">{c.orderCount}</span>
                  ) : c.woo_orders_count > 0 ? (
                    <span className="text-sm font-semibold text-zinc-400" title="Historial WooCommerce">
                      {c.woo_orders_count}
                      <span className="ml-1 text-[10px] font-normal text-zinc-300">woo</span>
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {c.totalSpent > 0 ? (
                    <span className="text-sm font-semibold text-emerald-600">{fmt(c.totalSpent)}</span>
                  ) : c.woo_total_spent > 0 ? (
                    <span className="text-sm font-semibold text-zinc-400" title="Historial WooCommerce">
                      {fmt(c.woo_total_spent)}
                      <span className="ml-1 text-[10px] font-normal text-zinc-300">woo</span>
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {c.pendingCount > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                      {c.pendingCount} pendiente{c.pendingCount > 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-zinc-400">
                  {c.lastOrderDate ? fmtDate(c.lastOrderDate) : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-zinc-400">
                  {fmtDate(c.created_at)}
                </td>
                <td className="px-4 py-3">
                  <DeleteCustomerButton
                    customerId={c.id}
                    customerName={`${c.full_name}${c.last_name ? ` ${c.last_name}` : ''}`}
                  />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-zinc-400 text-sm">
                  {customers.length === 0
                    ? 'Todavia no hay clientes registrados en la tienda'
                    : 'Ningun cliente coincide con la busqueda o el filtro aplicado'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

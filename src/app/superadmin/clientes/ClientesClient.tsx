'use client'

import { useMemo, useState } from 'react'
import { ExternalLink, Search, LogOut } from 'lucide-react'

export type GounuriAccountRow = {
  id: string
  nombre: string
  apellido: string
  dni: string
  celular: string
  email: string
  storeName: string
  confirmado: boolean
  createdAt: string
  tiendaUrl: string | null
  tiendaStatus: string | null
}

export default function ClientesClient({ initialAccounts }: { initialAccounts: GounuriAccountRow[] }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return initialAccounts
    return initialAccounts.filter(a =>
      `${a.nombre} ${a.apellido}`.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q) ||
      a.storeName.toLowerCase().includes(q) ||
      a.dni.includes(q)
    )
  }, [initialAccounts, query])

  const confirmadosCount = initialAccounts.filter(a => a.confirmado).length
  const conTiendaCount = initialAccounts.filter(a => a.tiendaUrl).length

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Clientes Gounuri</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {initialAccounts.length} cuentas registradas en gounuri.com/registro
          </p>
        </div>
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 text-xs transition-colors"
          >
            <LogOut size={13} />
            Cerrar sesión
          </button>
        </form>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500">Total registrados</p>
          <p className="text-xl font-semibold text-zinc-100 mt-1">{initialAccounts.length}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500">Confirmaron el mail</p>
          <p className="text-xl font-semibold text-zinc-100 mt-1">
            {confirmadosCount}
            <span className="text-sm font-normal text-zinc-500"> / {initialAccounts.length}</span>
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500">Ya crearon su tienda</p>
          <p className="text-xl font-semibold text-zinc-100 mt-1">
            {conTiendaCount}
            <span className="text-sm font-normal text-zinc-500"> / {initialAccounts.length}</span>
          </p>
        </div>
      </div>

      <div className="mb-4 relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar por nombre, email, DNI o tienda..."
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 pl-9 pr-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
        />
      </div>

      <div className="rounded-xl border border-zinc-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900">
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Nombre</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Email</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">DNI</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Celular</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Tienda</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Mail confirmado</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Alta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {filtered.map(a => (
              <tr key={a.id} className="bg-zinc-950 hover:bg-zinc-900 transition-colors">
                <td className="px-5 py-4">
                  <p className="text-zinc-100 font-medium">{a.nombre} {a.apellido}</p>
                </td>
                <td className="px-5 py-4 text-zinc-300">{a.email}</td>
                <td className="px-5 py-4 text-zinc-300">{a.dni}</td>
                <td className="px-5 py-4 text-zinc-300">{a.celular}</td>
                <td className="px-5 py-4">
                  {a.tiendaUrl ? (
                    <a
                      href={a.tiendaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-zinc-100 hover:text-white underline underline-offset-2"
                    >
                      {a.storeName}
                      <ExternalLink size={11} />
                    </a>
                  ) : (
                    <span className="text-zinc-500">{a.storeName} <span className="text-xs">(sin crear)</span></span>
                  )}
                </td>
                <td className="px-5 py-4">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                    a.confirmado ? 'bg-emerald-900 text-emerald-300' : 'bg-amber-900 text-amber-300'
                  }`}>
                    {a.confirmado ? 'Confirmado' : 'Pendiente'}
                  </span>
                </td>
                <td className="px-5 py-4 text-zinc-400 text-xs">
                  {new Date(a.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-zinc-500 text-sm">
                  No hay cuentas que coincidan con la búsqueda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

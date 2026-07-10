'use client'

import { useState } from 'react'
import { ExternalLink, LogIn, Pencil, Check, X, Copy, Globe, LogOut, Trash2, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export type TenantRow = {
  id: string
  name: string
  slug: string
  domain: string | null
  template: string
  status: string
  ownerEmail: string | null
  frontendUrl: string | null
}

const TEMPLATE_LABELS: Record<string, string> = {
  default:  'Minimalista',
  mono:     'Mono',
  atelier:  'Atelier',
  axis:     'Axis',
}

const TEMPLATE_COLORS: Record<string, string> = {
  default:  'bg-zinc-700 text-zinc-200',
  mono:     'bg-stone-700 text-stone-200',
  atelier:  'bg-neutral-800 text-amber-300',
  axis:     'bg-zinc-800 text-zinc-100',
}

const STATUS_COLORS: Record<string, string> = {
  active:   'bg-emerald-900 text-emerald-300',
  pending:  'bg-amber-900 text-amber-300',
  inactive: 'bg-zinc-800 text-zinc-400',
}

const PANEL_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://panel.gounuri.com'

export default function SuperadminClient({ initialTenants }: { initialTenants: TenantRow[] }) {
  const [tenants, setTenants] = useState(initialTenants)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TenantRow | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [savingTemplateId, setSavingTemplateId] = useState<string | null>(null)

  // No necesitamos BroadcastChannel — guardamos tokens antes de navegar

  async function handleRename(tenant: TenantRow) {
    if (!editName.trim() || editName.trim() === tenant.name) {
      setEditingId(null)
      return
    }
    setSavingId(tenant.id)
    const res = await fetch('/api/superadmin/update-tenant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: tenant.id, name: editName.trim() }),
    })
    if (res.ok) {
      setTenants(prev => prev.map(t => t.id === tenant.id ? { ...t, name: editName.trim() } : t))
    }
    setSavingId(null)
    setEditingId(null)
  }

  async function handleImpersonate(tenant: TenantRow) {
    if (!tenant.ownerEmail) return
    setImpersonatingId(tenant.id)

    // Guardar tokens del superadmin ANTES de navegar (en la misma tab)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      sessionStorage.setItem('superadmin_tokens', JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }))
    }

    const res = await fetch('/api/superadmin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantOwnerEmail: tenant.ownerEmail }),
    })
    const data = await res.json()
    setImpersonatingId(null)
    if (data.url) {
      // Navegar en la MISMA tab — sin BroadcastChannel, sin race condition
      window.location.href = data.url
    } else {
      sessionStorage.removeItem('superadmin_tokens')
      alert('Error: ' + (data.error ?? 'No se pudo generar el link'))
    }
  }

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeletingId(deleteTarget.id)
    const res = await fetch('/api/superadmin/delete-tenant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: deleteTarget.id }),
    })
    if (res.ok) {
      setTenants(prev => prev.filter(t => t.id !== deleteTarget.id))
    } else {
      const data = await res.json()
      alert('Error: ' + (data.error ?? 'No se pudo borrar'))
    }
    setDeletingId(null)
    setDeleteTarget(null)
    setDeleteConfirmText('')
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Tenants</h1>
          <p className="text-sm text-zinc-400 mt-1">{tenants.length} tiendas registradas</p>
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

      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900">
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Tienda</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Template</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Estado</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Dominio / URL</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Owner</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {tenants.map(tenant => (
              <tr key={tenant.id} className="bg-zinc-950 hover:bg-zinc-900 transition-colors">

                {/* Nombre editable */}
                <td className="px-5 py-4">
                  {editingId === tenant.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRename(tenant)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        className="bg-zinc-800 border border-zinc-600 rounded-lg px-2 py-1 text-sm text-zinc-100 w-36 focus:outline-none focus:border-violet-500"
                      />
                      <button
                        onClick={() => handleRename(tenant)}
                        disabled={!!savingId}
                        className="text-emerald-400 hover:text-emerald-300"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-zinc-500 hover:text-zinc-300"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group">
                      <span className="font-medium text-zinc-100">{tenant.name}</span>
                      <button
                        onClick={() => { setEditingId(tenant.id); setEditName(tenant.name) }}
                        className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 transition-opacity"
                      >
                        <Pencil size={12} />
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-zinc-500 mt-0.5 font-mono">{tenant.slug}</p>
                </td>

                {/* Template */}
                <td className="px-5 py-4">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TEMPLATE_COLORS[tenant.template] ?? 'bg-zinc-800 text-zinc-300'}`}>
                    {TEMPLATE_LABELS[tenant.template] ?? tenant.template}
                  </span>
                </td>

                {/* Estado */}
                <td className="px-5 py-4">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[tenant.status] ?? 'bg-zinc-800 text-zinc-400'}`}>
                    {tenant.status}
                  </span>
                </td>

                {/* Dominio */}
                <td className="px-5 py-4">
                  {tenant.domain ? (
                    <div className="flex items-center gap-1.5">
                      <Globe size={12} className="text-zinc-500 flex-shrink-0" />
                      <span className="text-zinc-300 text-xs font-mono">{tenant.domain}</span>
                    </div>
                  ) : tenant.frontendUrl ? (
                    <span className="text-zinc-500 text-xs font-mono">{tenant.frontendUrl.replace('https://', '')}</span>
                  ) : (
                    <span className="text-zinc-600 text-xs">Sin configurar</span>
                  )}
                </td>

                {/* Owner */}
                <td className="px-5 py-4">
                  <span className="text-zinc-400 text-xs">{tenant.ownerEmail ?? '—'}</span>
                </td>

                {/* Acciones */}
                <td className="px-5 py-4">
                  <div className="flex items-center justify-end gap-2">
                    {/* Ver tienda */}
                    {(tenant.domain || tenant.frontendUrl) && (
                      <a
                        href={tenant.domain ? `https://${tenant.domain}` : tenant.frontendUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Ver tienda"
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}

                    {/* Copiar link Panel Admin */}
                    <button
                      onClick={() => copyToClipboard(PANEL_URL, tenant.id + '-panel')}
                      title="Copiar link Panel Admin"
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                    >
                      {copiedId === tenant.id + '-panel'
                        ? <Check size={14} className="text-emerald-400" />
                        : <Copy size={14} />
                      }
                    </button>

                    {/* Acceder como */}
                    {tenant.ownerEmail && (
                      <button
                        onClick={() => handleImpersonate(tenant)}
                        disabled={impersonatingId === tenant.id}
                        title={`Acceder como ${tenant.ownerEmail}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        <LogIn size={13} />
                        {impersonatingId === tenant.id ? 'Generando...' : 'Acceder'}
                      </button>
                    )}

                    {/* Borrar tenant */}
                    <button
                      onClick={() => { setDeleteTarget(tenant); setDeleteConfirmText('') }}
                      title="Borrar tienda"
                      className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-950 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {tenants.length === 0 && (
          <div className="text-center py-16 text-zinc-500 text-sm">
            No hay tenants registrados
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-zinc-600">
        "Acceder" navega al Panel Admin logueado como el owner del tenant.
        Usa el botón "Volver al Superadmin" del sidebar para regresar a tu sesión.
      </p>

      {/* Modal confirmación borrar */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-950 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={18} className="text-red-400" />
              </div>
              <div>
                <h2 className="text-zinc-100 font-semibold text-base">Borrar tienda</h2>
                <p className="text-zinc-400 text-sm">Esta acción es irreversible</p>
              </div>
            </div>

            <p className="text-zinc-300 text-sm mb-2">
              Se van a eliminar permanentemente todos los datos de{' '}
              <span className="font-semibold text-white">{deleteTarget.name}</span>:
              productos, pedidos, clientes, imágenes y configuración.
            </p>

            <p className="text-zinc-400 text-xs mb-4">
              Para confirmar, escribí el slug de la tienda:{' '}
              <span className="font-mono text-red-400">{deleteTarget.slug}</span>
            </p>

            <input
              type="text"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder={deleteTarget.slug}
              className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-red-500 mb-4"
            />

            <div className="flex gap-3">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteConfirmText('') }}
                className="flex-1 px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 text-sm transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteConfirmText !== deleteTarget.slug || !!deletingId}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deletingId ? 'Borrando...' : 'Borrar para siempre'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

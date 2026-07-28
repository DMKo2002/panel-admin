'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, X, Loader2 } from 'lucide-react'
import { GRANTABLE_SETTINGS_ROUTES } from '@/lib/settings-nav'

interface Props {
  accountId: string
  accountEmail: string
  currentPermissions: Record<string, boolean> | null
}

export default function EditPermissionsButton({ accountId, accountEmail, currentPermissions }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [permissions, setPermissions] = useState<Record<string, boolean>>(currentPermissions ?? {})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openModal() {
    setPermissions(currentPermissions ?? {})
    setError(null)
    setOpen(true)
  }

  function togglePerm(key: string) {
    setPermissions(prev => ({ ...prev, [key]: !prev[key] }))
  }

  async function handleSave() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/accounts/update-permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, permissions }),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error ?? 'No se pudo guardar')
        return
      }
      setOpen(false)
      router.refresh()
    } catch (err: any) {
      setError('Error de red: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={openModal}
        title="Editar permisos"
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
      >
        <Pencil size={12} />
        Editar permisos
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setOpen(false)} />

          <div className="relative w-full max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 sticky top-0 bg-white">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">Permisos de {accountEmail}</h2>
                <p className="text-xs text-zinc-400 mt-0.5">Acceso a páginas de Configuración</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-zinc-400 hover:text-zinc-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-1 border border-zinc-100 rounded-lg p-2">
                {GRANTABLE_SETTINGS_ROUTES.map(route => (
                  <label key={route.key} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-zinc-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(permissions[route.key])}
                      onChange={() => togglePerm(route.key)}
                      className="rounded border-zinc-300 text-primary-600 focus:ring-primary-400"
                    />
                    <span className="text-sm text-zinc-700">{route.label}</span>
                  </label>
                ))}
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)} className="btn-secondary flex-1 justify-center">
                  Cancelar
                </button>
                <button type="button" onClick={handleSave} disabled={loading} className="btn-primary flex-1 justify-center disabled:opacity-60">
                  {loading ? <Loader2 size={14} className="animate-spin" /> : 'Guardar permisos'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

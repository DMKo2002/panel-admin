'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Trash2, Loader2 } from 'lucide-react'

// Cartel que avisa que los productos/imágenes cargados al crear la tienda son
// de ejemplo (vienen del template), con botón para borrarlos todos de una.
export default function DemoNoticeClient({ count }: { count: number }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function borrar() {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/demo/borrar', { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error ?? 'No se pudo borrar')
      setConfirming(false)
      router.refresh()
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo borrar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-4 sm:mx-8 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 flex-1">
          <Sparkles size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-900">
            <p className="font-medium">Tu tienda viene con contenido de ejemplo</p>
            <p className="text-amber-800/90 mt-0.5">
              Los {count} productos y sus imágenes son solo demo: pueden borrarlos y reemplazarlos por
              los suyos cuando quieran. También podés cambiar el logo y las imágenes de portada desde Apariencia.
            </p>
          </div>
        </div>
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white border border-amber-300 text-amber-900 text-sm font-medium hover:bg-amber-100 transition-colors flex-shrink-0"
          >
            <Trash2 size={14} /> Borrar todo lo demo
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={borrar}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Sí, borrar los {count}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={loading}
              className="px-3 py-2 rounded-lg text-sm text-amber-900 hover:bg-amber-100 transition-colors"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  )
}

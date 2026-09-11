'use client'

// Tarjeta de "Invitar y ganar" (2026-09, programa de referidos) — pedido de
// David: que aparezca GRANDE en el dashboard y también en Mi Cuenta, tanto
// acá como en gounuri.com/perfil. Client component porque necesita generar/
// mostrar el código (GET /api/referidos/mi-codigo, crea el código la primera
// vez si el tenant no tenía uno todavía) y el botón "Usar mes gratis" hace
// una acción (POST /api/referidos/usar-mes-gratis).
//
// Mismo componente para el dashboard y para Mi Cuenta — el prop `compact`
// solo ajusta el padding/tamaño de texto, no la lógica.

import { useEffect, useState } from 'react'
import { Gift, Copy, Check, MessageCircle, Loader2 } from 'lucide-react'

interface MiCodigoResponse {
  code: string
  link: string
  mesesGratisDisponibles: number
  waShareUrl: string
}

export default function ReferidosCard({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<MiCodigoResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<'link' | 'code' | null>(null)
  const [usando, setUsando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    fetch('/api/referidos/mi-codigo')
      .then(res => res.json())
      .then(json => { if (!cancelado && !json.error) setData(json) })
      .catch(() => {})
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [])

  async function copiar(texto: string, cual: 'link' | 'code') {
    try {
      await navigator.clipboard.writeText(texto)
      setCopied(cual)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // clipboard puede fallar en http/contextos raros — no rompe nada más
    }
  }

  async function usarMesGratis() {
    setUsando(true)
    setMensaje(null)
    setError(null)
    try {
      const res = await fetch('/api/referidos/usar-mes-gratis', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'No se pudo canjear el mes gratis.')
      } else {
        setMensaje('¡Listo! Sumamos un mes más a tu suscripción.')
        setData(prev => prev ? { ...prev, mesesGratisDisponibles: Math.max(0, prev.mesesGratisDisponibles - 1) } : prev)
      }
    } catch {
      setError('No se pudo canjear el mes gratis. Probá de nuevo.')
    } finally {
      setUsando(false)
    }
  }

  if (loading) {
    return (
      <div className={`bg-white rounded-xl border border-zinc-200 ${compact ? 'p-4' : 'p-5'} flex items-center gap-2 text-zinc-400 text-sm`}>
        <Loader2 size={16} className="animate-spin" /> Cargando tu link de invitación…
      </div>
    )
  }

  if (!data) return null // fallo silencioso — no bloquea el resto del dashboard

  const tieneSaldo = data.mesesGratisDisponibles > 0

  return (
    <div className={`rounded-xl border ${tieneSaldo ? 'border-primary-200 bg-primary-50' : 'border-zinc-200 bg-white'} ${compact ? 'p-4' : 'p-5'}`}>
      <div className="flex items-start gap-3">
        <div className={`inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ${tieneSaldo ? 'bg-primary-100' : 'bg-primary-50'}`}>
          <Gift size={18} className="text-primary-600" />
        </div>
        <div className="flex-1 min-w-0">
          {tieneSaldo ? (
            <>
              <p className="text-sm font-semibold text-zinc-900">
                Tenés {data.mesesGratisDisponibles} {data.mesesGratisDisponibles === 1 ? 'mes gratis' : 'meses gratis'} disponibles
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">Por invitar a alguien a Gounuri. Usalo cuando quieras.</p>
              <button
                onClick={usarMesGratis}
                disabled={usando}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium px-3.5 py-2 hover:bg-primary-700 transition-colors disabled:opacity-60"
              >
                {usando ? <Loader2 size={14} className="animate-spin" /> : null}
                Usar un mes ahora
              </button>
              {mensaje && <p className="text-xs text-emerald-600 mt-2">{mensaje}</p>}
              {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-zinc-900">Invitá y ganá 2 meses gratis</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Compartí tu link — cuando quien se registre confirme su primer pago, sumás 2 meses gratis.
              </p>
            </>
          )}

          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <div className="flex-1 flex items-center gap-1.5 bg-white border border-zinc-200 rounded-lg px-3 py-2 min-w-0">
              <span className="text-xs text-zinc-600 truncate">{data.link}</span>
              <button
                onClick={() => copiar(data.link, 'link')}
                className="shrink-0 text-zinc-400 hover:text-zinc-700 transition-colors"
                title="Copiar link"
              >
                {copied === 'link' ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              </button>
            </div>
            <button
              onClick={() => copiar(data.code, 'code')}
              className="shrink-0 flex items-center gap-1.5 bg-white border border-zinc-200 rounded-lg px-3 py-2 text-xs font-mono text-zinc-700 hover:border-zinc-300 transition-colors"
              title="Copiar código"
            >
              {data.code} {copied === 'code' ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
            </button>
            <a
              href={data.waShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#25D366] text-white text-xs font-medium px-3 py-2 hover:opacity-90 transition-opacity"
            >
              <MessageCircle size={14} /> Compartir por WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

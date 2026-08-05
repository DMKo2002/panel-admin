'use client'

import { useState } from 'react'
import { Send, Store, Check, ChevronDown } from 'lucide-react'

interface Props {
  orderId: string
  currentStatus: string
}

export default function UpdateOrderStatusButton({ orderId, currentStatus }: Props) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [open, setOpen] = useState(false)
  const [trackingCode, setTrackingCode] = useState('')
  const [pendingStatus, setPendingStatus] = useState<'shipped' | 'ready_pickup' | null>(null)

  const isDone = done || currentStatus === 'shipped' || currentStatus === 'ready_pickup'

  async function handleConfirm() {
    if (!pendingStatus) return
    setLoading(true)
    setOpen(false)
    await fetch('/api/orders/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, status: pendingStatus, trackingCode: trackingCode || null }),
    })
    setLoading(false)
    setDone(true)
    setPendingStatus(null)
  }

  if (isDone) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
        <Check size={11} /> {currentStatus === 'ready_pickup' || done ? 'Notificado' : 'Enviado'}
      </span>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        disabled={loading}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-zinc-200 text-[11px] text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 transition-colors disabled:opacity-40"
      >
        <Send size={11} />
        {loading ? 'Enviando...' : 'Notificar'}
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-64 bg-white border border-zinc-200 rounded-xl shadow-lg p-3">
          <p className="text-xs font-medium text-zinc-700 mb-2">¿Qué le avisamos al cliente?</p>

          <div className="space-y-1.5 mb-3">
            <button
              onClick={() => setPendingStatus('shipped')}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors text-left ${pendingStatus === 'shipped' ? 'bg-primary-50 border border-primary-200 text-primary-700' : 'border border-zinc-100 hover:bg-zinc-50 text-zinc-600'}`}
            >
              <Send size={12} />
              Pedido enviado (con despacho)
            </button>
            <button
              onClick={() => setPendingStatus('ready_pickup')}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors text-left ${pendingStatus === 'ready_pickup' ? 'bg-primary-50 border border-primary-200 text-primary-700' : 'border border-zinc-100 hover:bg-zinc-50 text-zinc-600'}`}
            >
              <Store size={12} />
              Listo para retirar en local
            </button>
          </div>

          {pendingStatus === 'shipped' && (
            <input
              type="text"
              placeholder="Código de seguimiento (opcional)"
              value={trackingCode}
              onChange={e => setTrackingCode(e.target.value)}
              className="w-full text-xs border border-zinc-200 rounded-lg px-2.5 py-1.5 mb-2 focus:outline-none focus:border-primary-400"
            />
          )}

          <div className="flex gap-1.5">
            <button
              onClick={() => { setOpen(false); setPendingStatus(null) }}
              className="flex-1 text-xs py-1.5 rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={!pendingStatus}
              className="flex-1 text-xs py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Confirmar y enviar mail
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

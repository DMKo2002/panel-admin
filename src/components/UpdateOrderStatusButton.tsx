'use client'

import { useState } from 'react'
import { Send, Store, Check, ChevronDown, RefreshCw } from 'lucide-react'

interface Props {
  orderId: string
  currentStatus: string
  // true si el pedido tiene una edición (order_items) más reciente que el
  // último aviso de cambio mandado — habilita la 3ra opción del dropdown.
  pendingEditNotification: boolean
}

type Action = 'shipped' | 'ready_pickup' | 'notify_edit'

export default function UpdateOrderStatusButton({ orderId, currentStatus, pendingEditNotification }: Props) {
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [trackingCode, setTrackingCode] = useState('')
  const [pendingAction, setPendingAction] = useState<Action | null>(null)
  const [sentShipped, setSentShipped] = useState(false)
  const [sentReady, setSentReady] = useState(false)
  const [editNotified, setEditNotified] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const shippedDone = sentShipped || currentStatus === 'shipped'
  const readyDone = sentReady || currentStatus === 'ready_pickup'
  const editNotifyAvailable = pendingEditNotification && !editNotified

  // Si ya se avisó envío/retiro Y no hay ningún cambio pendiente de avisar,
  // no hace falta el dropdown — se mantiene el chip compacto de siempre. En
  // cuanto hay una edición pendiente, se vuelve a mostrar el botón completo
  // aunque el pedido ya esté marcado como enviado/listo, para poder llegar
  // a la 3ra opción.
  const collapsedToChip = (shippedDone || readyDone) && !editNotifyAvailable

  async function handleConfirm() {
    if (!pendingAction) return
    setLoading(true)
    setOpen(false)
    setError(null)
    try {
      if (pendingAction === 'notify_edit') {
        const res = await fetch('/api/orders/notify-edit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          setError(d.error ?? 'No se pudo avisar el cambio')
          return
        }
        setEditNotified(true)
      } else {
        await fetch('/api/orders/update-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, status: pendingAction, trackingCode: trackingCode || null }),
        })
        if (pendingAction === 'shipped') setSentShipped(true)
        else setSentReady(true)
      }
    } finally {
      setLoading(false)
      setPendingAction(null)
    }
  }

  if (collapsedToChip) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
        <Check size={11} /> {readyDone ? 'Notificado' : 'Enviado'}
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
        <div className="absolute right-0 top-full mt-1 z-20 w-72 bg-white border border-zinc-200 rounded-xl shadow-lg p-3">
          <p className="text-xs font-medium text-zinc-700 mb-2">¿Qué le avisamos al cliente?</p>

          <div className="space-y-1.5 mb-3">
            <button
              onClick={() => setPendingAction('shipped')}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors text-left ${pendingAction === 'shipped' ? 'bg-primary-50 border border-primary-200 text-primary-700' : 'border border-zinc-100 hover:bg-zinc-50 text-zinc-600'}`}
            >
              <Send size={12} />
              Pedido enviado (con despacho)
              {shippedDone && <Check size={11} className="ml-auto text-emerald-600" />}
            </button>
            <button
              onClick={() => setPendingAction('ready_pickup')}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors text-left ${pendingAction === 'ready_pickup' ? 'bg-primary-50 border border-primary-200 text-primary-700' : 'border border-zinc-100 hover:bg-zinc-50 text-zinc-600'}`}
            >
              <Store size={12} />
              Listo para retirar en local
              {readyDone && <Check size={11} className="ml-auto text-emerald-600" />}
            </button>
            <button
              onClick={() => editNotifyAvailable && setPendingAction('notify_edit')}
              disabled={!editNotifyAvailable}
              title={!pendingEditNotification ? 'Se habilita cuando se modifica el pedido' : editNotified ? 'Ya se avisó este cambio' : ''}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors text-left ${
                !editNotifyAvailable
                  ? 'border border-zinc-100 text-zinc-300 cursor-not-allowed'
                  : pendingAction === 'notify_edit'
                    ? 'bg-primary-50 border border-primary-200 text-primary-700'
                    : 'border border-zinc-100 hover:bg-zinc-50 text-zinc-600'
              }`}
            >
              <RefreshCw size={12} />
              Notificar cambio de pedido
              {editNotified && <Check size={11} className="ml-auto text-emerald-600" />}
            </button>
          </div>

          {pendingAction === 'shipped' && (
            <input
              type="text"
              placeholder="Código de seguimiento (opcional)"
              value={trackingCode}
              onChange={e => setTrackingCode(e.target.value)}
              className="w-full text-xs border border-zinc-200 rounded-lg px-2.5 py-1.5 mb-2 focus:outline-none focus:border-primary-400"
            />
          )}

          {error && (
            <p className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5 mb-2">{error}</p>
          )}

          <div className="flex gap-1.5">
            <button
              onClick={() => { setOpen(false); setPendingAction(null); setError(null) }}
              className="flex-1 text-xs py-1.5 rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={!pendingAction}
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

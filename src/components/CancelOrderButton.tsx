'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { XCircle, Loader2 } from 'lucide-react'

interface Props {
  orderId: string
  currentStatus: string
}

export default function CancelOrderButton({ orderId, currentStatus }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  if (currentStatus === 'cancelled' || currentStatus === 'delivered') return null

  async function handleClick() {
    if (!confirm('¿Cancelar este pedido? Se le va a mandar un mail al cliente avisando la cancelación (y, si ya había pagado, que coordine la devolución por WhatsApp o mail).')) return
    setLoading(true)
    try {
      const res = await fetch('/api/orders/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, status: 'cancelled' }),
      })
      if (!res.ok) {
        const d = await res.json()
        alert('Error: ' + (d.error ?? 'No se pudo cancelar'))
        return
      }
      router.refresh()
    } catch (err: any) {
      alert('Error de red: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-red-200 text-[11px] text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors disabled:opacity-40"
    >
      {loading ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
      {loading ? 'Cancelando...' : 'Cancelar'}
    </button>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCheck, Loader2 } from 'lucide-react'

interface Props {
  orderId: string
  currentStatus: string
}

export default function MarkCompletedButton({ orderId, currentStatus }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  if (currentStatus === 'cancelled') return null

  if (done || currentStatus === 'delivered') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
        <CheckCheck size={12} /> Completado
      </span>
    )
  }

  async function handleClick() {
    if (!confirm('¿Marcar este pedido como completado?')) return
    setLoading(true)
    try {
      const res = await fetch('/api/orders/mark-completed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      })
      if (!res.ok) {
        const d = await res.json()
        alert('Error: ' + (d.error ?? 'No se pudo actualizar'))
        return
      }
      setDone(true)
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
      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-[11px] text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300 transition-colors disabled:opacity-60 font-medium"
    >
      {loading ? <Loader2 size={11} className="animate-spin" /> : <CheckCheck size={11} />}
      {loading ? 'Guardando...' : 'Completar'}
    </button>
  )
}

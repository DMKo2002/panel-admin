'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, Loader2 } from 'lucide-react'

interface Props {
  orderId: string
  paymentStatus: string
  paymentMethod: string
}

export default function MarkPaidButton({ orderId, paymentStatus, paymentMethod }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  // Only show for pending bank transfer orders
  if (paymentStatus === 'paid' || paymentMethod === 'mercadopago') return null

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
        <CheckCircle size={13} /> Pagado
      </span>
    )
  }

  async function handleClick() {
    if (!confirm('¿Marcar este pedido como pagado? El estado cambiará a "Confirmado".')) return
    setLoading(true)
    try {
      const res = await fetch('/api/mark-paid', {
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
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-xs text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300 transition-colors disabled:opacity-60 font-medium"
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
      {loading ? 'Guardando...' : 'Marcar pagado'}
    </button>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'

interface Props {
  orderId: string
}

export default function DeleteOrderButton({ orderId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    if (!confirm('¿Eliminar este pedido definitivamente? Esta acción no se puede deshacer y se va a borrar todo su historial (items, recibos, notificaciones).')) return
    setLoading(true)
    try {
      const res = await fetch('/api/orders/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      })
      if (!res.ok) {
        const d = await res.json()
        alert('Error: ' + (d.error ?? 'No se pudo eliminar'))
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
      title="Eliminar pedido"
      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-red-200 text-[11px] text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors disabled:opacity-40"
    >
      {loading ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
      {loading ? 'Eliminando...' : 'Eliminar'}
    </button>
  )
}

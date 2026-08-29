'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'

interface Props {
  requestId: string
  trackingCode: string
}

export default function DeleteWithdrawalButton({ requestId, trackingCode }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    if (!confirm(`¿Eliminar la solicitud ${trackingCode} definitivamente? Esta acción no se puede deshacer.`)) return
    setLoading(true)
    try {
      const res = await fetch('/api/arrepentimiento/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
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
      title="Eliminar solicitud"
      className="inline-flex items-center justify-center p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors disabled:opacity-40"
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
    </button>
  )
}

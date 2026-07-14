'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'

interface Props {
  customerId: string
  customerName: string
}

export default function DeleteCustomerButton({ customerId, customerName }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    if (!confirm(`¿Eliminar a ${customerName} definitivamente? Esta acción no se puede deshacer.`)) return
    setLoading(true)
    try {
      const res = await fetch('/api/customers/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId }),
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
      title="Eliminar cliente"
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-200 text-xs text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors disabled:opacity-40"
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
      {loading ? 'Eliminando...' : 'Eliminar'}
    </button>
  )
}

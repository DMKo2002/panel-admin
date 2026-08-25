'use client'

import { useState } from 'react'
import { Pencil, X, Plus, Trash2, Loader2, Download } from 'lucide-react'

interface EditableItem {
  product_name: string
  variant_desc: string
  quantity: number
  unit_price: number
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

interface Props {
  orderId: string
}

// Editor de recibo "en el momento": precarga cantidad/color/precio reales
// del pedido para no tipear de cero, pero al generar el PDF no guarda nada
// en la base — es solo para corregir el papel cuando el stock publicado no
// coincidía con el real (requerimiento de Caloria). Cada vez que se abre
// vuelve a mostrar los datos originales del pedido.
export default function EditOrderModal({ orderId }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<EditableItem[]>([])

  async function handleOpen() {
    setOpen(true)
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/orders/preview?order_id=${orderId}`)
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'No se pudo cargar el pedido')
        return
      }
      const data = await res.json()
      setItems(
        (data.order_items ?? []).map((it: any) => ({
          product_name: it.product_name,
          variant_desc: it.variant_desc ?? '',
          quantity: it.quantity,
          unit_price: it.unit_price,
        }))
      )
    } catch (err: any) {
      setError('Error de red: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  function updateItem(idx: number, patch: Partial<EditableItem>) {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  function addItem() {
    setItems(prev => [...prev, { product_name: '', variant_desc: '', quantity: 1, unit_price: 0 }])
  }

  const subtotal = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0)

  async function handleGenerate() {
    setError(null)
    if (items.length === 0) {
      setError('El pedido necesita al menos un producto')
      return
    }
    for (const it of items) {
      if (!it.product_name.trim()) {
        setError('Todos los productos necesitan un nombre')
        return
      }
      if (!Number.isInteger(Number(it.quantity)) || Number(it.quantity) <= 0) {
        setError(`Cantidad inválida en "${it.product_name || 'producto'}"`)
        return
      }
      if (Number(it.unit_price) < 0 || Number.isNaN(Number(it.unit_price))) {
        setError(`Precio inválido en "${it.product_name || 'producto'}"`)
        return
      }
    }
    setGenerating(true)
    try {
      const res = await fetch('/api/pdf/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          items: items.map(it => ({
            product_name: it.product_name.trim(),
            variant_desc: it.variant_desc.trim() || null,
            quantity: Number(it.quantity),
            unit_price: Number(it.unit_price),
          })),
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'No se pudo generar el PDF')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `recibo-${orderId.slice(0, 6)}-editado.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setOpen(false)
    } catch (err: any) {
      setError('Error de red: ' + err.message)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        title="Corregir cantidad, color o precio y generar el PDF con esos valores"
        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-zinc-200 text-[11px] text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 transition-colors whitespace-nowrap"
      >
        <Pencil size={11} />
        Editar
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => !generating && setOpen(false)} />

          <div className="relative w-full max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
              <p className="font-semibold text-zinc-900 text-sm">Editar recibo — #{orderId.slice(0, 6)}</p>
              <button onClick={() => !generating && setOpen(false)} className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors text-zinc-400">
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4">
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {!loading && (
                <>
                  <p className="text-xs text-zinc-400 mb-3">
                    Corregí cantidad, color o precio si no coinciden con el stock real. Esto no modifica el pedido guardado — solo genera un PDF nuevo con estos valores.
                  </p>

                  <div className="space-y-2">
                    {items.map((it, idx) => (
                      <div key={idx} className="flex items-start gap-2 bg-zinc-50 rounded-xl p-2.5">
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <input
                            value={it.product_name}
                            onChange={e => updateItem(idx, { product_name: e.target.value })}
                            placeholder="Producto"
                            className="col-span-2 text-xs px-2 py-1.5 rounded-lg border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-primary-400"
                          />
                          <input
                            value={it.variant_desc}
                            onChange={e => updateItem(idx, { variant_desc: e.target.value })}
                            placeholder="Color / variante"
                            className="text-xs px-2 py-1.5 rounded-lg border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-primary-400"
                          />
                          <div className="flex gap-2">
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={it.quantity}
                              onChange={e => updateItem(idx, { quantity: Number(e.target.value) })}
                              placeholder="Cant."
                              className="w-16 text-xs px-2 py-1.5 rounded-lg border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-primary-400"
                            />
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={it.unit_price}
                              onChange={e => updateItem(idx, { unit_price: Number(e.target.value) })}
                              placeholder="Precio unit."
                              className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-primary-400"
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => removeItem(idx)}
                          title="Quitar producto"
                          className="p-1.5 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-600 transition-colors mt-0.5"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={addItem}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700"
                  >
                    <Plus size={13} />
                    Agregar producto
                  </button>

                  {error && (
                    <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                      {error}
                    </div>
                  )}
                </>
              )}
            </div>

            {!loading && (
              <div className="px-5 py-4 border-t border-zinc-100 flex items-center justify-between">
                <div className="text-xs text-zinc-500">
                  Subtotal: <span className="font-semibold text-zinc-900">{fmt(subtotal)}</span>
                  <span className="text-zinc-400"> (el envío se mantiene igual)</span>
                </div>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-medium hover:bg-primary-700 transition-colors disabled:opacity-60"
                >
                  {generating ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  {generating ? 'Generando...' : 'Descargar PDF'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

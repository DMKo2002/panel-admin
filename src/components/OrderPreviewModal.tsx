'use client'

import { useState } from 'react'
import { X, FileText, Download, Package, Truck, User, CreditCard, MapPin } from 'lucide-react'

interface OrderItem {
  id: string
  product_name: string
  variant_label: string | null
  quantity: number
  unit_price: number
}

interface OrderPreview {
  id: string
  total: number
  subtotal: number
  shipping_total: number
  payment_method: string
  payment_status: string
  status: string
  created_at: string
  notes: string | null
  shipping_method_label: string | null
  shipping_address_street: string | null
  shipping_address_city: string | null
  shipping_address_province: string | null
  shipping_address_zip: string | null
  customers: {
    full_name: string
    last_name: string | null
    email: string
    phone: string | null
    address_street: string | null
    address_city: string | null
    address_province: string | null
  } | null
  order_items: OrderItem[]
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

function PaymentBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    paid:    { label: 'Pagado',       cls: 'bg-emerald-50 text-emerald-700' },
    pending: { label: 'Pend. pago',   cls: 'bg-amber-50 text-amber-700' },
    refunded:{ label: 'Reembolsado',  cls: 'bg-zinc-100 text-zinc-600' },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-zinc-100 text-zinc-600' }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:      { label: 'Procesando', cls: 'bg-zinc-100 text-zinc-600' },
    confirmed:    { label: 'Confirmado', cls: 'bg-blue-50 text-blue-700' },
    shipped:      { label: 'Enviado',    cls: 'bg-violet-50 text-violet-700' },
    ready_pickup: { label: 'Para retirar', cls: 'bg-orange-50 text-orange-700' },
    delivered:    { label: 'Entregado',  cls: 'bg-emerald-50 text-emerald-700' },
    cancelled:    { label: 'Cancelado',  cls: 'bg-red-50 text-red-700' },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-zinc-100 text-zinc-600' }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>
}

interface Props {
  orderId: string
  mode: 'recibo' | 'envio'
  label: string
}

export default function OrderPreviewModal({ orderId, mode, label }: Props) {
  const [open, setOpen] = useState(false)
  const [order, setOrder] = useState<OrderPreview | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleOpen() {
    setOpen(true)
    if (order) return
    setLoading(true)
    const res = await fetch(`/api/orders/preview?order_id=${orderId}`)
    if (res.ok) setOrder(await res.json())
    setLoading(false)
  }

  const pdfUrl = mode === 'recibo'
    ? `/api/pdf?order_id=${orderId}`
    : `/api/pdf/envio?order_id=${orderId}`

  const shortId = orderId.slice(0, 6)

  return (
    <>
      <button
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
      >
        <FileText size={13} />
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div className="relative w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
              <div>
                <p className="font-semibold text-zinc-900 text-sm">
                  {mode === 'recibo' ? 'Recibo' : 'Datos de envío'} — #{shortId}
                </p>
                {order && (
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {new Date(order.created_at).toLocaleDateString('es-AR', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                      timeZone: 'America/Argentina/Buenos_Aires',
                    })}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs text-zinc-600 hover:bg-zinc-50 transition-colors"
                >
                  <Download size={12} />
                  PDF
                </a>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors text-zinc-400"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {!loading && order && (
                <>
                  {/* Cliente */}
                  <section>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                      <User size={11} />
                      Cliente
                    </div>
                    <div className="bg-zinc-50 rounded-xl p-3 space-y-1">
                      <p className="text-sm font-medium text-zinc-900">{order.customers?.full_name} {order.customers?.last_name ?? ''}</p>
                      <p className="text-xs text-zinc-500">{order.customers?.email}</p>
                      {order.customers?.phone && <p className="text-xs text-zinc-500">{order.customers.phone}</p>}
                    </div>
                  </section>

                  {/* Estado */}
                  <section>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                      <CreditCard size={11} />
                      Pago y estado
                    </div>
                    <div className="bg-zinc-50 rounded-xl p-3 flex items-center gap-3">
                      <PaymentBadge status={order.payment_status} />
                      <StatusBadge status={order.status} />
                      <span className="text-xs text-zinc-500 ml-auto">
                        {order.payment_method === 'mercadopago' ? 'MercadoPago' : order.payment_method === 'cash' ? 'Efectivo' : 'Transferencia'}
                      </span>
                    </div>
                  </section>

                  {/* Productos */}
                  <section>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                      <Package size={11} />
                      Productos
                    </div>
                    <div className="bg-zinc-50 rounded-xl divide-y divide-zinc-100">
                      {order.order_items.map(item => (
                        <div key={item.id} className="flex items-center justify-between px-3 py-2.5">
                          <div>
                            <p className="text-xs font-medium text-zinc-800">{item.product_name}</p>
                            {item.variant_label && (
                              <p className="text-xs text-zinc-400">{item.variant_label}</p>
                            )}
                          </div>
                          <div className="text-right ml-4 shrink-0">
                            <p className="text-xs text-zinc-500">×{item.quantity}</p>
                            <p className="text-xs font-medium text-zinc-800">{fmt(item.unit_price * item.quantity)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Envío */}
                  {(order.shipping_method_label || order.shipping_address_street) && (
                    <section>
                      <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                        <Truck size={11} />
                        Envío
                      </div>
                      <div className="bg-zinc-50 rounded-xl p-3 space-y-1">
                        {order.shipping_method_label && (
                          <p className="text-xs text-zinc-700 font-medium">{order.shipping_method_label}</p>
                        )}
                        {order.shipping_address_street && (
                          <p className="text-xs text-zinc-500">
                            {order.shipping_address_street}
                            {order.shipping_address_city ? `, ${order.shipping_address_city}` : ''}
                            {order.shipping_address_province ? `, ${order.shipping_address_province}` : ''}
                            {order.shipping_address_zip ? ` (${order.shipping_address_zip})` : ''}
                          </p>
                        )}
                      </div>
                    </section>
                  )}

                  {/* Notas */}
                  {order.notes && (
                    <section>
                      <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                        Notas
                      </div>
                      <p className="text-xs text-zinc-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 italic">
                        {order.notes}
                      </p>
                    </section>
                  )}

                  {/* Dirección del cliente (tab envío) */}
                  {mode === 'envio' && order.customers?.address_street && (
                    <section>
                      <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                        <MapPin size={11} />
                        Dirección registrada
                      </div>
                      <div className="bg-zinc-50 rounded-xl p-3">
                        <p className="text-xs text-zinc-600">{order.customers.address_street}</p>
                        {order.customers.address_city && (
                          <p className="text-xs text-zinc-500">{order.customers.address_city}{order.customers.address_province ? `, ${order.customers.address_province}` : ''}</p>
                        )}
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>

            {/* Footer totales */}
            {!loading && order && (
              <div className="px-5 py-4 border-t border-zinc-100 space-y-1.5">
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>Subtotal</span>
                  <span>{fmt(order.subtotal ?? order.total)}</span>
                </div>
                {(order.shipping_total ?? 0) > 0 && (
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>Envío</span>
                    <span>{fmt(order.shipping_total)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-semibold text-zinc-900 pt-1 border-t border-zinc-100">
                  <span>Total</span>
                  <span>{fmt(order.total)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

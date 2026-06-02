'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, ShoppingCart, CheckCircle, XCircle, Clock } from 'lucide-react'
import Link from 'next/link'

export default function TestMPPage() {
  const supabase = createClient()
  const [products, setProducts] = useState<any[]>([])
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)
  const [selectedVariant, setSelectedVariant] = useState<any>(null)
  const [qty, setQty] = useState(1)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      if (!userRow) return
      setTenantId(userRow.tenant_id)

      const { data: prods } = await supabase
        .from('products')
        .select('*, variants(*, price_rules(*))')
        .eq('tenant_id', userRow.tenant_id)
        .eq('active', true)
        .limit(10)

      setProducts(prods ?? [])
    }
    load()
  }, [])

  async function handleTestCheckout() {
    if (!selectedVariant || !tenantId) {
      setError('Seleccioná un producto primero')
      return
    }

    const retailPrice = selectedVariant.price_rules?.find((p: any) => p.type === 'retail' && p.active)?.price
    if (!retailPrice) {
      setError('Este producto no tiene precio minorista configurado')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      // 1. Crear el pedido en Supabase
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          tenant_id: tenantId,
          status: 'pending',
          payment_method: 'mercadopago',
          payment_status: 'pending',
          subtotal: retailPrice * qty,
          shipping_cost: 0,
          total: retailPrice * qty,
        })
        .select()
        .single()

      if (orderError) throw orderError

      // 2. Crear item del pedido
      await supabase.from('order_items').insert({
        order_id: order.id,
        variant_id: selectedVariant.id,
        product_name: selectedVariant._product_name,
        variant_desc: [selectedVariant.size, selectedVariant.color].filter(Boolean).join(' / '),
        quantity: qty,
        unit_price: retailPrice,
        price_type: 'retail',
      })

      // 3. Crear preferencia en MercadoPago
      const response = await fetch('/api/mp/crear-preferencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          order_id: order.id,
          items: [{
            variant_id: selectedVariant.id,
            name: selectedVariant._product_name,
            variant_desc: [selectedVariant.size, selectedVariant.color].filter(Boolean).join(' / '),
            quantity: qty,
            unit_price: retailPrice,
          }],
          payer: {
            name: 'Test Comprador',
            email: 'test_user_comprador@testuser.com',
          },
        }),
      })

      const data = await response.json()

      if (!response.ok) throw new Error(data.error ?? 'Error al crear preferencia')

      setResult({
        order_id: order.id,
        preference_id: data.preference_id,
        sandbox_url: data.sandbox_init_point,
        prod_url: data.init_point,
      })

    } catch (err: any) {
      setError(err.message ?? 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  // Aplanar variantes con nombre del producto
  const allVariants = products.flatMap(p =>
    (p.variants ?? []).map((v: any) => ({ ...v, _product_name: p.name }))
  )

  const formatPrice = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

  const selectedPrice = selectedVariant?.price_rules?.find((p: any) => p.type === 'retail' && p.active)?.price

  return (
    <div>
      <div className="px-8 py-6 border-b border-zinc-200 bg-white flex items-center gap-4">
        <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-600 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Test MercadoPago</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Simulá una compra de prueba para verificar la integración</p>
        </div>
      </div>

      <div className="px-8 py-6 max-w-xl space-y-5">

        {/* Advertencia */}
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-700">
          <strong>Modo prueba.</strong> Esta página solo existe para testear la integración con MP. No la uses en producción.
        </div>

        {/* Seleccionar producto */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-700">1. Seleccioná un producto</h2>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">Variante</label>
            <select
              className="input"
              value={selectedVariant?.id ?? ''}
              onChange={e => {
                const v = allVariants.find(v => v.id === e.target.value)
                setSelectedVariant(v ?? null)
              }}
            >
              <option value="">-- Elegir variante --</option>
              {allVariants.map(v => {
                const price = v.price_rules?.find((p: any) => p.type === 'retail' && p.active)?.price
                return (
                  <option key={v.id} value={v.id}>
                    {v._product_name} {v.size ? `- Talle ${v.size}` : ''} {v.color ? `- ${v.color}` : ''} {price ? `- ${formatPrice(price)}` : '(sin precio)'}
                  </option>
                )
              })}
            </select>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">Cantidad</label>
            <input
              type="number"
              min="1"
              max="10"
              className="input w-24"
              value={qty}
              onChange={e => setQty(parseInt(e.target.value) || 1)}
            />
          </div>

          {selectedVariant && selectedPrice && (
            <div className="bg-zinc-50 rounded-lg px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-zinc-600">Total a cobrar</span>
              <span className="text-lg font-semibold text-zinc-900">{formatPrice(selectedPrice * qty)}</span>
            </div>
          )}
        </div>

        {/* Botón */}
        <button
          onClick={handleTestCheckout}
          disabled={loading || !selectedVariant}
          className="w-full btn-primary justify-center py-3 disabled:opacity-60 text-base"
        >
          <ShoppingCart size={18} />
          {loading ? 'Creando preferencia...' : 'Iniciar pago de prueba'}
        </button>

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
            <XCircle size={16} className="mt-0.5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Resultado */}
        {result && (
          <div className="bg-white rounded-xl border border-emerald-200 p-5 space-y-4">
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle size={18} />
              <span className="text-sm font-semibold">Preferencia creada correctamente</span>
            </div>

            <div className="space-y-2 text-xs font-mono bg-zinc-50 rounded-lg p-3">
              <p><span className="text-zinc-400">Order ID:</span> {result.order_id}</p>
              <p><span className="text-zinc-400">Preference ID:</span> {result.preference_id}</p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-600">Elegí cómo probar el pago:</p>

              <a
                href={result.sandbox_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between w-full px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-blue-700">Abrir Sandbox (recomendado para pruebas)</p>
                  <p className="text-xs text-blue-500 mt-0.5">Usá las cuentas de prueba de MP</p>
                </div>
                <span className="text-blue-400">→</span>
              </a>

              <a
                href={result.prod_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-lg hover:bg-zinc-100 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-700">Abrir Checkout Pro (producción)</p>
                  <p className="text-xs text-zinc-400 mt-0.5">Solo con credenciales reales</p>
                </div>
                <span className="text-zinc-400">→</span>
              </a>
            </div>

            <div className="flex items-start gap-2 text-xs text-zinc-500 bg-zinc-50 rounded-lg p-3">
              <Clock size={13} className="mt-0.5 flex-shrink-0" />
              <p>Después de pagar, MP enviará el webhook a <code>/api/mp/webhook</code> y el pedido se actualizará automáticamente. Verificá en Supabase → tabla <code>orders</code>.</p>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

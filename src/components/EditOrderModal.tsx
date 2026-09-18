'use client'

import { useState, useRef } from 'react'
import { Pencil, X, Plus, Trash2, Loader2, Save, Search, Download, Check } from 'lucide-react'

interface PriceRule {
  id: string
  type: 'retail' | 'wholesale'
  price: number
  compare_at_price: number | null
  min_qty: number
  active: boolean
}

interface VariantOption {
  id: string
  size: string | null
  color: string | null
  active: boolean
  price_rules: PriceRule[]
}

interface ProductMatch {
  id: string
  name: string
  variants: VariantOption[]
}

interface EditableItem {
  key: string             // key local para React, no viaja al server
  variantId: string | null
  productId: string | null
  productName: string
  variantDesc: string | null
  quantity: number
  unitPrice: number
  variantOptions: VariantOption[]   // variantes del producto elegido (vacío hasta elegir producto)
  needsProduct: boolean             // true = fila nueva sin producto elegido todavía (bloquea guardar)
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

function variantLabel(v: VariantOption) {
  const label = [v.size, v.color].filter(Boolean).join(' / ')
  return label || 'Único'
}

// Suma la cantidad de todas las filas que son del mismo producto — el
// mínimo mayorista se evalúa por producto (todas las variantes juntas), no
// por variante suelta. Mismo criterio que crear-pedido.ts en tienda-core.
function sumProductQty(itemsList: EditableItem[], productId: string) {
  return itemsList
    .filter(i => i.productId === productId)
    .reduce((sum, i) => sum + (Number(i.quantity) || 0), 0)
}

// Precio sugerido para una variante — mismo criterio que crear-pedido.ts:
// mayorista solo si el cliente es mayorista Y la cantidad del producto llega
// al mínimo de esa regla; si no, minorista (con el rebajado si corresponde);
// si no hay regla minorista, cae a mayorista igual. Devuelve null si no hay
// ninguna regla activa — en ese caso no se toca el precio tipeado.
function suggestPrice(variant: VariantOption, productQty: number, priceType: 'retail' | 'wholesale'): number | null {
  const rules = (variant.price_rules ?? []).filter(r => r.active)
  const retailRule = rules.find(r => r.type === 'retail')
  const wholesaleRule = rules.find(r => r.type === 'wholesale')

  if (wholesaleRule && priceType === 'wholesale' && productQty >= (wholesaleRule.min_qty ?? 1)) {
    return wholesaleRule.price
  }
  if (retailRule) {
    return (retailRule.compare_at_price && retailRule.compare_at_price > 0 && retailRule.compare_at_price < retailRule.price)
      ? retailRule.compare_at_price
      : retailRule.price
  }
  if (wholesaleRule) return wholesaleRule.price
  return null
}

let rowKeySeq = 0
function newRowKey() {
  rowKeySeq += 1
  return `row-${rowKeySeq}`
}

interface Props {
  orderId: string
}

// Editor real del pedido: los productos se eligen por buscador contra el
// catálogo (nunca texto libre) y el talle/color se elige entre las
// variantes reales de ese producto — así no se puede cargar algo que no
// existe. Al elegir producto/variante se sugiere el precio real de catálogo
// (mismo criterio que la tienda: minorista/mayorista según el cliente y el
// mínimo por producto) pero queda editable — es una sugerencia, no un
// candado. Cantidad también se tipea a mano. Guardar persiste de verdad en
// order_items/orders (a diferencia del editor viejo, que solo generaba un
// PDF corregido sin tocar la base). El aviso al cliente quedó aparte, como
// 3ra opción del botón "Notificar" en la fila del pedido — pedido de David,
// 2026-09-18.
export default function EditOrderModal({ orderId }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<EditableItem[]>([])
  const [customerPriceType, setCustomerPriceType] = useState<'retail' | 'wholesale'>('retail')
  const [searchOpenKey, setSearchOpenKey] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductMatch[]>([])
  const [searching, setSearching] = useState(false)
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function handleOpen() {
    setOpen(true)
    setError(null)
    setSaved(false)
    setLoading(true)
    try {
      const res = await fetch(`/api/orders/preview?order_id=${orderId}`)
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'No se pudo cargar el pedido')
        return
      }
      const data = await res.json()
      setCustomerPriceType(data.customers?.type === 'wholesale' ? 'wholesale' : 'retail')
      const loaded: EditableItem[] = (data.order_items ?? []).map((it: any) => ({
        key: newRowKey(),
        variantId: it.variant_id ?? null,
        productId: null,
        productName: it.product_name,
        variantDesc: it.variant_desc ?? null,
        quantity: it.quantity,
        unitPrice: it.unit_price,
        variantOptions: [],
        needsProduct: false,
      }))
      setItems(loaded)

      // Hidratar variantes disponibles de las filas que ya tienen variant_id,
      // para poder mostrar el selector de talle/color con las opciones reales
      // de ese producto si el admin quiere cambiarlo.
      loaded.forEach(async (row) => {
        if (!row.variantId) return
        try {
          const r = await fetch(`/api/productos/por-variante?variant_id=${row.variantId}`)
          if (!r.ok) return
          const info = await r.json()
          setItems(prev => prev.map(it => it.key === row.key
            ? { ...it, productId: info.productId, variantOptions: info.variants ?? [] }
            : it
          ))
        } catch {
          // Si falla, la fila sigue mostrando su texto actual sin selector — no es bloqueante.
        }
      })
    } catch (err: any) {
      setError('Error de red: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  function updateItem(key: string, patch: Partial<EditableItem>) {
    setItems(prev => prev.map(it => (it.key === key ? { ...it, ...patch } : it)))
  }

  function removeItem(key: string) {
    setItems(prev => prev.filter(it => it.key !== key))
  }

  function addItem() {
    setItems(prev => [...prev, {
      key: newRowKey(),
      variantId: null,
      productId: null,
      productName: '',
      variantDesc: null,
      quantity: 1,
      unitPrice: 0,
      variantOptions: [],
      needsProduct: true,
    }])
  }

  function openSearch(key: string) {
    setSearchOpenKey(key)
    setQuery('')
    setResults([])
  }

  function runSearch(q: string) {
    setQuery(q)
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    searchDebounce.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/productos/buscar?q=${encodeURIComponent(q.trim())}`)
        const data = await res.json().catch(() => ({ products: [] }))
        setResults(data.products ?? [])
      } finally {
        setSearching(false)
      }
    }, 250)
  }

  function pickProduct(key: string, product: ProductMatch) {
    const firstVariant = product.variants.length === 1 ? product.variants[0] : null
    setItems(prev => {
      const withNewProductId = prev.map(p => (p.key === key ? { ...p, productId: product.id } : p))
      const productQty = sumProductQty(withNewProductId, product.id)
      const suggested = firstVariant ? suggestPrice(firstVariant, productQty, customerPriceType) : null
      return withNewProductId.map(it => {
        if (it.key !== key) return it
        return {
          ...it,
          productName: product.name,
          variantOptions: product.variants,
          variantId: firstVariant?.id ?? null,
          variantDesc: firstVariant ? variantLabel(firstVariant) : null,
          needsProduct: false,
          unitPrice: suggested != null ? suggested : it.unitPrice,
        }
      })
    })
    setSearchOpenKey(null)
  }

  function pickVariant(key: string, variantId: string) {
    setItems(prev => {
      const target = prev.find(it => it.key === key)
      const v = target?.variantOptions.find(v => v.id === variantId)
      const productQty = target?.productId ? sumProductQty(prev, target.productId) : 0
      const suggested = v ? suggestPrice(v, productQty, customerPriceType) : null
      return prev.map(it => {
        if (it.key !== key) return it
        return {
          ...it,
          variantId,
          variantDesc: v ? variantLabel(v) : null,
          unitPrice: suggested != null ? suggested : it.unitPrice,
        }
      })
    })
  }

  const subtotal = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0)

  async function handleSave() {
    setError(null)
    if (items.length === 0) {
      setError('El pedido necesita al menos un producto')
      return
    }
    for (const it of items) {
      if (it.needsProduct || !it.productName.trim()) {
        setError('Hay una fila sin producto elegido — buscalo y seleccionalo de la lista')
        return
      }
      if (!Number.isInteger(Number(it.quantity)) || Number(it.quantity) <= 0) {
        setError(`Cantidad inválida en "${it.productName}"`)
        return
      }
      if (Number(it.unitPrice) < 0 || Number.isNaN(Number(it.unitPrice))) {
        setError(`Precio inválido en "${it.productName}"`)
        return
      }
    }
    setSaving(true)
    try {
      const res = await fetch('/api/orders/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          items: items.map(it => ({
            variantId: it.variantId,
            productName: it.productName.trim(),
            variantDesc: it.variantDesc?.trim() || null,
            quantity: Number(it.quantity),
            unitPrice: Number(it.unitPrice),
          })),
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'No se pudo guardar el pedido')
        return
      }
      setSaved(true)
    } catch (err: any) {
      setError('Error de red: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        title="Cambiar productos, talles/colores, cantidad o precio del pedido"
        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-zinc-200 text-[11px] text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 transition-colors whitespace-nowrap"
      >
        <Pencil size={11} />
        Modificar pedido
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => !saving && setOpen(false)} />

          <div className="relative w-full max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
              <p className="font-semibold text-zinc-900 text-sm">Modificar pedido — #{orderId.slice(0, 6)}</p>
              <button onClick={() => !saving && setOpen(false)} className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors text-zinc-400">
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4">
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {!loading && !saved && (
                <>
                  <p className="text-xs text-zinc-400 mb-3">
                    Los productos se eligen del catálogo — buscá y seleccioná. El precio se sugiere solo al elegir producto/talle/color; después queda libre para corregir.
                  </p>

                  <div className="space-y-2">
                    {items.map((it) => (
                      <div key={it.key} className="bg-zinc-50 rounded-xl p-2.5">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 space-y-1.5">
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => openSearch(it.key)}
                                className={`w-full flex items-center gap-1.5 text-left text-xs px-2 py-1.5 rounded-lg border bg-white ${
                                  it.needsProduct ? 'border-amber-300 text-amber-700' : 'border-zinc-200 text-zinc-700'
                                } hover:border-primary-400`}
                              >
                                <Search size={11} className="shrink-0 text-zinc-400" />
                                {it.productName || 'Buscar producto…'}
                              </button>

                              {searchOpenKey === it.key && (
                                <div className="absolute z-10 mt-1 w-full bg-white border border-zinc-200 rounded-xl shadow-lg p-2">
                                  <input
                                    autoFocus
                                    value={query}
                                    onChange={e => runSearch(e.target.value)}
                                    placeholder="Escribí el nombre del producto (ej: chomba)"
                                    className="w-full text-xs px-2 py-1.5 rounded-lg border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-primary-400 mb-1.5"
                                  />
                                  {searching && (
                                    <div className="flex justify-center py-2"><Loader2 size={13} className="animate-spin text-zinc-400" /></div>
                                  )}
                                  {!searching && query.trim().length >= 2 && results.length === 0 && (
                                    <p className="text-[11px] text-zinc-400 px-1 py-1">Sin resultados en el catálogo</p>
                                  )}
                                  <div className="max-h-40 overflow-y-auto">
                                    {results.map(p => (
                                      <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => pickProduct(it.key, p)}
                                        className="w-full text-left text-xs px-2 py-1.5 rounded-lg hover:bg-zinc-50 text-zinc-700"
                                      >
                                        {p.name}
                                      </button>
                                    ))}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setSearchOpenKey(null)}
                                    className="w-full text-center text-[11px] text-zinc-400 hover:text-zinc-600 mt-1 py-1"
                                  >
                                    Cerrar
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="flex gap-1.5">
                              {it.variantOptions.length > 0 ? (
                                <select
                                  value={it.variantId ?? ''}
                                  onChange={e => pickVariant(it.key, e.target.value)}
                                  className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-zinc-200 bg-white focus:outline-none focus:ring-1 focus:ring-primary-400"
                                >
                                  <option value="" disabled>Talle / color…</option>
                                  {it.variantOptions.map(v => (
                                    <option key={v.id} value={v.id}>{variantLabel(v)}</option>
                                  ))}
                                </select>
                              ) : (
                                <div className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-dashed border-zinc-200 text-zinc-400">
                                  {it.variantDesc || (it.productId ? 'Sin variantes' : 'Elegí un producto para ver talle/color')}
                                </div>
                              )}
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={it.quantity}
                                onChange={e => updateItem(it.key, { quantity: Number(e.target.value) })}
                                onFocus={e => e.target.select()}
                                placeholder="Cant."
                                className="w-16 text-xs px-2 py-1.5 rounded-lg border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-primary-400"
                              />
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={it.unitPrice}
                                onChange={e => updateItem(it.key, { unitPrice: Number(e.target.value) })}
                                onFocus={e => e.target.select()}
                                placeholder="Precio unit."
                                className="w-24 text-xs px-2 py-1.5 rounded-lg border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-primary-400"
                              />
                            </div>
                          </div>
                          <button
                            onClick={() => removeItem(it.key)}
                            title="Quitar producto"
                            className="p-1.5 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-600 transition-colors mt-0.5"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
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

              {!loading && saved && (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                    <Check size={18} className="text-emerald-600" />
                  </div>
                  <p className="text-sm font-medium text-zinc-800">Pedido actualizado</p>
                  <p className="text-xs text-zinc-500 max-w-xs">
                    Para avisarle al cliente de este cambio, usá "Notificar" → "Notificar cambio de pedido" en la fila del pedido.
                  </p>
                  <a
                    href={`/api/pdf?order_id=${orderId}&mode=download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-xs text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
                  >
                    <Download size={13} />
                    Descargar recibo actualizado
                  </a>
                </div>
              )}
            </div>

            {!loading && !saved && (
              <div className="px-5 py-4 border-t border-zinc-100 flex items-center justify-between">
                <div className="text-xs text-zinc-500">
                  Subtotal: <span className="font-semibold text-zinc-900">{fmt(subtotal)}</span>
                  <span className="text-zinc-400"> (el envío se mantiene igual)</span>
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-medium hover:bg-primary-700 transition-colors disabled:opacity-60"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

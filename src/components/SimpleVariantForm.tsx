'use client'

import { useState, useImperativeHandle, forwardRef } from 'react'

// Formulario de una sola variante — para tenants con variant_mode='simple'
// (sin talle/color, ej: cosmética). Guarda stock + precios directo, sin
// matriz. El SKU vive en el producto (products.sku), no acá.

export interface SimpleVariantData {
  id?: string
  stock: number
  retailPrice: number
  retailCompareAt: number
  wholesalePrice: number
  wholesaleCompareAt: number
  wholesaleMinQty: number
}

export interface SimpleVariantHandle {
  getVariant: () => SimpleVariantData
}

const empty = (): SimpleVariantData => ({
  stock: 0, retailPrice: 0, retailCompareAt: 0, wholesalePrice: 0, wholesaleCompareAt: 0, wholesaleMinQty: 1,
})

interface Props {
  initial?: SimpleVariantData
  showRetail?: boolean
  showWholesale?: boolean
  showDiscount?: boolean
}

const SimpleVariantForm = forwardRef<SimpleVariantHandle, Props>(({ initial, showRetail = true, showWholesale = true, showDiscount = true }, ref) => {
  const [data, setData] = useState<SimpleVariantData>(initial ?? empty())

  useImperativeHandle(ref, () => ({
    getVariant: () => data,
  }))

  function set<K extends keyof SimpleVariantData>(field: K, value: SimpleVariantData[K]) {
    setData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-zinc-700">Stock y precios</h2>
      <div className="grid grid-cols-4 gap-4">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Stock</label>
          <input
            className="input text-sm" type="number" min="0"
            value={data.stock || ''} placeholder="0"
            onChange={e => set('stock', parseInt(e.target.value, 10) || 0)}
          />
        </div>
        {showRetail && (
          <div>
            <label className="block text-xs text-zinc-500 mb-1">$ Minorista</label>
            <input
              className="input text-sm" type="number" min="0" step="1"
              value={data.retailPrice || ''} placeholder="0"
              onChange={e => set('retailPrice', Math.round(parseFloat(e.target.value) || 0))}
            />
          </div>
        )}
        {showRetail && showDiscount && (
          <div>
            <label className="block text-xs text-orange-500 mb-1">$ Min. rebajado</label>
            <input
              className="input text-sm" type="number" min="0" step="1"
              value={data.retailCompareAt || ''} placeholder="0"
              onChange={e => set('retailCompareAt', Math.round(parseFloat(e.target.value) || 0))}
            />
          </div>
        )}
        {showWholesale && (
          <div>
            <label className="block text-xs text-primary-600 mb-1">$ Mayorista</label>
            <input
              className="input text-sm" type="number" min="0" step="1"
              value={data.wholesalePrice || ''} placeholder="0"
              onChange={e => set('wholesalePrice', Math.round(parseFloat(e.target.value) || 0))}
            />
          </div>
        )}
        {showWholesale && showDiscount && (
          <div>
            <label className="block text-xs text-primary-500 mb-1">$ May. rebajado</label>
            <input
              className="input text-sm" type="number" min="0" step="1"
              value={data.wholesaleCompareAt || ''} placeholder="0"
              onChange={e => set('wholesaleCompareAt', Math.round(parseFloat(e.target.value) || 0))}
            />
          </div>
        )}
        {showWholesale && (
          <div>
            <label className="block text-xs text-zinc-500 mb-1">May. mín. cant.</label>
            <input
              className="input text-sm" type="number" min="1"
              value={data.wholesaleMinQty || ''} placeholder="6"
              onChange={e => set('wholesaleMinQty', parseInt(e.target.value, 10) || 1)}
            />
          </div>
        )}
      </div>
      <p className="text-xs text-zinc-400">Este producto no usa talle/color — es una sola variante con su propio stock y precio.</p>
    </div>
  )
})

SimpleVariantForm.displayName = 'SimpleVariantForm'

export default SimpleVariantForm

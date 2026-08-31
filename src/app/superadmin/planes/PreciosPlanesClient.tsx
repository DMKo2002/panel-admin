'use client'

import { useState } from 'react'

interface Prices {
  mini: number
  standard: number
  premium: number
}

type PlanId = keyof Prices

function formatARS(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function PreciosPlanesClient({
  initial,
  nombres,
  meta,
}: {
  initial: Prices
  nombres: Record<PlanId, string>
  meta: Record<string, { updatedAt: string; updatedBy: string | null }>
}) {
  const [prices, setPrices] = useState<Prices>(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [meta_, setMeta] = useState(meta)

  function update(planId: PlanId, value: string) {
    const n = Number(value.replace(/\D/g, ''))
    setPrices(p => ({ ...p, [planId]: Number.isFinite(n) ? n : 0 }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/superadmin/update-plan-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prices),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      if (json.updatedAt && json.updatedBy) {
        const now = { updatedAt: json.updatedAt as string, updatedBy: json.updatedBy as string }
        setMeta({ mini: now, standard: now, premium: now })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const changed = JSON.stringify(prices) !== JSON.stringify(initial)

  return (
    <div className="max-w-xl space-y-5">
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 space-y-5">
        {(['mini', 'standard', 'premium'] as PlanId[]).map(planId => (
          <div key={planId} className="flex items-center justify-between gap-4 pb-5 border-b border-zinc-800 last:border-0 last:pb-0">
            <div className="min-w-0">
              <p className="text-sm text-zinc-200">{nombres[planId]}</p>
              {meta_[planId] && (
                <p className="text-xs text-zinc-500 mt-0.5">
                  Última edición: {formatFecha(meta_[planId].updatedAt)}{meta_[planId].updatedBy ? ` — ${meta_[planId].updatedBy}` : ''}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm text-zinc-500">$</span>
              <input
                type="text"
                inputMode="numeric"
                className="w-32 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 text-right focus:border-zinc-500 focus:outline-none"
                value={prices[planId]}
                onChange={e => update(planId, e.target.value)}
              />
              <span className="text-xs text-zinc-500">/mes</span>
            </div>
          </div>
        ))}
      </div>

      {changed && (
        <div className="rounded-lg border border-amber-800 bg-amber-950/40 px-4 py-3 text-xs text-amber-300">
          Tenés cambios sin guardar: {(['mini', 'standard', 'premium'] as PlanId[])
            .filter(id => prices[id] !== initial[id])
            .map(id => `${nombres[id]} ${formatARS(initial[id])} → ${formatARS(prices[id])}`)
            .join(' · ')}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !changed}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40 transition-colors"
        >
          {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  )
}

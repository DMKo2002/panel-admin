'use client'

// Cards de upgrade de plan en /dashboard/uso.
// Al elegir un plan llama a /api/billing/subscribe y redirige al checkout de
// MP donde el tenant carga su tarjeta (débito automático mensual).
// Solo se renderiza si BILLING_ENABLED === 'true' (ver page.tsx).

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'

interface PlanCard {
  id: 'mini' | 'standard' | 'premium'
  nombre: string
  precioARS: number
  features: string[]
  destacado?: boolean
}

const CARDS: PlanCard[] = [
  {
    id: 'mini',
    nombre: 'Mini',
    precioARS: 10_000,
    features: ['200 MB de almacenamiento', 'Hasta 50 productos', 'Pedidos ilimitados'],
  },
  {
    id: 'standard',
    nombre: 'Standard',
    precioARS: 30_000,
    destacado: true,
    features: ['2 GB de almacenamiento', 'Hasta 400 productos', 'Pedidos ilimitados', 'Personalización completa'],
  },
  {
    id: 'premium',
    nombre: 'Premium',
    precioARS: 80_000,
    features: ['10 GB de almacenamiento', 'Hasta 1.000 productos', 'Pedidos ilimitados', 'Todos los templates', 'Soporte prioritario'],
  },
]

function formatARS(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

export default function UpgradePlans({ currentPlan }: { currentPlan: string }) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function subscribe(planId: PlanCard['id']) {
    setLoading(planId)
    setError(null)
    try {
      const res = await fetch('/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      })
      const json = await res.json()
      if (!res.ok || !json.init_point) throw new Error(json.error ?? 'Error desconocido')
      window.location.href = json.init_point
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar la suscripción')
      setLoading(null)
    }
  }

  return (
    <div className="mt-10">
      <h2 className="text-lg font-semibold text-zinc-900">Cambiar de plan</h2>
      <p className="mt-1 text-sm text-zinc-500">
        El débito es automático todos los meses. Podés cancelar cuando quieras y tu tienda vuelve al plan gratuito.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {CARDS.map(card => {
          const esActual = card.id === currentPlan
          return (
            <div
              key={card.id}
              className={`relative flex flex-col rounded-xl border bg-white p-5 ${card.destacado ? 'border-zinc-900' : 'border-zinc-200'}`}
            >
              {card.destacado && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-zinc-900 px-2.5 py-0.5 text-[11px] font-medium text-white">
                  Recomendado
                </span>
              )}
              <h3 className="font-semibold text-zinc-900">{card.nombre}</h3>
              <p className="mt-1 text-2xl font-bold text-zinc-900">
                {formatARS(card.precioARS)}
                <span className="text-sm font-normal text-zinc-500"> /mes</span>
              </p>
              <ul className="mt-4 flex-1 space-y-2">
                {card.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-zinc-600">
                    <Check size={15} className="mt-0.5 shrink-0 text-zinc-900" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => subscribe(card.id)}
                disabled={esActual || loading !== null}
                className={`mt-5 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                  card.destacado
                    ? 'bg-zinc-900 text-white hover:bg-zinc-700'
                    : 'border border-zinc-300 text-zinc-900 hover:border-zinc-900'
                }`}
              >
                {loading === card.id && <Loader2 size={15} className="animate-spin" />}
                {esActual ? 'Tu plan actual' : `Pasar a ${card.nombre}`}
              </button>
            </div>
          )
        })}
      </div>

      <p className="mt-4 text-xs text-zinc-400">
        El pago se procesa con MercadoPago. Vas a cargar tu tarjeta en el sitio seguro de MP — nunca guardamos los datos de tu tarjeta.
      </p>
    </div>
  )
}

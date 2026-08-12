'use client'

// Card Payment Brick para pagar la suscripción de Gounuri con tarjeta directa
// (sin cuenta de Mercado Pago) — mismo patrón que
// tienda-core/MercadoPagoBrick.tsx, adaptado para pegarle a
// /api/billing/card/setup en vez de /api/mp/crear-pago.
//
// Usa la Public Key de la cuenta de MP de GOUNURI (NEXT_PUBLIC_GOUNURI_MP_PUBLIC_KEY),
// no la del tenant — es Gounuri quien cobra acá, no la tienda del tenant.

import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window { MercadoPago?: any }
}

interface Props {
  plan: 'mini' | 'standard' | 'premium'
  amount: number
  payerEmail: string
  onApproved: () => void
  onRejected: (detail?: string) => void
}

const CONTAINER_ID = 'mp-billing-card-brick'

let sdkLoadPromise: Promise<void> | null = null
function loadMercadoPagoSdk(): Promise<void> {
  if (typeof window !== 'undefined' && window.MercadoPago) return Promise.resolve()
  if (sdkLoadPromise) return sdkLoadPromise
  sdkLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-mp-sdk]')
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar el SDK de MercadoPago')))
      return
    }
    const script = document.createElement('script')
    script.src = 'https://sdk.mercadopago.com/js/v2'
    script.dataset.mpSdk = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('No se pudo cargar el SDK de MercadoPago'))
    document.body.appendChild(script)
  })
  return sdkLoadPromise
}

export default function BillingCardBrick({ plan, amount, payerEmail, onApproved, onRejected }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const controllerRef = useRef<any>(null)

  useEffect(() => {
    let cancelled = false
    const publicKey = process.env.NEXT_PUBLIC_GOUNURI_MP_PUBLIC_KEY

    async function mount() {
      if (!publicKey) {
        setError('Falta configurar NEXT_PUBLIC_GOUNURI_MP_PUBLIC_KEY — avisá a soporte.')
        return
      }
      try {
        await loadMercadoPagoSdk()
        if (cancelled) return
        const MercadoPagoCtor = window.MercadoPago
        if (!MercadoPagoCtor) throw new Error('SDK de MercadoPago no disponible')
        const mp = new MercadoPagoCtor(publicKey, { locale: 'es-AR' })
        const bricksBuilder = mp.bricks()

        controllerRef.current = await bricksBuilder.create('cardPayment', CONTAINER_ID, {
          initialization: { amount },
          callbacks: {
            onReady: () => {},
            onError: (brickError: any) => {
              console.error('Brick error:', brickError)
              setError('Ocurrió un error cargando el formulario de pago. Recargá la página.')
            },
            onSubmit: (formData: any) => {
              setSubmitting(true)
              setError(null)
              return fetch('/api/billing/card/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  plan,
                  token: formData.token,
                  payerEmail,
                }),
              })
                .then(res => res.json().then(data => ({ ok: res.ok, data })))
                .then(({ ok, data }) => {
                  setSubmitting(false)
                  if (!ok) {
                    setError(data.error ?? 'No pudimos procesar el pago.')
                    onRejected(data.statusDetail)
                    return
                  }
                  onApproved()
                })
                .catch((err: any) => {
                  setSubmitting(false)
                  setError(err.message ?? 'No pudimos procesar el pago.')
                })
            },
          },
        })
      } catch (err: any) {
        if (!cancelled) setError(err.message ?? 'No se pudo cargar el formulario de pago.')
      }
    }

    mount()

    return () => {
      cancelled = true
      controllerRef.current?.unmount?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, amount, payerEmail])

  return (
    <div className="space-y-3">
      <div id={CONTAINER_ID} />
      {submitting && <p className="text-xs text-zinc-500">Procesando pago...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}

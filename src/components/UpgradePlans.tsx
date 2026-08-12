'use client'

// Cards de upgrade de plan en /dashboard/uso.
// Al elegir un plan llama a /api/billing/subscribe y redirige al checkout de
// MP donde el tenant carga su tarjeta (débito automático mensual).
// Solo se renderiza si BILLING_ENABLED === 'true' (ver page.tsx).

import { useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { PLANS, formatStorage, TERM_DISCOUNTS, priceForTerm, type BillingTerm } from '@/lib/plans'
import { createClient } from '@/lib/supabase/client'
import BillingCardBrick from '@/components/BillingCardBrick'

interface PlanCard {
  id: 'mini' | 'standard' | 'premium'
  nombre: string
  precioARS: number
  features: string[]
  destacado?: boolean
}

// Precios Y límites desde la fuente única de verdad (plans.ts) — así esta
// tabla nunca vuelve a desincronizarse de los límites reales (pasó con la
// recalibración del 2026-08-12).
const CARDS: PlanCard[] = [
  {
    id: 'mini',
    nombre: PLANS.mini.nombre,
    precioARS: PLANS.mini.precioARS,
    features: [`${formatStorage(PLANS.mini.storageMB)} de almacenamiento`, `Hasta ${PLANS.mini.maxProductos} productos`, 'Pedidos ilimitados'],
  },
  {
    id: 'standard',
    nombre: PLANS.standard.nombre,
    precioARS: PLANS.standard.precioARS,
    destacado: true,
    features: [`${formatStorage(PLANS.standard.storageMB)} de almacenamiento`, `Hasta ${PLANS.standard.maxProductos} productos`, 'Pedidos ilimitados', 'Personalización completa'],
  },
  {
    id: 'premium',
    nombre: PLANS.premium.nombre,
    precioARS: PLANS.premium.precioARS,
    features: [`${formatStorage(PLANS.premium.storageMB)} de almacenamiento`, `Hasta ${PLANS.premium.maxProductos} productos`, 'Pedidos ilimitados', 'Todos los templates', 'Soporte prioritario'],
  },
]

function formatARS(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Apagado a propósito (2026-08-12): "tarjeta directa" cobra bien la primera
// vez pero el cron mensual todavía no puede renovar sola (Mercado Pago exige
// aprobación especial para cobrar sin CVV sobre tarjeta guardada — ver
// billing-card.ts). Hasta que llegue esa aprobación, solo Mercado Pago queda
// visible acá. El código de tarjeta directa se deja intacto para reactivarlo
// cambiando esta constante a true — no hace falta tocar nada más.
const TARJETA_DIRECTA_HABILITADA = false

export default function UpgradePlans({ currentPlan, trialing = false }: { currentPlan: string; trialing?: boolean }) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // El email para autorizar en MP no es necesariamente el email con el que
  // el owner entra al Panel Admin — puede querer pagar con una cuenta de MP
  // distinta (la suya personal, la de un socio, etc). Se prellena con el
  // email de login como punto de partida, pero es editable.
  const [payerEmail, setPayerEmail] = useState('')

  // Dos formas de pagar en paralelo, para no perder la que ya funciona:
  // 'mp' = redirect al checkout de Mercado Pago (Preapproval, necesita
  // cuenta de MP con el mismo email). 'tarjeta' = Card Payment Brick acá
  // mismo, sin cuenta, con tarjeta guardada para el débito de los meses
  // siguientes (ver /api/billing/card/setup).
  const [metodo, setMetodo] = useState<'mp' | 'tarjeta'>('mp')
  const [cardPlan, setCardPlan] = useState<PlanCard['id'] | null>(null)
  const [cardSuccess, setCardSuccess] = useState(false)

  // Plazo de pago — solo aplica a Mercado Pago (Preapproval permite cobrar de
  // una N meses con auto_recurring.frequency = N). La tarjeta directa siempre
  // cobra mes a mes, no tiene plazo para elegir acá.
  const [term, setTerm] = useState<BillingTerm>(1)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setPayerEmail(data.user.email)
    })
  }, [])

  async function subscribe(planId: PlanCard['id']) {
    if (!EMAIL_RE.test(payerEmail.trim())) {
      setError('Ingresá el email de la cuenta de Mercado Pago con la que vas a pagar.')
      return
    }
    setLoading(planId)
    setError(null)
    try {
      const res = await fetch('/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId, payerEmail: payerEmail.trim(), months: term }),
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

      {TARJETA_DIRECTA_HABILITADA && (
        <div className="mt-4 inline-flex rounded-lg border border-zinc-200 p-1 bg-zinc-50">
          <button
            onClick={() => { setMetodo('mp'); setCardPlan(null); setError(null) }}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${metodo === 'mp' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500'}`}
          >
            Mercado Pago (con cuenta)
          </button>
          <button
            onClick={() => { setMetodo('tarjeta'); setCardPlan(null); setError(null) }}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${metodo === 'tarjeta' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500'}`}
          >
            Tarjeta directa (sin cuenta)
          </button>
        </div>
      )}

      <div className="mt-4">
        <label className="block text-sm font-medium text-zinc-700 mb-1">
          {metodo === 'mp' ? 'Email de tu cuenta de Mercado Pago' : 'Email de contacto para el pago'}
        </label>
        <input
          type="email"
          className="input max-w-sm"
          value={payerEmail}
          onChange={e => setPayerEmail(e.target.value)}
          placeholder="tu@email.com"
        />
        {metodo === 'mp' ? (
          <p className="mt-1 text-xs text-zinc-400">
            Tiene que ser el email de la cuenta de Mercado Pago con la que vas a autorizar el pago — no hace falta que sea el mismo con el que entrás acá. Si no coincide con la cuenta de MP que uses al pagar, Mercado Pago va a rechazar el pago.
          </p>
        ) : (
          <p className="mt-1 text-xs text-zinc-400">
            No hace falta que tengas cuenta de Mercado Pago — pagás directo con los datos de la tarjeta. Este email es solo de referencia para el pago.
          </p>
        )}
      </div>

      {metodo === 'mp' && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-zinc-700 mb-1">Plazo de pago</label>
          <div className="inline-flex rounded-lg border border-zinc-200 p-1 bg-zinc-50">
            {([1, 6, 12] as BillingTerm[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTerm(t)}
                className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${term === t ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500'}`}
              >
                {t === 1 ? 'Mensual' : `${t} meses`}
                {TERM_DISCOUNTS[t] > 0 && (
                  <span className="ml-1 text-emerald-600">-{TERM_DISCOUNTS[t] * 100}%</span>
                )}
              </button>
            ))}
          </div>
          {term > 1 && (
            <p className="mt-1 text-xs text-zinc-400">
              Se cobra el total de los {term} meses de una sola vez — recién vuelve a cobrarte cuando se cumpla el plazo, no todos los meses.
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {CARDS.map(card => {
          // Durante el trial el plan "actual" no está pago — el botón debe
          // permitir activarlo.
          const esActual = card.id === currentPlan && !trialing
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
              {metodo === 'mp' && term > 1 ? (
                <div className="mt-1">
                  <p className="text-2xl font-bold text-zinc-900">
                    {formatARS(priceForTerm(PLANS[card.id], term))}
                    <span className="text-sm font-normal text-zinc-500"> total / {term} meses</span>
                  </p>
                  <p className="text-xs text-zinc-400">
                    equivale a {formatARS(Math.round(priceForTerm(PLANS[card.id], term) / term))}/mes
                  </p>
                </div>
              ) : (
                <p className="mt-1 text-2xl font-bold text-zinc-900">
                  {formatARS(card.precioARS)}
                  <span className="text-sm font-normal text-zinc-500"> /mes</span>
                </p>
              )}
              <ul className="mt-4 flex-1 space-y-2">
                {card.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-zinc-600">
                    <Check size={15} className="mt-0.5 shrink-0 text-zinc-900" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => {
                  if (metodo === 'mp') { subscribe(card.id); return }
                  if (!EMAIL_RE.test(payerEmail.trim())) { setError('Ingresá un email de contacto para el pago.'); return }
                  setError(null)
                  setCardSuccess(false)
                  setCardPlan(card.id)
                }}
                disabled={esActual || loading !== null}
                className={`mt-5 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                  card.destacado
                    ? 'bg-zinc-900 text-white hover:bg-zinc-700'
                    : 'border border-zinc-300 text-zinc-900 hover:border-zinc-900'
                }`}
              >
                {loading === card.id && <Loader2 size={15} className="animate-spin" />}
                {esActual
                  ? 'Tu plan actual'
                  : trialing && card.id === currentPlan
                    ? `Activar ${card.nombre}`
                    : metodo === 'mp'
                      ? `Pasar a ${card.nombre}`
                      : `Pagar ${card.nombre} con tarjeta`}
              </button>
            </div>
          )
        })}
      </div>

      {metodo === 'tarjeta' && cardPlan && !cardSuccess && (
        <div className="mt-6 max-w-md rounded-xl border border-zinc-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-zinc-900">
            Pagar {CARDS.find(c => c.id === cardPlan)?.nombre} con tarjeta
          </h3>
          <p className="mt-1 text-xs text-zinc-400">
            Guardamos la tarjeta para cobrar automáticamente el mismo día cada mes. Podés cambiarla o cancelar cuando quieras.
          </p>
          <div className="mt-4">
            <BillingCardBrick
              plan={cardPlan}
              amount={PLANS[cardPlan].precioARS}
              payerEmail={payerEmail.trim()}
              onApproved={() => { setCardSuccess(true); setTimeout(() => window.location.reload(), 1500) }}
              onRejected={() => {}}
            />
          </div>
        </div>
      )}

      {cardSuccess && (
        <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          ✓ Pago aprobado. Actualizando tu plan...
        </div>
      )}

      <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
        ¿Necesitás más de lo que ofrece Premium? Escribinos por{' '}
        <a href="https://wa.me/541131351972" target="_blank" rel="noopener noreferrer" className="font-medium text-zinc-900 underline">
          WhatsApp
        </a>{' '}
        o a{' '}
        <a href="mailto:info@gounuri.com" className="font-medium text-zinc-900 underline">
          info@gounuri.com
        </a>{' '}
        y armamos un plan a medida.
      </div>

      <p className="mt-4 text-xs text-zinc-400">
        {metodo === 'mp' ? (
          <>
            El pago se procesa con MercadoPago. Vas a cargar tu medio de pago en el sitio seguro de MP — nunca guardamos los datos de tu tarjeta.
            Aceptamos tarjetas de crédito y débito bancarias habilitadas para débito automático, o dinero disponible en tu cuenta de MercadoPago.
            No se aceptan tarjetas prepagas ni virtuales (ej. Prex, Uala prepaga) para suscripciones recurrentes.
          </>
        ) : (
          <>
            Pagás directo con los datos de tu tarjeta, sin necesidad de cuenta de Mercado Pago. Nunca guardamos los datos de tu tarjeta nosotros —
            quedan tokenizados en Mercado Pago. No se aceptan tarjetas prepagas ni virtuales (ej. Prex, Uala prepaga) para cobros recurrentes.
          </>
        )}
      </p>
    </div>
  )
}

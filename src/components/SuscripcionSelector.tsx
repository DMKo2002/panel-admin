'use client'

// /dashboard/suscripcion -- pantalla de facturacion/suscripcion DENTRO de
// Panel Admin, con la barra lateral siempre visible (2026-08-26, pedido de
// ARam -- ver charla en memoria de proyecto "Gounuri billing/subscriptions").
//
// Portado de gounuri-web/src/app/perfil/plan/PlanSelector.tsx (misma logica,
// mismo flujo de Mercado Pago/transferencia que se armo ahi durante toda la
// sesion) -- 2026-08-26, pedido de ARam: se ve "tal como esta" en
// gounuri.com/perfil/plan (negro/blanco, btn-black/btn-outline, card con
// borde zinc-900), NO el primary-600/btn-primary/btn-secondary que usa el
// resto de Panel Admin. Esas dos clases (btn-black/btn-outline) se agregaron
// a globals.css solo para esta pantalla -- ver comentario ahí.
//
// gounuri-web/perfil/plan sigue existiendo tal cual (no se tocó) -- decisión
// pendiente de qué hacer con esa pantalla una vez que esta quede aprobada,
// ver charla del 2026-08-26. El link "Facturación" del sidebar (Sidebar.tsx)
// TAMPOCO se tocó todavía -- sigue apuntando a gounuri.com a propósito, para
// no afectar a los 4 tenants activos hasta que esta pantalla esté validada.

import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Check, Loader2, ChevronRight } from 'lucide-react'
import { PLANS, priceForTerm, TERM_DISCOUNTS, TRIAL_DAYS, isPlanId, type PlanDef, type PlanId, type BillingTerm } from '@/lib/plans'
import { createClient } from '@/lib/supabase/client'
import type { PlatformPaymentSettings } from '@/lib/platformBilling'
import TransferPaymentBlock from '@/components/TransferPaymentBlock'

function formatARS(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const TERM_LABEL: Record<BillingTerm, string> = { 1: 'Mensual', 6: 'Semestral', 12: 'Anual' }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Cards de plan -- mismo criterio que UpgradePlans.tsx (ya en desuso, ver
// comentario ahi) pero con descripcion/features mas completos, tomados de
// gounuri-web/src/lib/site.ts para mantener la misma copy en los dos sitios.
// Cada card extiende el PlanDef real de PLANS -- así priceForTerm/
// fullPriceForTerm (que esperan un PlanDef) funcionan pasándole la card
// entera, sin tener que reescribir su firma.
interface PlanCard extends PlanDef {
  id: PlanId
  descripcion: string
  features: string[]
  destacado: boolean
}

const PLANES: PlanCard[] = [
  {
    ...PLANS.mini,
    id: 'mini',
    descripcion: 'Para empezar a vender online sin vueltas.',
    destacado: false,
    features: [
      'Hasta 50 productos',
      '300 MB de almacenamiento',
      '15.000 visitas por mes',
      'Pedidos ilimitados, sin comisión por venta',
      'Pagos con MercadoPago y transferencia',
      'Personalización de logo y colores',
    ],
  },
  {
    ...PLANS.standard,
    id: 'standard',
    descripcion: 'Para tiendas en crecimiento.',
    destacado: true,
    features: [
      'Hasta 300 productos',
      '1 GB de almacenamiento',
      '75.000 visitas por mes',
      'Todo lo del plan Mini',
      'Precios mayoristas y minoristas',
      'Etiquetas de envío en PDF',
      'Emails transaccionales con tu marca',
    ],
  },
  {
    ...PLANS.premium,
    id: 'premium',
    descripcion: 'Para marcas establecidas que quieren todo.',
    destacado: false,
    features: [
      'Hasta 600 productos',
      '3 GB de almacenamiento',
      '300.000 visitas por mes',
      'Todo lo del plan Business',
      'Modo sin stock y pedidos por encargo',
      'Cuentas y roles para tu equipo',
      'Soporte prioritario',
    ],
  },
]

export default function SuscripcionSelector({
  currentPlan,
  trialing,
  paymentSettings,
  billingTerm,
  nextBillingDate,
  trialEndsAt,
  mpPreapprovalId,
  billingPausedByUser,
  legacyManualBilling,
  paymentHistory,
}: {
  currentPlan: string
  trialing: boolean
  paymentSettings: PlatformPaymentSettings
  billingTerm: BillingTerm | null
  nextBillingDate: string | null
  trialEndsAt: string | null
  mpPreapprovalId: string | null
  billingPausedByUser: boolean
  legacyManualBilling: boolean
  paymentHistory: { id: string; amount: number; status: string; created_at: string; mpPaymentId: string | null; mpPreapprovalId: string | null }[]
}) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [payerEmail, setPayerEmail] = useState('')
  const [term, setTerm] = useState<BillingTerm>(1)
  const [expandedPlan, setExpandedPlan] = useState<PlanId | null>(null)
  const [mpEmailPlan, setMpEmailPlan] = useState<PlanId | null>(null)

  const searchParams = useSearchParams()
  const sectionRef = useRef<HTMLDivElement>(null)
  const [highlightPlan, setHighlightPlan] = useState<PlanId | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [subDetailOpen, setSubDetailOpen] = useState(false)
  const [showPlanCards, setShowPlanCards] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setPayerEmail(data.user.email)
    })
  }, [])

  useEffect(() => {
    const planParam = searchParams.get('plan')
    if (isPlanId(planParam)) {
      setHighlightPlan(planParam)
      sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      const t = setTimeout(() => setHighlightPlan(null), 2500)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  async function subscribeMp(planId: PlanId) {
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

  async function cancelMp() {
    setCanceling(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason.trim() || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error desconocido')
      setShowCancelConfirm(false)
      setCancelReason('')
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo dar de baja la suscripción')
      setCanceling(false)
    }
  }

  if (legacyManualBilling) {
    return (
      <div ref={sectionRef}>
        <p className="text-sm text-zinc-500">
          Tu plan lo gestiona el equipo de Gounuri directamente — escribinos si querés hacer algún cambio.
        </p>
      </div>
    )
  }

  // Solo hay algo que "resumir" arriba cuando ya existe una suscripción real
  // (activa o recién cancelada) -- si todavía no eligió ningún plan, no hay
  // nada que mostrar ahí y las cards de plan son lo único que tiene sentido.
  const isPaidPlan = isPlanId(currentPlan)
  const hasPaidSummary = isPaidPlan && !trialing && (mpPreapprovalId || billingPausedByUser)
  const hasTrialSummary = trialing
  // Sin suscripción activa (2026-08-26, pedido de ARam -- reportado con los
  // tenants Test2 y Beck): ni pago vigente ni en prueba -- plan quedó en
  // 'free'/cancelado (trial vencido sin pagar, suscripción de MP dada de
  // baja, o nunca eligió plan). Antes esto no mostraba NADA arriba de las
  // cards, ahora se explicita el estado en vez de dejarlo mudo. mpPreapprovalId
  // puede seguir seteado acá por un checkout de MP viejo/abandonado -- no
  // cuenta como suscripción real porque isPaidPlan ya lo filtra (mismo
  // criterio que cicloVigente() en SuperadminClient.tsx).
  const hasFreeSummary = !hasPaidSummary && !hasTrialSummary
  const hasSummary = hasPaidSummary || hasTrialSummary
  // Dias restantes de prueba (2026-08-26, pedido de ARam) -- se usa tanto
  // arriba del marco de hasTrialSummary (trial 'formal', plan_status
  // 'trial') como dentro de hasFreeSummary (tenants que todavia no
  // eligieron plan pero les queda trial_ends_at a futuro, p.ej. recien
  // creados antes de que plan_status se resuelva a 'trial') -- si no hay
  // trial_ends_at o ya paso, cae a 0 y cada bloque muestra su mensaje
  // generico de siempre.
  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000))
    : 0
  const cardsVisible = showPlanCards || !hasSummary

  return (
    <div ref={sectionRef}>
      {/* Resumen de la suscripción actual arriba de todo (2026-08-26, pedido
          de ARam) -- vencimiento, plan elegido, precio de renovación y el
          toggle de renovación automática, con todo el detalle (y "Cancelar
          suscripción") atrás de la flecha, en vez de enterrado adentro de la
          card del plan. Solo aplica al flujo de Mercado Pago propio de este
          tenant -- legacyManualBilling ya cortó con un return antes de acá. */}
      {hasPaidSummary && (() => {
        const planActual = PLANES.find(p => p.id === currentPlan)
        // Mismo precio con descuento que transferencia (unificado 2026-08-26,
        // pedido de ARam) -- ver comentario en priceForTerm, lib/plans.ts.
        const precioRenovacion = mpPreapprovalId && isPlanId(currentPlan)
          ? priceForTerm(PLANS[currentPlan], billingTerm ?? 1)
          : null
        return (
          <div className="mt-8 overflow-hidden rounded-xl border border-zinc-200">
            <div className="hidden sm:grid grid-cols-[0.8fr_0.9fr_0.8fr_0.9fr_1fr_28px] gap-3 bg-zinc-50 px-5 py-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
              <span>Estado</span>
              <span>Suscripción</span>
              <span>Ciclo de facturación</span>
              <span>Vencimiento</span>
              <span>Precio de renovación</span>
              <span />
            </div>
            <button
              type="button"
              onClick={() => setSubDetailOpen(o => !o)}
              className="grid w-full grid-cols-2 sm:grid-cols-[0.8fr_0.9fr_0.8fr_0.9fr_1fr_28px] items-center gap-x-3 gap-y-2 px-5 py-4 text-left transition-colors hover:bg-zinc-50"
            >
              <span className="text-sm text-zinc-700">{mpPreapprovalId ? 'Plan activo' : 'Cancelada'}</span>
              <span className="font-semibold text-zinc-900">{planActual?.nombre ?? currentPlan}</span>
              <span className="text-sm text-zinc-700">{billingTerm ? TERM_LABEL[billingTerm] : '—'}</span>
              <span className="text-sm text-zinc-700 sm:text-left">{nextBillingDate ? formatFecha(nextBillingDate) : '—'}</span>
              <span className="text-sm text-zinc-700">{formatARS(precioRenovacion ?? 0)}</span>
              <ChevronRight className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${subDetailOpen ? 'rotate-90' : ''}`} />
            </button>
            {subDetailOpen && (
              <div className="border-t border-zinc-200 bg-zinc-50 px-5 py-4 text-sm text-zinc-600">
                <p className="font-bold text-zinc-900">Detalles de Suscripción</p>
                <div className="mt-2 space-y-1.5">
                  <p>Estado: <span className="font-medium text-zinc-900">{mpPreapprovalId ? 'Plan activo' : 'Cancelada'}</span></p>
                  <p>Suscripción: <span className="font-medium text-zinc-900">{planActual?.nombre ?? currentPlan}</span></p>
                  <p>Ciclo de facturación: {billingTerm ? TERM_LABEL[billingTerm] : '—'}</p>
                  <p>Vencimiento: {nextBillingDate ? formatFecha(nextBillingDate) : '—'}</p>
                  <p>Precio de renovación: {formatARS(precioRenovacion ?? 0)}</p>
                </div>
                {mpPreapprovalId && (
                  <p>
                    ID de suscripción: <span className="font-mono text-xs">{mpPreapprovalId}</span>
                  </p>
                )}

                {mpPreapprovalId ? (
                  showCancelConfirm ? (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      <p>
                        Vas a poder seguir usando tu tienda
                        {nextBillingDate ? <> hasta el <strong>{formatFecha(nextBillingDate)}</strong></> : ''}.
                        Después de esa fecha no te volvemos a cobrar y tu plan pasa a gratuito.
                      </p>
                      <div className="mt-3">
                        <label className="block text-xs font-medium text-red-700 mb-1">
                          Nos da pena que te vayas — ¿nos contás por qué cancelás? (opcional)
                        </label>
                        <textarea
                          value={cancelReason}
                          onChange={e => setCancelReason(e.target.value)}
                          rows={2}
                          maxLength={2000}
                          placeholder="Tu respuesta nos ayuda a mejorar..."
                          className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-zinc-700 placeholder:text-zinc-400 focus:border-red-400 focus:outline-none"
                        />
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <button onClick={() => { setShowCancelConfirm(false); setCancelReason('') }} disabled={canceling} className="btn-outline px-3 py-1.5 text-xs">
                          Cancelar
                        </button>
                        <button onClick={cancelMp} disabled={canceling} className="btn-black px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 disabled:opacity-50">
                          {canceling && <Loader2 size={15} className="animate-spin" />}
                          Sí, dar de baja
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex justify-end">
                      <button onClick={() => setShowCancelConfirm(true)} className="btn-outline min-w-[230px] bg-transparent text-zinc-500 border-zinc-300 hover:bg-zinc-50 hover:text-zinc-700">
                        Cancelar suscripción
                      </button>
                    </div>
                  )
                ) : (
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
                    Diste de baja tu suscripción{nextBillingDate ? <> — seguís con acceso hasta el <strong>{formatFecha(nextBillingDate)}</strong></> : ''}.
                  </p>
                )}

                <a href="#historial-de-pago" className="mt-3 inline-block text-xs font-medium text-zinc-500 underline hover:text-zinc-900">
                  Ver historial de pago
                </a>
              </div>
            )}
          </div>
        )
      })()}
      {hasTrialSummary && !hasPaidSummary && (() => {
        // El trial es de 7 días del plan elegido en el alta (self-serve,
        // ver create-tenant/route.ts en gounuri-web: plan: chosenPlan,
        // plan_status: 'trial') -- NO es un "plan gratuito", por eso acá
        // abajo mostramos el nombre del plan elegido, no un genérico
        // "Gratis". PLANES no incluye 'free' -- currentPlan === 'free' acá
        // sería un caso residual/legacy, con nombrePlan cayendo a 'Gratis'.
        const planActual = PLANES.find(p => p.id === currentPlan)
        const nombrePlan = planActual?.nombre ?? 'Gratis'
        return (
        <>
          <p className="mt-8 px-5 text-sm text-zinc-600">
            Te quedan {trialDaysLeft} día{trialDaysLeft === 1 ? '' : 's'} de prueba gratuita. Disfrutá este módulo y, si te gusta, elegí un plan para continuar.
          </p>
          <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200">
            <div className="hidden sm:grid grid-cols-[0.8fr_0.9fr_0.8fr_0.9fr_1fr_28px] gap-3 bg-zinc-50 px-5 py-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
              <span>Estado</span>
              <span>Suscripción</span>
              <span>Ciclo de facturación</span>
              <span>Vencimiento</span>
              <span>Precio de renovación</span>
              <span />
            </div>
            <button
              type="button"
              onClick={() => setSubDetailOpen(o => !o)}
              className="grid w-full grid-cols-2 sm:grid-cols-[0.8fr_0.9fr_0.8fr_0.9fr_1fr_28px] items-center gap-x-3 gap-y-2 px-5 py-4 text-left transition-colors hover:bg-zinc-50"
            >
              <span className="text-sm text-zinc-700">Prueba gratuita</span>
              <span className="font-semibold text-zinc-900">{nombrePlan}</span>
              <span className="text-sm text-zinc-700">—</span>
              <span className="text-sm text-zinc-700 sm:text-left">{trialEndsAt ? formatFecha(trialEndsAt) : '—'}</span>
              <span className="text-sm text-zinc-700">{formatARS(0)}</span>
              <ChevronRight className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${subDetailOpen ? 'rotate-90' : ''}`} />
            </button>
            {subDetailOpen && (
              <div className="border-t border-zinc-200 bg-zinc-50 px-5 py-4 text-sm text-zinc-600">
                <p className="font-bold text-zinc-900">Detalles de Suscripción</p>
                <div className="mt-2 space-y-1.5">
                  <p>Estado: <span className="font-medium text-zinc-900">Prueba gratuita ({TRIAL_DAYS} días)</span></p>
                  <p>Suscripción: <span className="font-medium text-zinc-900">{nombrePlan}</span></p>
                  <p>Ciclo de facturación: —</p>
                  <p>Vencimiento: {trialEndsAt ? formatFecha(trialEndsAt) : '—'}</p>
                  <p>Precio de renovación: {formatARS(0)}</p>
                </div>
                <p className="mt-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-zinc-600">
                  Estás probando el plan <strong>{nombrePlan}</strong> sin cargo{trialEndsAt ? <> hasta el <strong>{formatFecha(trialEndsAt)}</strong></> : ''}. Elegí cómo pagar para que tu tienda siga activa cuando termine la prueba.
                </p>
                <a href="#historial-de-pago" className="mt-3 inline-block text-xs font-medium text-zinc-500 underline hover:text-zinc-900">
                  Ver historial de pago
                </a>
              </div>
            )}
          </div>
        </>
        )
      })()}
      {hasFreeSummary && (
        <div className="mt-8 rounded-xl border border-zinc-200 bg-zinc-50 px-5 py-4">
          <p className="text-sm font-medium text-zinc-900">
            Estado: <span className="font-normal text-zinc-600">Sin suscripción activa</span>
          </p>
          {trialDaysLeft > 0 ? (
            <>
              <p className="mt-1 text-sm text-zinc-500">
                Te quedan {trialDaysLeft} día{trialDaysLeft === 1 ? '' : 's'} de prueba gratuita.
              </p>
              <p className="mt-1 text-sm text-zinc-500">Disfrutá este módulo y, si te gusta, elegí un plan para continuar.</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-zinc-500">Elegí un plan para activar tu tienda.</p>
          )}
        </div>
      )}

      {hasSummary && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowPlanCards(v => !v)}
            className="btn-black min-w-[230px]"
          >
            {showPlanCards ? 'Ocultar planes' : 'Renovar o Cambiar de Plan'}
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {cardsVisible && (
      <>
      <div className="mt-10 flex justify-center">
        {/* SVG de descuento inline (misma geometría del archivo original) para poder
            aplicar el hover como stroke sobre la forma real de cada píldora. */}
        <svg
          viewBox="0 0 412 35"
          className="h-[37px] w-full max-w-[432px]"
          aria-label="Elegir plazo de pago: Mensual, Semestral con 10% de descuento, o Anual con 20% de descuento"
        >
          {/* Mensual */}
          <g
            role="button"
            tabIndex={0}
            aria-pressed={term === 1}
            className="group cursor-pointer outline-none"
            onClick={() => setTerm(1)}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setTerm(1)}
          >
            <path d="M0 17.5C0 7.83502 7.83502 0 17.5 0H138.5C148.165 0 156 7.83502 156 17.5C156 27.165 148.165 35 138.5 35H17.5C7.83501 35 0 27.165 0 17.5Z" fill="#D9D9D9" className="transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0" />
            <path d="M53.7585 13.2727H56.0341L58.4375 19.1364H58.5398L60.9432 13.2727H63.2188V22H61.429V16.3196H61.3565L59.098 21.9574H57.8793L55.6207 16.2983H55.5483V22H53.7585V13.2727ZM67.6879 22.1278C67.0146 22.1278 66.435 21.9915 65.9492 21.7188C65.4663 21.4432 65.0941 21.054 64.8327 20.5511C64.5714 20.0455 64.4407 19.4474 64.4407 18.7571C64.4407 18.0838 64.5714 17.4929 64.8327 16.9844C65.0941 16.4759 65.462 16.0795 65.9364 15.7955C66.4137 15.5114 66.9734 15.3693 67.6154 15.3693C68.0472 15.3693 68.4492 15.4389 68.8214 15.5781C69.1964 15.7145 69.5231 15.9205 69.8015 16.196C70.0827 16.4716 70.3015 16.8182 70.4577 17.2358C70.614 17.6506 70.6921 18.1364 70.6921 18.6932V19.1918H65.1651V18.0668H68.9833C68.9833 17.8054 68.9265 17.5739 68.8129 17.3722C68.6992 17.1705 68.5415 17.0128 68.3398 16.8991C68.141 16.7827 67.9094 16.7244 67.6452 16.7244C67.3697 16.7244 67.1254 16.7884 66.9123 16.9162C66.7021 17.0412 66.5373 17.2102 66.418 17.4233C66.2987 17.6335 66.2376 17.8679 66.2347 18.1264V19.196C66.2347 19.5199 66.2944 19.7997 66.4137 20.0355C66.5359 20.2713 66.7077 20.4531 66.9293 20.581C67.1509 20.7088 67.4137 20.7727 67.7177 20.7727C67.9194 20.7727 68.104 20.7443 68.2717 20.6875C68.4393 20.6307 68.5827 20.5455 68.7021 20.4318C68.8214 20.3182 68.9123 20.179 68.9748 20.0142L70.6538 20.125C70.5685 20.5284 70.3938 20.8807 70.1296 21.1818C69.8683 21.4801 69.5302 21.7131 69.1154 21.8807C68.7035 22.0455 68.2276 22.1278 67.6879 22.1278ZM73.6921 18.2159V22H71.8768V15.4545H73.6069V16.6094H73.6836C73.8285 16.2287 74.0714 15.9276 74.4123 15.706C74.7532 15.4815 75.1665 15.3693 75.6523 15.3693C76.1069 15.3693 76.5032 15.4688 76.8413 15.6676C77.1793 15.8665 77.4421 16.1506 77.6296 16.5199C77.8171 16.8864 77.9109 17.3239 77.9109 17.8324V22H76.0955V18.1562C76.0984 17.7557 75.9961 17.4432 75.7887 17.2188C75.5813 16.9915 75.2958 16.8778 74.9322 16.8778C74.6879 16.8778 74.4719 16.9304 74.2844 17.0355C74.0998 17.1406 73.9549 17.294 73.8498 17.4957C73.7475 17.6946 73.695 17.9347 73.6921 18.2159ZM84.7876 17.321L83.1257 17.4233C83.0973 17.2812 83.0362 17.1534 82.9425 17.0398C82.8487 16.9233 82.7251 16.831 82.5717 16.7628C82.4212 16.6918 82.2408 16.6562 82.0305 16.6562C81.7493 16.6562 81.5121 16.7159 81.3189 16.8352C81.1257 16.9517 81.0291 17.108 81.0291 17.304C81.0291 17.4602 81.0916 17.5923 81.2166 17.7003C81.3416 17.8082 81.5561 17.8949 81.8601 17.9602L83.0447 18.1989C83.6811 18.3295 84.1555 18.5398 84.468 18.8295C84.7805 19.1193 84.9368 19.5 84.9368 19.9716C84.9368 20.4006 84.8104 20.777 84.5575 21.1009C84.3075 21.4247 83.9638 21.6776 83.5263 21.8594C83.0916 22.0384 82.5902 22.1278 82.022 22.1278C81.1555 22.1278 80.4652 21.9474 79.951 21.5866C79.4396 21.223 79.1399 20.7287 79.0518 20.1037L80.8374 20.0099C80.8913 20.2741 81.022 20.4759 81.2294 20.6151C81.4368 20.7514 81.7024 20.8196 82.0263 20.8196C82.3445 20.8196 82.6001 20.7585 82.7933 20.6364C82.9893 20.5114 83.0888 20.3509 83.0916 20.1548C83.0888 19.9901 83.0192 19.8551 82.8828 19.75C82.7464 19.642 82.5362 19.5597 82.2521 19.5028L81.1186 19.277C80.4794 19.1491 80.0036 18.9276 79.6911 18.6122C79.3814 18.2969 79.2266 17.8949 79.2266 17.4062C79.2266 16.9858 79.3402 16.6236 79.5675 16.3196C79.7976 16.0156 80.12 15.7812 80.5348 15.6165C80.9524 15.4517 81.4411 15.3693 82.0007 15.3693C82.8274 15.3693 83.478 15.544 83.9524 15.8935C84.4297 16.2429 84.7081 16.7187 84.7876 17.321ZM90.2773 19.2131V15.4545H92.0927V22H90.3498V20.8111H90.2816C90.1339 21.1946 89.8881 21.5028 89.5444 21.7358C89.2035 21.9687 88.7873 22.0852 88.2958 22.0852C87.8583 22.0852 87.4734 21.9858 87.141 21.7869C86.8086 21.5881 86.5487 21.3054 86.3612 20.9389C86.1765 20.5724 86.0827 20.1335 86.0799 19.6222V15.4545H87.8952V19.2983C87.8981 19.6847 88.0018 19.9901 88.2063 20.2145C88.4109 20.4389 88.685 20.5511 89.0288 20.5511C89.2475 20.5511 89.4521 20.5014 89.6424 20.402C89.8327 20.2997 89.9862 20.1491 90.1026 19.9503C90.2219 19.7514 90.2802 19.5057 90.2773 19.2131ZM95.4112 22.1236C94.9936 22.1236 94.6214 22.0511 94.2947 21.9062C93.968 21.7585 93.7095 21.5412 93.5192 21.2543C93.3317 20.9645 93.2379 20.6037 93.2379 20.1719C93.2379 19.8082 93.3047 19.5028 93.4382 19.2557C93.5717 19.0085 93.7536 18.8097 93.9837 18.6591C94.2138 18.5085 94.4751 18.3949 94.7678 18.3182C95.0632 18.2415 95.3729 18.1875 95.6967 18.1562C96.0774 18.1165 96.3842 18.0795 96.6172 18.0455C96.8501 18.0085 97.0192 17.9545 97.1243 17.8835C97.2294 17.8125 97.282 17.7074 97.282 17.5682V17.5426C97.282 17.2727 97.1967 17.0639 97.0263 16.9162C96.8587 16.7685 96.62 16.6946 96.3104 16.6946C95.9837 16.6946 95.7237 16.767 95.5305 16.9119C95.3374 17.054 95.2095 17.233 95.147 17.4489L93.468 17.3125C93.5533 16.9148 93.7209 16.571 93.9709 16.2812C94.2209 15.9886 94.5433 15.7642 94.9382 15.608C95.3359 15.4489 95.7962 15.3693 96.3189 15.3693C96.6825 15.3693 97.0305 15.4119 97.3629 15.4972C97.6982 15.5824 97.995 15.7145 98.2536 15.8935C98.5149 16.0724 98.7209 16.3026 98.8714 16.5838C99.022 16.8622 99.0973 17.196 99.0973 17.5852V22H97.3757V21.0923H97.3246C97.2195 21.2969 97.0788 21.4773 96.9027 21.6335C96.7266 21.7869 96.5149 21.9077 96.2678 21.9957C96.0206 22.081 95.7351 22.1236 95.4112 22.1236ZM95.9311 20.8707C96.1982 20.8707 96.4339 20.8182 96.6385 20.7131C96.843 20.6051 97.0036 20.4602 97.12 20.2784C97.2365 20.0966 97.2947 19.8906 97.2947 19.6605V18.9659C97.2379 19.0028 97.1598 19.0369 97.0604 19.0682C96.9638 19.0966 96.8544 19.1236 96.7322 19.1491C96.6101 19.1719 96.4879 19.1932 96.3658 19.2131C96.2436 19.2301 96.1328 19.2457 96.0334 19.2599C95.8203 19.2912 95.6342 19.3409 95.4751 19.4091C95.3161 19.4773 95.1925 19.5696 95.1044 19.6861C95.0163 19.7997 94.9723 19.9418 94.9723 20.1122C94.9723 20.3594 95.0618 20.5483 95.2408 20.679C95.4226 20.8068 95.6527 20.8707 95.9311 20.8707ZM102.321 13.2727V22H100.506V13.2727H102.321Z" fill="#101010" />
            <path d="M17.5 0.25H138.5C148.027 0.25 155.75 7.97309 155.75 17.5C155.75 27.0269 148.027 34.75 138.5 34.75H17.5C7.97309 34.75 0.25 27.0269 0.25 17.5C0.25 7.97309 7.97309 0.25 17.5 0.25Z" fill="none" stroke="#101010" strokeWidth="0.5" className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100" />
          </g>

          {/* Semestral */}
          <g
            role="button"
            tabIndex={0}
            aria-pressed={term === 6}
            className="group cursor-pointer outline-none"
            onClick={() => setTerm(6)}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setTerm(6)}
          >
            <path d="M266.5 0C276.165 0 284 7.83502 284 17.5C284 27.165 276.165 35 266.5 35H145.5C144.301 35 143.131 34.879 142 34.6494C149.988 33.0279 156 25.9663 156 17.5C156 9.03362 149.988 1.97102 142 0.349609C143.131 0.120064 144.301 0 145.5 0H266.5Z" fill="#878787" className="transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0" />
            <path className="transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0" d="M175.493 16.7827C175.459 16.4389 175.313 16.1719 175.054 15.9815C174.795 15.7912 174.445 15.696 174.001 15.696C173.7 15.696 173.446 15.7386 173.239 15.8239C173.031 15.9062 172.872 16.0213 172.761 16.169C172.653 16.3168 172.599 16.4844 172.599 16.6719C172.594 16.8281 172.626 16.9645 172.697 17.081C172.771 17.1974 172.872 17.2983 173 17.3835C173.128 17.4659 173.276 17.5384 173.443 17.6009C173.611 17.6605 173.79 17.7116 173.98 17.7543L174.764 17.9418C175.145 18.027 175.494 18.1406 175.812 18.2827C176.131 18.4247 176.406 18.5994 176.639 18.8068C176.872 19.0142 177.053 19.2585 177.18 19.5398C177.311 19.821 177.378 20.1435 177.381 20.5071C177.378 21.0412 177.241 21.5043 176.972 21.8963C176.705 22.2855 176.318 22.5881 175.812 22.804C175.31 23.017 174.703 23.1236 173.993 23.1236C173.288 23.1236 172.675 23.0156 172.152 22.7997C171.632 22.5838 171.226 22.2642 170.933 21.8409C170.643 21.4148 170.491 20.8878 170.477 20.2599H172.263C172.283 20.5526 172.366 20.7969 172.514 20.9929C172.665 21.1861 172.865 21.3324 173.115 21.4318C173.368 21.5284 173.653 21.5767 173.972 21.5767C174.284 21.5767 174.555 21.5312 174.786 21.4403C175.018 21.3494 175.199 21.223 175.327 21.0611C175.455 20.8991 175.518 20.7131 175.518 20.5028C175.518 20.3068 175.46 20.142 175.344 20.0085C175.23 19.875 175.063 19.7614 174.841 19.6676C174.622 19.5739 174.354 19.4886 174.036 19.4119L173.085 19.1733C172.349 18.9943 171.768 18.7145 171.342 18.3338C170.916 17.9531 170.705 17.4403 170.707 16.7955C170.705 16.267 170.845 15.8054 171.129 15.4105C171.416 15.0156 171.81 14.7074 172.31 14.4858C172.81 14.2642 173.378 14.1534 174.014 14.1534C174.662 14.1534 175.227 14.2642 175.71 14.4858C176.196 14.7074 176.574 15.0156 176.844 15.4105C177.114 15.8054 177.253 16.2628 177.261 16.7827H175.493ZM181.451 23.1278C180.777 23.1278 180.198 22.9915 179.712 22.7188C179.229 22.4432 178.857 22.054 178.596 21.5511C178.334 21.0455 178.204 20.4474 178.204 19.7571C178.204 19.0838 178.334 18.4929 178.596 17.9844C178.857 17.4759 179.225 17.0795 179.699 16.7955C180.177 16.5114 180.736 16.3693 181.378 16.3693C181.81 16.3693 182.212 16.4389 182.584 16.5781C182.959 16.7145 183.286 16.9205 183.564 17.196C183.846 17.4716 184.064 17.8182 184.221 18.2358C184.377 18.6506 184.455 19.1364 184.455 19.6932V20.1918H178.928V19.0668H182.746C182.746 18.8054 182.689 18.5739 182.576 18.3722C182.462 18.1705 182.304 18.0128 182.103 17.8991C181.904 17.7827 181.672 17.7244 181.408 17.7244C181.132 17.7244 180.888 17.7884 180.675 17.9162C180.465 18.0412 180.3 18.2102 180.181 18.4233C180.061 18.6335 180 18.8679 179.998 19.1264V20.196C179.998 20.5199 180.057 20.7997 180.177 21.0355C180.299 21.2713 180.471 21.4531 180.692 21.581C180.914 21.7088 181.177 21.7727 181.48 21.7727C181.682 21.7727 181.867 21.7443 182.034 21.6875C182.202 21.6307 182.346 21.5455 182.465 21.4318C182.584 21.3182 182.675 21.179 182.738 21.0142L184.417 21.125C184.331 21.5284 184.157 21.8807 183.892 22.1818C183.631 22.4801 183.293 22.7131 182.878 22.8807C182.466 23.0455 181.99 23.1278 181.451 23.1278ZM185.52 23V16.4545H187.25V17.6094H187.326C187.463 17.2259 187.69 16.9233 188.008 16.7017C188.326 16.4801 188.707 16.3693 189.15 16.3693C189.599 16.3693 189.981 16.4815 190.297 16.706C190.612 16.9276 190.822 17.2287 190.927 17.6094H190.995C191.129 17.2344 191.37 16.9347 191.72 16.7102C192.072 16.483 192.488 16.3693 192.968 16.3693C193.579 16.3693 194.075 16.5639 194.456 16.9531C194.839 17.3395 195.031 17.8878 195.031 18.598V23H193.22V18.956C193.22 18.5923 193.123 18.3196 192.93 18.1378C192.737 17.956 192.495 17.8651 192.206 17.8651C191.876 17.8651 191.619 17.9702 191.434 18.1804C191.25 18.3878 191.157 18.6619 191.157 19.0028V23H189.397V18.9176C189.397 18.5966 189.305 18.3409 189.12 18.1506C188.939 17.9602 188.699 17.8651 188.4 17.8651C188.199 17.8651 188.017 17.9162 187.855 18.0185C187.696 18.1179 187.569 18.2585 187.476 18.4403C187.382 18.6193 187.335 18.8295 187.335 19.071V23H185.52ZM199.328 23.1278C198.655 23.1278 198.075 22.9915 197.589 22.7188C197.106 22.4432 196.734 22.054 196.473 21.5511C196.211 21.0455 196.081 20.4474 196.081 19.7571C196.081 19.0838 196.211 18.4929 196.473 17.9844C196.734 17.4759 197.102 17.0795 197.576 16.7955C198.054 16.5114 198.613 16.3693 199.255 16.3693C199.687 16.3693 200.089 16.4389 200.461 16.5781C200.836 16.7145 201.163 16.9205 201.441 17.196C201.723 17.4716 201.941 17.8182 202.098 18.2358C202.254 18.6506 202.332 19.1364 202.332 19.6932V20.1918H196.805V19.0668H200.623C200.623 18.8054 200.566 18.5739 200.453 18.3722C200.339 18.1705 200.182 18.0128 199.98 17.8991C199.781 17.7827 199.549 17.7244 199.285 17.7244C199.01 17.7244 198.765 17.7884 198.552 17.9162C198.342 18.0412 198.177 18.2102 198.058 18.4233C197.939 18.6335 197.878 18.8679 197.875 19.1264V20.196C197.875 20.5199 197.934 20.7997 198.054 21.0355C198.176 21.2713 198.348 21.4531 198.569 21.581C198.791 21.7088 199.054 21.7727 199.358 21.7727C199.559 21.7727 199.744 21.7443 199.912 21.6875C200.079 21.6307 200.223 21.5455 200.342 21.4318C200.461 21.3182 200.552 21.179 200.615 21.0142L202.294 21.125C202.209 21.5284 202.034 21.8807 201.77 22.1818C201.508 22.4801 201.17 22.7131 200.755 22.8807C200.343 23.0455 199.868 23.1278 199.328 23.1278ZM208.843 18.321L207.181 18.4233C207.152 18.2812 207.091 18.1534 206.998 18.0398C206.904 17.9233 206.78 17.831 206.627 17.7628C206.476 17.6918 206.296 17.6562 206.086 17.6562C205.804 17.6562 205.567 17.7159 205.374 17.8352C205.181 17.9517 205.084 18.108 205.084 18.304C205.084 18.4602 205.147 18.5923 205.272 18.7003C205.397 18.8082 205.611 18.8949 205.915 18.9602L207.1 19.1989C207.736 19.3295 208.211 19.5398 208.523 19.8295C208.836 20.1193 208.992 20.5 208.992 20.9716C208.992 21.4006 208.866 21.777 208.613 22.1009C208.363 22.4247 208.019 22.6776 207.581 22.8594C207.147 23.0384 206.645 23.1278 206.077 23.1278C205.211 23.1278 204.52 22.9474 204.006 22.5866C203.495 22.223 203.195 21.7287 203.107 21.1037L204.893 21.0099C204.946 21.2741 205.077 21.4759 205.285 21.6151C205.492 21.7514 205.758 21.8196 206.081 21.8196C206.4 21.8196 206.655 21.7585 206.848 21.6364C207.045 21.5114 207.144 21.3509 207.147 21.1548C207.144 20.9901 207.074 20.8551 206.938 20.75C206.802 20.642 206.591 20.5597 206.307 20.5028L205.174 20.277C204.535 20.1491 204.059 19.9276 203.746 19.6122C203.437 19.2969 203.282 18.8949 203.282 18.4062C203.282 17.9858 203.395 17.6236 203.623 17.3196C203.853 17.0156 204.175 16.7812 204.59 16.6165C205.008 16.4517 205.496 16.3693 206.056 16.3693C206.883 16.3693 207.533 16.544 208.008 16.8935C208.485 17.2429 208.763 17.7187 208.843 18.321ZM213.497 16.4545V17.8182H209.555V16.4545H213.497ZM210.45 14.8864H212.265V20.9886C212.265 21.1562 212.291 21.2869 212.342 21.3807C212.393 21.4716 212.464 21.5355 212.555 21.5724C212.649 21.6094 212.757 21.6278 212.879 21.6278C212.964 21.6278 213.049 21.6207 213.134 21.6065C213.22 21.5895 213.285 21.5767 213.33 21.5682L213.616 22.919C213.525 22.9474 213.397 22.9801 213.232 23.017C213.068 23.0568 212.867 23.081 212.632 23.0895C212.194 23.1065 211.811 23.0483 211.481 22.9148C211.154 22.7812 210.9 22.5739 210.718 22.2926C210.536 22.0114 210.447 21.6562 210.45 21.2273V14.8864ZM214.559 23V16.4545H216.319V17.5966H216.387C216.507 17.1903 216.707 16.8835 216.988 16.6761C217.269 16.4659 217.593 16.3608 217.96 16.3608C218.051 16.3608 218.149 16.3665 218.254 16.3778C218.359 16.3892 218.451 16.4048 218.531 16.4247V18.0355C218.445 18.0099 218.328 17.9872 218.177 17.9673C218.026 17.9474 217.889 17.9375 217.764 17.9375C217.497 17.9375 217.258 17.9957 217.048 18.1122C216.84 18.2259 216.676 18.3849 216.553 18.5895C216.434 18.794 216.374 19.0298 216.374 19.2969V23H214.559ZM221.028 23.1236C220.611 23.1236 220.238 23.0511 219.912 22.9062C219.585 22.7585 219.327 22.5412 219.136 22.2543C218.949 21.9645 218.855 21.6037 218.855 21.1719C218.855 20.8082 218.922 20.5028 219.055 20.2557C219.189 20.0085 219.371 19.8097 219.601 19.6591C219.831 19.5085 220.092 19.3949 220.385 19.3182C220.68 19.2415 220.99 19.1875 221.314 19.1562C221.694 19.1165 222.001 19.0795 222.234 19.0455C222.467 19.0085 222.636 18.9545 222.741 18.8835C222.846 18.8125 222.899 18.7074 222.899 18.5682V18.5426C222.899 18.2727 222.814 18.0639 222.643 17.9162C222.476 17.7685 222.237 17.6946 221.927 17.6946C221.601 17.6946 221.341 17.767 221.148 17.9119C220.954 18.054 220.827 18.233 220.764 18.4489L219.085 18.3125C219.17 17.9148 219.338 17.571 219.588 17.2812C219.838 16.9886 220.16 16.7642 220.555 16.608C220.953 16.4489 221.413 16.3693 221.936 16.3693C222.3 16.3693 222.648 16.4119 222.98 16.4972C223.315 16.5824 223.612 16.7145 223.871 16.8935C224.132 17.0724 224.338 17.3026 224.488 17.5838C224.639 17.8622 224.714 18.196 224.714 18.5852V23H222.993V22.0923H222.942C222.836 22.2969 222.696 22.4773 222.52 22.6335C222.344 22.7869 222.132 22.9077 221.885 22.9957C221.638 23.081 221.352 23.1236 221.028 23.1236ZM221.548 21.8707C221.815 21.8707 222.051 21.8182 222.256 21.7131C222.46 21.6051 222.621 21.4602 222.737 21.2784C222.854 21.0966 222.912 20.8906 222.912 20.6605V19.9659C222.855 20.0028 222.777 20.0369 222.677 20.0682C222.581 20.0966 222.471 20.1236 222.349 20.1491C222.227 20.1719 222.105 20.1932 221.983 20.2131C221.861 20.2301 221.75 20.2457 221.65 20.2599C221.437 20.2912 221.251 20.3409 221.092 20.4091C220.933 20.4773 220.81 20.5696 220.721 20.6861C220.633 20.7997 220.589 20.9418 220.589 21.1122C220.589 21.3594 220.679 21.5483 220.858 21.679C221.04 21.8068 221.27 21.8707 221.548 21.8707ZM227.818 14.2727V23H226.003V14.2727H227.818ZM238.545 17.9162V19.3565H234.565V17.9162H238.545ZM243.752 14.2727V23H241.907V16.0241H241.855L239.857 17.277V15.6406L242.017 14.2727H243.752ZM249.128 23.1918C248.395 23.1889 247.764 23.0085 247.236 22.6506C246.71 22.2926 246.305 21.7741 246.021 21.0952C245.74 20.4162 245.601 19.5994 245.604 18.6449C245.604 17.6932 245.744 16.8821 246.026 16.2116C246.31 15.5412 246.715 15.0312 247.24 14.6818C247.768 14.3295 248.398 14.1534 249.128 14.1534C249.858 14.1534 250.486 14.3295 251.011 14.6818C251.54 15.0341 251.946 15.5455 252.23 16.2159C252.514 16.8835 252.655 17.6932 252.652 18.6449C252.652 19.6023 252.51 20.4205 252.226 21.0994C251.945 21.7784 251.541 22.2969 251.016 22.6548C250.49 23.0128 249.861 23.1918 249.128 23.1918ZM249.128 21.6619C249.628 21.6619 250.027 21.4105 250.325 20.9077C250.624 20.4048 250.771 19.6506 250.768 18.6449C250.768 17.983 250.7 17.4318 250.564 16.9915C250.43 16.5511 250.24 16.2202 249.993 15.9986C249.749 15.777 249.46 15.6662 249.128 15.6662C248.631 15.6662 248.233 15.9148 247.935 16.4119C247.636 16.9091 247.486 17.6534 247.483 18.6449C247.483 19.3153 247.55 19.875 247.683 20.3239C247.82 20.7699 248.011 21.1051 248.259 21.3295C248.506 21.5511 248.795 21.6619 249.128 21.6619ZM258.625 21.3636V20.9034C258.625 20.554 258.699 20.233 258.846 19.9403C258.997 19.6449 259.214 19.4091 259.498 19.233C259.785 19.054 260.135 18.9645 260.547 18.9645C260.964 18.9645 261.315 19.0526 261.599 19.2287C261.886 19.4048 262.102 19.6406 262.247 19.9361C262.395 20.2287 262.468 20.5511 262.468 20.9034V21.3636C262.468 21.7131 262.395 22.0355 262.247 22.331C262.099 22.6236 261.882 22.858 261.595 23.0341C261.308 23.2131 260.958 23.3026 260.547 23.3026C260.129 23.3026 259.778 23.2131 259.494 23.0341C259.21 22.858 258.994 22.6236 258.846 22.331C258.699 22.0355 258.625 21.7131 258.625 21.3636ZM259.865 20.9034V21.3636C259.865 21.5653 259.913 21.7557 260.01 21.9347C260.109 22.1136 260.288 22.2031 260.547 22.2031C260.805 22.2031 260.981 22.1151 261.075 21.9389C261.172 21.7628 261.22 21.571 261.22 21.3636V20.9034C261.22 20.696 261.174 20.5028 261.083 20.3239C260.993 20.1449 260.814 20.0554 260.547 20.0554C260.291 20.0554 260.113 20.1449 260.014 20.3239C259.914 20.5028 259.865 20.696 259.865 20.9034ZM254.146 16.3693V15.9091C254.146 15.5568 254.221 15.2344 254.372 14.9418C254.522 14.6463 254.74 14.4105 255.024 14.2344C255.311 14.0582 255.657 13.9702 256.064 13.9702C256.484 13.9702 256.836 14.0582 257.12 14.2344C257.405 14.4105 257.62 14.6463 257.768 14.9418C257.916 15.2344 257.99 15.5568 257.99 15.9091V16.3693C257.99 16.7216 257.914 17.044 257.764 17.3366C257.616 17.6293 257.399 17.8636 257.112 18.0398C256.828 18.2131 256.478 18.2997 256.064 18.2997C255.649 18.2997 255.298 18.2116 255.011 18.0355C254.727 17.8565 254.511 17.6222 254.363 17.3324C254.218 17.0398 254.146 16.7187 254.146 16.3693ZM255.395 15.9091V16.3693C255.395 16.5767 255.443 16.7685 255.539 16.9446C255.639 17.1207 255.814 17.2088 256.064 17.2088C256.325 17.2088 256.503 17.1207 256.596 16.9446C256.693 16.7685 256.741 16.5767 256.741 16.3693V15.9091C256.741 15.7017 256.696 15.5085 256.605 15.3295C256.514 15.1506 256.333 15.0611 256.064 15.0611C255.811 15.0611 255.636 15.152 255.539 15.3338C255.443 15.5156 255.395 15.7074 255.395 15.9091ZM254.708 23L260.708 14.2727H261.825L255.825 23H254.708Z" fill="white" />
            <mask id="planselector-outline-semestral" fill="white">
              <path d="M266.5 0C276.165 0 284 7.83502 284 17.5C284 27.165 276.165 35 266.5 35H145.5C144.301 35 143.131 34.879 142 34.6494C149.988 33.0279 156 25.9663 156 17.5C156 9.03362 149.988 1.97102 142 0.349609C143.131 0.120064 144.301 0 145.5 0H266.5Z" />
            </mask>
            <path
              d="M284 17.5H284.5V17.5H284ZM266.5 35V35.5V35.5V35ZM142 34.6494L141.901 34.1594L141.901 35.1394L142 34.6494ZM156 17.5H156.5V17.5H156ZM142 0.349609L141.901 -0.140398L141.901 0.839617L142 0.349609ZM266.5 0V0.5C275.889 0.5 283.5 8.11116 283.5 17.5H284H284.5C284.5 7.55887 276.441 -0.5 266.5 -0.5V0ZM284 17.5H283.5C283.5 26.8888 275.889 34.5 266.5 34.5V35V35.5C276.441 35.5 284.5 27.4411 284.5 17.5H284ZM266.5 35V34.5H145.5V35V35.5H266.5V35ZM145.5 35V34.5C144.335 34.5 143.198 34.3824 142.099 34.1594L142 34.6494L141.901 35.1394C143.064 35.3756 144.268 35.5 145.5 35.5V35ZM142 34.6494L142.099 35.1394C150.316 33.4716 156.5 26.2088 156.5 17.5H156H155.5C155.5 25.7238 149.66 32.5843 141.901 34.1594L142 34.6494ZM156 17.5H156.5C156.5 8.79116 150.316 1.52739 142.099 -0.140398L142 0.349609L141.901 0.839617C149.66 2.41465 155.5 9.27607 155.5 17.5H156ZM142 0.349609L142.099 0.839617C143.198 0.616704 144.335 0.5 145.5 0.5V0V-0.5C144.268 -0.5 143.064 -0.376576 141.901 -0.140398L142 0.349609ZM145.5 0V0.5H266.5V0V-0.5H145.5V0Z"
              fill="#101010"
              mask="url(#planselector-outline-semestral)"
              className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
            />
            <path
              className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
              fill="#101010"
              d="M175.493 16.7827C175.459 16.4389 175.313 16.1719 175.054 15.9815C174.795 15.7912 174.445 15.696 174.001 15.696C173.7 15.696 173.446 15.7386 173.239 15.8239C173.031 15.9062 172.872 16.0213 172.761 16.169C172.653 16.3168 172.599 16.4844 172.599 16.6719C172.594 16.8281 172.626 16.9645 172.697 17.081C172.771 17.1974 172.872 17.2983 173 17.3835C173.128 17.4659 173.276 17.5384 173.443 17.6009C173.611 17.6605 173.79 17.7116 173.98 17.7543L174.764 17.9418C175.145 18.027 175.494 18.1406 175.812 18.2827C176.131 18.4247 176.406 18.5994 176.639 18.8068C176.872 19.0142 177.053 19.2585 177.18 19.5398C177.311 19.821 177.378 20.1435 177.381 20.5071C177.378 21.0412 177.241 21.5043 176.972 21.8963C176.705 22.2855 176.318 22.5881 175.812 22.804C175.31 23.017 174.703 23.1236 173.993 23.1236C173.288 23.1236 172.675 23.0156 172.152 22.7997C171.632 22.5838 171.226 22.2642 170.933 21.8409C170.643 21.4148 170.491 20.8878 170.477 20.2599H172.263C172.283 20.5526 172.366 20.7969 172.514 20.9929C172.665 21.1861 172.865 21.3324 173.115 21.4318C173.368 21.5284 173.653 21.5767 173.972 21.5767C174.284 21.5767 174.555 21.5312 174.786 21.4403C175.018 21.3494 175.199 21.223 175.327 21.0611C175.455 20.8991 175.518 20.7131 175.518 20.5028C175.518 20.3068 175.46 20.142 175.344 20.0085C175.23 19.875 175.063 19.7614 174.841 19.6676C174.622 19.5739 174.354 19.4886 174.036 19.4119L173.085 19.1733C172.349 18.9943 171.768 18.7145 171.342 18.3338C170.916 17.9531 170.705 17.4403 170.707 16.7955C170.705 16.267 170.845 15.8054 171.129 15.4105C171.416 15.0156 171.81 14.7074 172.31 14.4858C172.81 14.2642 173.378 14.1534 174.014 14.1534C174.662 14.1534 175.227 14.2642 175.71 14.4858C176.196 14.7074 176.574 15.0156 176.844 15.4105C177.114 15.8054 177.253 16.2628 177.261 16.7827H175.493ZM181.451 23.1278C180.777 23.1278 180.198 22.9915 179.712 22.7188C179.229 22.4432 178.857 22.054 178.596 21.5511C178.334 21.0455 178.204 20.4474 178.204 19.7571C178.204 19.0838 178.334 18.4929 178.596 17.9844C178.857 17.4759 179.225 17.0795 179.699 16.7955C180.177 16.5114 180.736 16.3693 181.378 16.3693C181.81 16.3693 182.212 16.4389 182.584 16.5781C182.959 16.7145 183.286 16.9205 183.564 17.196C183.846 17.4716 184.064 17.8182 184.221 18.2358C184.377 18.6506 184.455 19.1364 184.455 19.6932V20.1918H178.928V19.0668H182.746C182.746 18.8054 182.689 18.5739 182.576 18.3722C182.462 18.1705 182.304 18.0128 182.103 17.8991C181.904 17.7827 181.672 17.7244 181.408 17.7244C181.132 17.7244 180.888 17.7884 180.675 17.9162C180.465 18.0412 180.3 18.2102 180.181 18.4233C180.061 18.6335 180 18.8679 179.998 19.1264V20.196C179.998 20.5199 180.057 20.7997 180.177 21.0355C180.299 21.2713 180.471 21.4531 180.692 21.581C180.914 21.7088 181.177 21.7727 181.48 21.7727C181.682 21.7727 181.867 21.7443 182.034 21.6875C182.202 21.6307 182.346 21.5455 182.465 21.4318C182.584 21.3182 182.675 21.179 182.738 21.0142L184.417 21.125C184.331 21.5284 184.157 21.8807 183.892 22.1818C183.631 22.4801 183.293 22.7131 182.878 22.8807C182.466 23.0455 181.99 23.1278 181.451 23.1278ZM185.52 23V16.4545H187.25V17.6094H187.326C187.463 17.2259 187.69 16.9233 188.008 16.7017C188.326 16.4801 188.707 16.3693 189.15 16.3693C189.599 16.3693 189.981 16.4815 190.297 16.706C190.612 16.9276 190.822 17.2287 190.927 17.6094H190.995C191.129 17.2344 191.37 16.9347 191.72 16.7102C192.072 16.483 192.488 16.3693 192.968 16.3693C193.579 16.3693 194.075 16.5639 194.456 16.9531C194.839 17.3395 195.031 17.8878 195.031 18.598V23H193.22V18.956C193.22 18.5923 193.123 18.3196 192.93 18.1378C192.737 17.956 192.495 17.8651 192.206 17.8651C191.876 17.8651 191.619 17.9702 191.434 18.1804C191.25 18.3878 191.157 18.6619 191.157 19.0028V23H189.397V18.9176C189.397 18.5966 189.305 18.3409 189.12 18.1506C188.939 17.9602 188.699 17.8651 188.4 17.8651C188.199 17.8651 188.017 17.9162 187.855 18.0185C187.696 18.1179 187.569 18.2585 187.476 18.4403C187.382 18.6193 187.335 18.8295 187.335 19.071V23H185.52ZM199.328 23.1278C198.655 23.1278 198.075 22.9915 197.589 22.7188C197.106 22.4432 196.734 22.054 196.473 21.5511C196.211 21.0455 196.081 20.4474 196.081 19.7571C196.081 19.0838 196.211 18.4929 196.473 17.9844C196.734 17.4759 197.102 17.0795 197.576 16.7955C198.054 16.5114 198.613 16.3693 199.255 16.3693C199.687 16.3693 200.089 16.4389 200.461 16.5781C200.836 16.7145 201.163 16.9205 201.441 17.196C201.723 17.4716 201.941 17.8182 202.098 18.2358C202.254 18.6506 202.332 19.1364 202.332 19.6932V20.1918H196.805V19.0668H200.623C200.623 18.8054 200.566 18.5739 200.453 18.3722C200.339 18.1705 200.182 18.0128 199.98 17.8991C199.781 17.7827 199.549 17.7244 199.285 17.7244C199.01 17.7244 198.765 17.7884 198.552 17.9162C198.342 18.0412 198.177 18.2102 198.058 18.4233C197.939 18.6335 197.878 18.8679 197.875 19.1264V20.196C197.875 20.5199 197.934 20.7997 198.054 21.0355C198.176 21.2713 198.348 21.4531 198.569 21.581C198.791 21.7088 199.054 21.7727 199.358 21.7727C199.559 21.7727 199.744 21.7443 199.912 21.6875C200.079 21.6307 200.223 21.5455 200.342 21.4318C200.461 21.3182 200.552 21.179 200.615 21.0142L202.294 21.125C202.209 21.5284 202.034 21.8807 201.77 22.1818C201.508 22.4801 201.17 22.7131 200.755 22.8807C200.343 23.0455 199.868 23.1278 199.328 23.1278ZM208.843 18.321L207.181 18.4233C207.152 18.2812 207.091 18.1534 206.998 18.0398C206.904 17.9233 206.78 17.831 206.627 17.7628C206.476 17.6918 206.296 17.6562 206.086 17.6562C205.804 17.6562 205.567 17.7159 205.374 17.8352C205.181 17.9517 205.084 18.108 205.084 18.304C205.084 18.4602 205.147 18.5923 205.272 18.7003C205.397 18.8082 205.611 18.8949 205.915 18.9602L207.1 19.1989C207.736 19.3295 208.211 19.5398 208.523 19.8295C208.836 20.1193 208.992 20.5 208.992 20.9716C208.992 21.4006 208.866 21.777 208.613 22.1009C208.363 22.4247 208.019 22.6776 207.581 22.8594C207.147 23.0384 206.645 23.1278 206.077 23.1278C205.211 23.1278 204.52 22.9474 204.006 22.5866C203.495 22.223 203.195 21.7287 203.107 21.1037L204.893 21.0099C204.946 21.2741 205.077 21.4759 205.285 21.6151C205.492 21.7514 205.758 21.8196 206.081 21.8196C206.4 21.8196 206.655 21.7585 206.848 21.6364C207.045 21.5114 207.144 21.3509 207.147 21.1548C207.144 20.9901 207.074 20.8551 206.938 20.75C206.802 20.642 206.591 20.5597 206.307 20.5028L205.174 20.277C204.535 20.1491 204.059 19.9276 203.746 19.6122C203.437 19.2969 203.282 18.8949 203.282 18.4062C203.282 17.9858 203.395 17.6236 203.623 17.3196C203.853 17.0156 204.175 16.7812 204.59 16.6165C205.008 16.4517 205.496 16.3693 206.056 16.3693C206.883 16.3693 207.533 16.544 208.008 16.8935C208.485 17.2429 208.763 17.7187 208.843 18.321ZM213.497 16.4545V17.8182H209.555V16.4545H213.497ZM210.45 14.8864H212.265V20.9886C212.265 21.1562 212.291 21.2869 212.342 21.3807C212.393 21.4716 212.464 21.5355 212.555 21.5724C212.649 21.6094 212.757 21.6278 212.879 21.6278C212.964 21.6278 213.049 21.6207 213.134 21.6065C213.22 21.5895 213.285 21.5767 213.33 21.5682L213.616 22.919C213.525 22.9474 213.397 22.9801 213.232 23.017C213.068 23.0568 212.867 23.081 212.632 23.0895C212.194 23.1065 211.811 23.0483 211.481 22.9148C211.154 22.7812 210.9 22.5739 210.718 22.2926C210.536 22.0114 210.447 21.6562 210.45 21.2273V14.8864ZM214.559 23V16.4545H216.319V17.5966H216.387C216.507 17.1903 216.707 16.8835 216.988 16.6761C217.269 16.4659 217.593 16.3608 217.96 16.3608C218.051 16.3608 218.149 16.3665 218.254 16.3778C218.359 16.3892 218.451 16.4048 218.531 16.4247V18.0355C218.445 18.0099 218.328 17.9872 218.177 17.9673C218.026 17.9474 217.889 17.9375 217.764 17.9375C217.497 17.9375 217.258 17.9957 217.048 18.1122C216.84 18.2259 216.676 18.3849 216.553 18.5895C216.434 18.794 216.374 19.0298 216.374 19.2969V23H214.559ZM221.028 23.1236C220.611 23.1236 220.238 23.0511 219.912 22.9062C219.585 22.7585 219.327 22.5412 219.136 22.2543C218.949 21.9645 218.855 21.6037 218.855 21.1719C218.855 20.8082 218.922 20.5028 219.055 20.2557C219.189 20.0085 219.371 19.8097 219.601 19.6591C219.831 19.5085 220.092 19.3949 220.385 19.3182C220.68 19.2415 220.99 19.1875 221.314 19.1562C221.694 19.1165 222.001 19.0795 222.234 19.0455C222.467 19.0085 222.636 18.9545 222.741 18.8835C222.846 18.8125 222.899 18.7074 222.899 18.5682V18.5426C222.899 18.2727 222.814 18.0639 222.643 17.9162C222.476 17.7685 222.237 17.6946 221.927 17.6946C221.601 17.6946 221.341 17.767 221.148 17.9119C220.954 18.054 220.827 18.233 220.764 18.4489L219.085 18.3125C219.17 17.9148 219.338 17.571 219.588 17.2812C219.838 16.9886 220.16 16.7642 220.555 16.608C220.953 16.4489 221.413 16.3693 221.936 16.3693C222.3 16.3693 222.648 16.4119 222.98 16.4972C223.315 16.5824 223.612 16.7145 223.871 16.8935C224.132 17.0724 224.338 17.3026 224.488 17.5838C224.639 17.8622 224.714 18.196 224.714 18.5852V23H222.993V22.0923H222.942C222.836 22.2969 222.696 22.4773 222.52 22.6335C222.344 22.7869 222.132 22.9077 221.885 22.9957C221.638 23.081 221.352 23.1236 221.028 23.1236ZM221.548 21.8707C221.815 21.8707 222.051 21.8182 222.256 21.7131C222.46 21.6051 222.621 21.4602 222.737 21.2784C222.854 21.0966 222.912 20.8906 222.912 20.6605V19.9659C222.855 20.0028 222.777 20.0369 222.677 20.0682C222.581 20.0966 222.471 20.1236 222.349 20.1491C222.227 20.1719 222.105 20.1932 221.983 20.2131C221.861 20.2301 221.75 20.2457 221.65 20.2599C221.437 20.2912 221.251 20.3409 221.092 20.4091C220.933 20.4773 220.81 20.5696 220.721 20.6861C220.633 20.7997 220.589 20.9418 220.589 21.1122C220.589 21.3594 220.679 21.5483 220.858 21.679C221.04 21.8068 221.27 21.8707 221.548 21.8707ZM227.818 14.2727V23H226.003V14.2727H227.818ZM238.545 17.9162V19.3565H234.565V17.9162H238.545ZM243.752 14.2727V23H241.907V16.0241H241.855L239.857 17.277V15.6406L242.017 14.2727H243.752ZM249.128 23.1918C248.395 23.1889 247.764 23.0085 247.236 22.6506C246.71 22.2926 246.305 21.7741 246.021 21.0952C245.74 20.4162 245.601 19.5994 245.604 18.6449C245.604 17.6932 245.744 16.8821 246.026 16.2116C246.31 15.5412 246.715 15.0312 247.24 14.6818C247.768 14.3295 248.398 14.1534 249.128 14.1534C249.858 14.1534 250.486 14.3295 251.011 14.6818C251.54 15.0341 251.946 15.5455 252.23 16.2159C252.514 16.8835 252.655 17.6932 252.652 18.6449C252.652 19.6023 252.51 20.4205 252.226 21.0994C251.945 21.7784 251.541 22.2969 251.016 22.6548C250.49 23.0128 249.861 23.1918 249.128 23.1918ZM249.128 21.6619C249.628 21.6619 250.027 21.4105 250.325 20.9077C250.624 20.4048 250.771 19.6506 250.768 18.6449C250.768 17.983 250.7 17.4318 250.564 16.9915C250.43 16.5511 250.24 16.2202 249.993 15.9986C249.749 15.777 249.46 15.6662 249.128 15.6662C248.631 15.6662 248.233 15.9148 247.935 16.4119C247.636 16.9091 247.486 17.6534 247.483 18.6449C247.483 19.3153 247.55 19.875 247.683 20.3239C247.82 20.7699 248.011 21.1051 248.259 21.3295C248.506 21.5511 248.795 21.6619 249.128 21.6619ZM258.625 21.3636V20.9034C258.625 20.554 258.699 20.233 258.846 19.9403C258.997 19.6449 259.214 19.4091 259.498 19.233C259.785 19.054 260.135 18.9645 260.547 18.9645C260.964 18.9645 261.315 19.0526 261.599 19.2287C261.886 19.4048 262.102 19.6406 262.247 19.9361C262.395 20.2287 262.468 20.5511 262.468 20.9034V21.3636C262.468 21.7131 262.395 22.0355 262.247 22.331C262.099 22.6236 261.882 22.858 261.595 23.0341C261.308 23.2131 260.958 23.3026 260.547 23.3026C260.129 23.3026 259.778 23.2131 259.494 23.0341C259.21 22.858 258.994 22.6236 258.846 22.331C258.699 22.0355 258.625 21.7131 258.625 21.3636ZM259.865 20.9034V21.3636C259.865 21.5653 259.913 21.7557 260.01 21.9347C260.109 22.1136 260.288 22.2031 260.547 22.2031C260.805 22.2031 260.981 22.1151 261.075 21.9389C261.172 21.7628 261.22 21.571 261.22 21.3636V20.9034C261.22 20.696 261.174 20.5028 261.083 20.3239C260.993 20.1449 260.814 20.0554 260.547 20.0554C260.291 20.0554 260.113 20.1449 260.014 20.3239C259.914 20.5028 259.865 20.696 259.865 20.9034ZM254.146 16.3693V15.9091C254.146 15.5568 254.221 15.2344 254.372 14.9418C254.522 14.6463 254.74 14.4105 255.024 14.2344C255.311 14.0582 255.657 13.9702 256.064 13.9702C256.484 13.9702 256.836 14.0582 257.12 14.2344C257.405 14.4105 257.62 14.6463 257.768 14.9418C257.916 15.2344 257.99 15.5568 257.99 15.9091V16.3693C257.99 16.7216 257.914 17.044 257.764 17.3366C257.616 17.6293 257.399 17.8636 257.112 18.0398C256.828 18.2131 256.478 18.2997 256.064 18.2997C255.649 18.2997 255.298 18.2116 255.011 18.0355C254.727 17.8565 254.511 17.6222 254.363 17.3324C254.218 17.0398 254.146 16.7187 254.146 16.3693ZM255.395 15.9091V16.3693C255.395 16.5767 255.443 16.7685 255.539 16.9446C255.639 17.1207 255.814 17.2088 256.064 17.2088C256.325 17.2088 256.503 17.1207 256.596 16.9446C256.693 16.7685 256.741 16.5767 256.741 16.3693V15.9091C256.741 15.7017 256.696 15.5085 256.605 15.3295C256.514 15.1506 256.333 15.0611 256.064 15.0611C255.811 15.0611 255.636 15.152 255.539 15.3338C255.443 15.5156 255.395 15.7074 255.395 15.9091ZM254.708 23L260.708 14.2727H261.825L255.825 23H254.708Z"
            />
          </g>

          {/* Anual */}
          <g
            role="button"
            tabIndex={0}
            aria-pressed={term === 12}
            className="group cursor-pointer outline-none"
            onClick={() => setTerm(12)}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setTerm(12)}
          >
            <path d="M394.5 0C404.165 0 412 7.83502 412 17.5C412 27.165 404.165 35 394.5 35H273.5C272.301 35 271.131 34.879 270 34.6494C277.988 33.0279 284 25.9663 284 17.5C284 9.03362 277.988 1.97102 270 0.349609C271.131 0.120064 272.301 0 273.5 0H394.5Z" fill="#101010" className="transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0" />
            <path className="transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0" d="M305.263 22H303.286L306.298 13.2727H308.676L311.685 22H309.707L307.521 15.267H307.453L305.263 22ZM305.139 18.5696H309.81V20.0099H305.139V18.5696ZM314.516 18.2159V22H312.701V15.4545H314.431V16.6094H314.508C314.653 16.2287 314.896 15.9276 315.237 15.706C315.577 15.4815 315.991 15.3693 316.477 15.3693C316.931 15.3693 317.327 15.4688 317.665 15.6676C318.004 15.8665 318.266 16.1506 318.454 16.5199C318.641 16.8864 318.735 17.3239 318.735 17.8324V22H316.92V18.1562C316.923 17.7557 316.82 17.4432 316.613 17.2188C316.406 16.9915 316.12 16.8778 315.756 16.8778C315.512 16.8778 315.296 16.9304 315.109 17.0355C314.924 17.1406 314.779 17.294 314.674 17.4957C314.572 17.6946 314.519 17.9347 314.516 18.2159ZM324.363 19.2131V15.4545H326.179V22H324.436V20.8111H324.368C324.22 21.1946 323.974 21.5028 323.63 21.7358C323.289 21.9687 322.873 22.0852 322.382 22.0852C321.944 22.0852 321.559 21.9858 321.227 21.7869C320.895 21.5881 320.635 21.3054 320.447 20.9389C320.262 20.5724 320.169 20.1335 320.166 19.6222V15.4545H321.981V19.2983C321.984 19.6847 322.088 19.9901 322.292 20.2145C322.497 20.4389 322.771 20.5511 323.115 20.5511C323.333 20.5511 323.538 20.5014 323.728 20.402C323.919 20.2997 324.072 20.1491 324.189 19.9503C324.308 19.7514 324.366 19.5057 324.363 19.2131ZM329.497 22.1236C329.08 22.1236 328.707 22.0511 328.381 21.9062C328.054 21.7585 327.795 21.5412 327.605 21.2543C327.418 20.9645 327.324 20.6037 327.324 20.1719C327.324 19.8082 327.391 19.5028 327.524 19.2557C327.658 19.0085 327.839 18.8097 328.07 18.6591C328.3 18.5085 328.561 18.3949 328.854 18.3182C329.149 18.2415 329.459 18.1875 329.783 18.1562C330.163 18.1165 330.47 18.0795 330.703 18.0455C330.936 18.0085 331.105 17.9545 331.21 17.8835C331.315 17.8125 331.368 17.7074 331.368 17.5682V17.5426C331.368 17.2727 331.283 17.0639 331.112 16.9162C330.945 16.7685 330.706 16.6946 330.396 16.6946C330.07 16.6946 329.81 16.767 329.616 16.9119C329.423 17.054 329.295 17.233 329.233 17.4489L327.554 17.3125C327.639 16.9148 327.807 16.571 328.057 16.2812C328.307 15.9886 328.629 15.7642 329.024 15.608C329.422 15.4489 329.882 15.3693 330.405 15.3693C330.768 15.3693 331.116 15.4119 331.449 15.4972C331.784 15.5824 332.081 15.7145 332.339 15.8935C332.601 16.0724 332.807 16.3026 332.957 16.5838C333.108 16.8622 333.183 17.196 333.183 17.5852V22H331.462V21.0923H331.411C331.305 21.2969 331.165 21.4773 330.989 21.6335C330.812 21.7869 330.601 21.9077 330.354 21.9957C330.107 22.081 329.821 22.1236 329.497 22.1236ZM330.017 20.8707C330.284 20.8707 330.52 20.8182 330.724 20.7131C330.929 20.6051 331.089 20.4602 331.206 20.2784C331.322 20.0966 331.381 19.8906 331.381 19.6605V18.9659C331.324 19.0028 331.246 19.0369 331.146 19.0682C331.05 19.0966 330.94 19.1236 330.818 19.1491C330.696 19.1719 330.574 19.1932 330.452 19.2131C330.33 19.2301 330.219 19.2457 330.119 19.2599C329.906 19.2912 329.72 19.3409 329.561 19.4091C329.402 19.4773 329.278 19.5696 329.19 19.6861C329.102 19.7997 329.058 19.9418 329.058 20.1122C329.058 20.3594 329.148 20.5483 329.327 20.679C329.509 20.8068 329.739 20.8707 330.017 20.8707ZM336.407 13.2727V22H334.592V13.2727H336.407ZM347.494 16.9162V18.3565H343.514V16.9162H347.494ZM348.778 22V20.6705L351.884 17.794C352.148 17.5384 352.37 17.3082 352.549 17.1037C352.731 16.8991 352.869 16.6989 352.962 16.5028C353.056 16.304 353.103 16.0895 353.103 15.8594C353.103 15.6037 353.045 15.3835 352.928 15.1989C352.812 15.0114 352.653 14.8679 352.451 14.7685C352.249 14.6662 352.021 14.6151 351.765 14.6151C351.498 14.6151 351.265 14.669 351.066 14.777C350.867 14.8849 350.714 15.0398 350.606 15.2415C350.498 15.4432 350.444 15.6832 350.444 15.9616H348.692C348.692 15.3906 348.822 14.8949 349.08 14.4744C349.339 14.054 349.701 13.7287 350.167 13.4986C350.633 13.2685 351.17 13.1534 351.778 13.1534C352.403 13.1534 352.947 13.2642 353.41 13.4858C353.876 13.7045 354.238 14.0085 354.496 14.3977C354.755 14.7869 354.884 15.233 354.884 15.7358C354.884 16.0653 354.819 16.3906 354.688 16.7116C354.56 17.0327 354.332 17.3892 354.002 17.7812C353.673 18.1705 353.208 18.6378 352.609 19.1832L351.335 20.4318V20.4915H354.999V22H348.778ZM359.758 22.1918C359.025 22.1889 358.395 22.0085 357.866 21.6506C357.341 21.2926 356.936 20.7741 356.652 20.0952C356.37 19.4162 356.231 18.5994 356.234 17.6449C356.234 16.6932 356.375 15.8821 356.656 15.2116C356.94 14.5412 357.345 14.0312 357.87 13.6818C358.399 13.3295 359.028 13.1534 359.758 13.1534C360.488 13.1534 361.116 13.3295 361.642 13.6818C362.17 14.0341 362.576 14.5455 362.86 15.2159C363.145 15.8835 363.285 16.6932 363.282 17.6449C363.282 18.6023 363.14 19.4205 362.856 20.0994C362.575 20.7784 362.172 21.2969 361.646 21.6548C361.12 22.0128 360.491 22.1918 359.758 22.1918ZM359.758 20.6619C360.258 20.6619 360.657 20.4105 360.956 19.9077C361.254 19.4048 361.402 18.6506 361.399 17.6449C361.399 16.983 361.331 16.4318 361.194 15.9915C361.061 15.5511 360.87 15.2202 360.623 14.9986C360.379 14.777 360.091 14.6662 359.758 14.6662C359.261 14.6662 358.863 14.9148 358.565 15.4119C358.267 15.9091 358.116 16.6534 358.113 17.6449C358.113 18.3153 358.18 18.875 358.314 19.3239C358.45 19.7699 358.642 20.1051 358.889 20.3295C359.136 20.5511 359.426 20.6619 359.758 20.6619ZM369.375 20.3636V19.9034C369.375 19.554 369.449 19.233 369.597 18.9403C369.747 18.6449 369.964 18.4091 370.249 18.233C370.536 18.054 370.885 17.9645 371.297 17.9645C371.714 17.9645 372.065 18.0526 372.349 18.2287C372.636 18.4048 372.852 18.6406 372.997 18.9361C373.145 19.2287 373.219 19.5511 373.219 19.9034V20.3636C373.219 20.7131 373.145 21.0355 372.997 21.331C372.849 21.6236 372.632 21.858 372.345 22.0341C372.058 22.2131 371.709 22.3026 371.297 22.3026C370.879 22.3026 370.528 22.2131 370.244 22.0341C369.96 21.858 369.744 21.6236 369.597 21.331C369.449 21.0355 369.375 20.7131 369.375 20.3636ZM370.615 19.9034V20.3636C370.615 20.5653 370.663 20.7557 370.76 20.9347C370.859 21.1136 371.038 21.2031 371.297 21.2031C371.555 21.2031 371.732 21.1151 371.825 20.9389C371.922 20.7628 371.97 20.571 371.97 20.3636V19.9034C371.97 19.696 371.925 19.5028 371.834 19.3239C371.743 19.1449 371.564 19.0554 371.297 19.0554C371.041 19.0554 370.864 19.1449 370.764 19.3239C370.665 19.5028 370.615 19.696 370.615 19.9034ZM364.896 15.3693V14.9091C364.896 14.5568 364.972 14.2344 365.122 13.9418C365.273 13.6463 365.49 13.4105 365.774 13.2344C366.061 13.0582 366.408 12.9702 366.814 12.9702C367.234 12.9702 367.587 13.0582 367.871 13.2344C368.155 13.4105 368.371 13.6463 368.518 13.9418C368.666 14.2344 368.74 14.5568 368.74 14.9091V15.3693C368.74 15.7216 368.665 16.044 368.514 16.3366C368.366 16.6293 368.149 16.8636 367.862 17.0398C367.578 17.2131 367.229 17.2997 366.814 17.2997C366.399 17.2997 366.048 17.2116 365.761 17.0355C365.477 16.8565 365.261 16.6222 365.114 16.3324C364.969 16.0398 364.896 15.7187 364.896 15.3693ZM366.145 14.9091V15.3693C366.145 15.5767 366.193 15.7685 366.29 15.9446C366.389 16.1207 366.564 16.2088 366.814 16.2088C367.075 16.2088 367.253 16.1207 367.347 15.9446C367.443 15.7685 367.491 15.5767 367.491 15.3693V14.9091C367.491 14.7017 367.446 14.5085 367.355 14.3295C367.264 14.1506 367.084 14.0611 366.814 14.0611C366.561 14.0611 366.386 14.152 366.29 14.3338C366.193 14.5156 366.145 14.7074 366.145 14.9091ZM365.459 22L371.459 13.2727H372.575L366.575 22H365.459Z" fill="white" />
            <mask id="planselector-outline-anual" fill="white">
              <path d="M394.5 0C404.165 0 412 7.83502 412 17.5C412 27.165 404.165 35 394.5 35H273.5C272.301 35 271.131 34.879 270 34.6494C277.988 33.0279 284 25.9663 284 17.5C284 9.03362 277.988 1.97102 270 0.349609C271.131 0.120064 272.301 0 273.5 0H394.5Z" />
            </mask>
            <path
              d="M412 17.5H412.5V17.5H412ZM394.5 35V35.5V35.5V35ZM270 34.6494L269.901 34.1594L269.901 35.1394L270 34.6494ZM284 17.5H284.5V17.5H284ZM270 0.349609L269.901 -0.140398L269.901 0.839617L270 0.349609ZM394.5 0V0.5C403.889 0.5 411.5 8.11116 411.5 17.5H412H412.5C412.5 7.55887 404.441 -0.5 394.5 -0.5V0ZM412 17.5H411.5C411.5 26.8888 403.889 34.5 394.5 34.5V35V35.5C404.441 35.5 412.5 27.4411 412.5 17.5H412ZM394.5 35V34.5H273.5V35V35.5H394.5V35ZM273.5 35V34.5C272.335 34.5 271.198 34.3824 270.099 34.1594L270 34.6494L269.901 35.1394C271.064 35.3756 272.268 35.5 273.5 35.5V35ZM270 34.6494L270.099 35.1394C278.316 33.4716 284.5 26.2088 284.5 17.5H284H283.5C283.5 25.7238 277.66 32.5843 269.901 34.1594L270 34.6494ZM284 17.5H284.5C284.5 8.79116 278.316 1.52739 270.099 -0.140398L270 0.349609L269.901 0.839617C277.66 2.41465 283.5 9.27607 283.5 17.5H284ZM270 0.349609L270.099 0.839617C271.198 0.616704 272.335 0.5 273.5 0.5V0V-0.5C272.268 -0.5 271.064 -0.376576 269.901 -0.140398L270 0.349609ZM273.5 0V0.5H394.5V0V-0.5H273.5V0Z"
              fill="#101010"
              mask="url(#planselector-outline-anual)"
              className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
            />
            <path
              className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
              fill="#101010"
              d="M305.263 22H303.286L306.298 13.2727H308.676L311.685 22H309.707L307.521 15.267H307.453L305.263 22ZM305.139 18.5696H309.81V20.0099H305.139V18.5696ZM314.516 18.2159V22H312.701V15.4545H314.431V16.6094H314.508C314.653 16.2287 314.896 15.9276 315.237 15.706C315.577 15.4815 315.991 15.3693 316.477 15.3693C316.931 15.3693 317.327 15.4688 317.665 15.6676C318.004 15.8665 318.266 16.1506 318.454 16.5199C318.641 16.8864 318.735 17.3239 318.735 17.8324V22H316.92V18.1562C316.923 17.7557 316.82 17.4432 316.613 17.2188C316.406 16.9915 316.12 16.8778 315.756 16.8778C315.512 16.8778 315.296 16.9304 315.109 17.0355C314.924 17.1406 314.779 17.294 314.674 17.4957C314.572 17.6946 314.519 17.9347 314.516 18.2159ZM324.363 19.2131V15.4545H326.179V22H324.436V20.8111H324.368C324.22 21.1946 323.974 21.5028 323.63 21.7358C323.289 21.9687 322.873 22.0852 322.382 22.0852C321.944 22.0852 321.559 21.9858 321.227 21.7869C320.895 21.5881 320.635 21.3054 320.447 20.9389C320.262 20.5724 320.169 20.1335 320.166 19.6222V15.4545H321.981V19.2983C321.984 19.6847 322.088 19.9901 322.292 20.2145C322.497 20.4389 322.771 20.5511 323.115 20.5511C323.333 20.5511 323.538 20.5014 323.728 20.402C323.919 20.2997 324.072 20.1491 324.189 19.9503C324.308 19.7514 324.366 19.5057 324.363 19.2131ZM329.497 22.1236C329.08 22.1236 328.707 22.0511 328.381 21.9062C328.054 21.7585 327.795 21.5412 327.605 21.2543C327.418 20.9645 327.324 20.6037 327.324 20.1719C327.324 19.8082 327.391 19.5028 327.524 19.2557C327.658 19.0085 327.839 18.8097 328.07 18.6591C328.3 18.5085 328.561 18.3949 328.854 18.3182C329.149 18.2415 329.459 18.1875 329.783 18.1562C330.163 18.1165 330.47 18.0795 330.703 18.0455C330.936 18.0085 331.105 17.9545 331.21 17.8835C331.315 17.8125 331.368 17.7074 331.368 17.5682V17.5426C331.368 17.2727 331.283 17.0639 331.112 16.9162C330.945 16.7685 330.706 16.6946 330.396 16.6946C330.07 16.6946 329.81 16.767 329.616 16.9119C329.423 17.054 329.295 17.233 329.233 17.4489L327.554 17.3125C327.639 16.9148 327.807 16.571 328.057 16.2812C328.307 15.9886 328.629 15.7642 329.024 15.608C329.422 15.4489 329.882 15.3693 330.405 15.3693C330.768 15.3693 331.116 15.4119 331.449 15.4972C331.784 15.5824 332.081 15.7145 332.339 15.8935C332.601 16.0724 332.807 16.3026 332.957 16.5838C333.108 16.8622 333.183 17.196 333.183 17.5852V22H331.462V21.0923H331.411C331.305 21.2969 331.165 21.4773 330.989 21.6335C330.812 21.7869 330.601 21.9077 330.354 21.9957C330.107 22.081 329.821 22.1236 329.497 22.1236ZM330.017 20.8707C330.284 20.8707 330.52 20.8182 330.724 20.7131C330.929 20.6051 331.089 20.4602 331.206 20.2784C331.322 20.0966 331.381 19.8906 331.381 19.6605V18.9659C331.324 19.0028 331.246 19.0369 331.146 19.0682C331.05 19.0966 330.94 19.1236 330.818 19.1491C330.696 19.1719 330.574 19.1932 330.452 19.2131C330.33 19.2301 330.219 19.2457 330.119 19.2599C329.906 19.2912 329.72 19.3409 329.561 19.4091C329.402 19.4773 329.278 19.5696 329.19 19.6861C329.102 19.7997 329.058 19.9418 329.058 20.1122C329.058 20.3594 329.148 20.5483 329.327 20.679C329.509 20.8068 329.739 20.8707 330.017 20.8707ZM336.407 13.2727V22H334.592V13.2727H336.407ZM347.494 16.9162V18.3565H343.514V16.9162H347.494ZM348.778 22V20.6705L351.884 17.794C352.148 17.5384 352.37 17.3082 352.549 17.1037C352.731 16.8991 352.869 16.6989 352.962 16.5028C353.056 16.304 353.103 16.0895 353.103 15.8594C353.103 15.6037 353.045 15.3835 352.928 15.1989C352.812 15.0114 352.653 14.8679 352.451 14.7685C352.249 14.6662 352.021 14.6151 351.765 14.6151C351.498 14.6151 351.265 14.669 351.066 14.777C350.867 14.8849 350.714 15.0398 350.606 15.2415C350.498 15.4432 350.444 15.6832 350.444 15.9616H348.692C348.692 15.3906 348.822 14.8949 349.08 14.4744C349.339 14.054 349.701 13.7287 350.167 13.4986C350.633 13.2685 351.17 13.1534 351.778 13.1534C352.403 13.1534 352.947 13.2642 353.41 13.4858C353.876 13.7045 354.238 14.0085 354.496 14.3977C354.755 14.7869 354.884 15.233 354.884 15.7358C354.884 16.0653 354.819 16.3906 354.688 16.7116C354.56 17.0327 354.332 17.3892 354.002 17.7812C353.673 18.1705 353.208 18.6378 352.609 19.1832L351.335 20.4318V20.4915H354.999V22H348.778ZM359.758 22.1918C359.025 22.1889 358.395 22.0085 357.866 21.6506C357.341 21.2926 356.936 20.7741 356.652 20.0952C356.37 19.4162 356.231 18.5994 356.234 17.6449C356.234 16.6932 356.375 15.8821 356.656 15.2116C356.94 14.5412 357.345 14.0312 357.87 13.6818C358.399 13.3295 359.028 13.1534 359.758 13.1534C360.488 13.1534 361.116 13.3295 361.642 13.6818C362.17 14.0341 362.576 14.5455 362.86 15.2159C363.145 15.8835 363.285 16.6932 363.282 17.6449C363.282 18.6023 363.14 19.4205 362.856 20.0994C362.575 20.7784 362.172 21.2969 361.646 21.6548C361.12 22.0128 360.491 22.1918 359.758 22.1918ZM359.758 20.6619C360.258 20.6619 360.657 20.4105 360.956 19.9077C361.254 19.4048 361.402 18.6506 361.399 17.6449C361.399 16.983 361.331 16.4318 361.194 15.9915C361.061 15.5511 360.87 15.2202 360.623 14.9986C360.379 14.777 360.091 14.6662 359.758 14.6662C359.261 14.6662 358.863 14.9148 358.565 15.4119C358.267 15.9091 358.116 16.6534 358.113 17.6449C358.113 18.3153 358.18 18.875 358.314 19.3239C358.45 19.7699 358.642 20.1051 358.889 20.3295C359.136 20.5511 359.426 20.6619 359.758 20.6619ZM369.375 20.3636V19.9034C369.375 19.554 369.449 19.233 369.597 18.9403C369.747 18.6449 369.964 18.4091 370.249 18.233C370.536 18.054 370.885 17.9645 371.297 17.9645C371.714 17.9645 372.065 18.0526 372.349 18.2287C372.636 18.4048 372.852 18.6406 372.997 18.9361C373.145 19.2287 373.219 19.5511 373.219 19.9034V20.3636C373.219 20.7131 373.145 21.0355 372.997 21.331C372.849 21.6236 372.632 21.858 372.345 22.0341C372.058 22.2131 371.709 22.3026 371.297 22.3026C370.879 22.3026 370.528 22.2131 370.244 22.0341C369.96 21.858 369.744 21.6236 369.597 21.331C369.449 21.0355 369.375 20.7131 369.375 20.3636ZM370.615 19.9034V20.3636C370.615 20.5653 370.663 20.7557 370.76 20.9347C370.859 21.1136 371.038 21.2031 371.297 21.2031C371.555 21.2031 371.732 21.1151 371.825 20.9389C371.922 20.7628 371.97 20.571 371.97 20.3636V19.9034C371.97 19.696 371.925 19.5028 371.834 19.3239C371.743 19.1449 371.564 19.0554 371.297 19.0554C371.041 19.0554 370.864 19.1449 370.764 19.3239C370.665 19.5028 370.615 19.696 370.615 19.9034ZM364.896 15.3693V14.9091C364.896 14.5568 364.972 14.2344 365.122 13.9418C365.273 13.6463 365.49 13.4105 365.774 13.2344C366.061 13.0582 366.408 12.9702 366.814 12.9702C367.234 12.9702 367.587 13.0582 367.871 13.2344C368.155 13.4105 368.371 13.6463 368.518 13.9418C368.666 14.2344 368.74 14.5568 368.74 14.9091V15.3693C368.74 15.7216 368.665 16.044 368.514 16.3366C368.366 16.6293 368.149 16.8636 367.862 17.0398C367.578 17.2131 367.229 17.2997 366.814 17.2997C366.399 17.2997 366.048 17.2116 365.761 17.0355C365.477 16.8565 365.261 16.6222 365.114 16.3324C364.969 16.0398 364.896 15.7187 364.896 15.3693ZM366.145 14.9091V15.3693C366.145 15.5767 366.193 15.7685 366.29 15.9446C366.389 16.1207 366.564 16.2088 366.814 16.2088C367.075 16.2088 367.253 16.1207 367.347 15.9446C367.443 15.7685 367.491 15.5767 367.491 15.3693V14.9091C367.491 14.7017 367.446 14.5085 367.355 14.3295C367.264 14.1506 367.084 14.0611 366.814 14.0611C366.561 14.0611 366.386 14.152 366.29 14.3338C366.193 14.5156 366.145 14.7074 366.145 14.9091ZM365.459 22L371.459 13.2727H372.575L366.575 22H365.459Z"
            />
          </g>
        </svg>
      </div>

      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {PLANES.map(card => {
          const esActual = card.id === currentPlan && !trialing
          return (
            <div
              key={card.id}
              className={`relative flex flex-col rounded-xl border border-zinc-900 bg-white p-8 transition-shadow ${card.destacado ? 'shadow-md' : ''} ${highlightPlan === card.id ? 'ring-2 ring-emerald-400' : ''}`}
            >
              {card.destacado && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white">
                  Recomendado
                </span>
              )}

              <h3 className="text-lg font-bold text-zinc-900">{card.nombre}</h3>
              <p className="mt-1 min-h-[60px] text-sm text-zinc-600">{card.descripcion}</p>

              {term > 1 ? (
                // Un solo precio para los dos métodos de pago (unificado
                // 2026-08-26, pedido de ARam) -- MP y transferencia cobran
                // lo mismo con el descuento de plazo aplicado.
                <div className="mt-6">
                  <span className="text-3xl font-bold tracking-tight text-zinc-900">
                    {formatARS(priceForTerm(card, term))}
                  </span>
                  <span className="ml-1 text-sm text-zinc-500">/ {term} meses</span>
                  <p className="mt-0.5 text-xs text-emerald-600">
                    equivale a {formatARS(Math.round(priceForTerm(card, term) / term))}/mes — {Math.round(TERM_DISCOUNTS[term] * 100)}% off
                  </p>
                </div>
              ) : (
                <div className="mt-6">
                  <span className="text-3xl font-bold tracking-tight text-zinc-900">
                    {formatARS(card.precioARS)}
                  </span>
                  <span className="ml-1 text-sm text-zinc-500">/ mes</span>
                </div>
              )}

              <ul className="mt-8 flex-1 space-y-3">
                {card.features.map(f => (
                  <li key={f} className="flex items-start gap-3 text-sm text-zinc-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-zinc-900" />
                    {f}
                  </li>
                ))}
              </ul>

              {esActual ? (
                // El detalle (plazo, próximo cobro, cancelar) ahora vive en
                // el resumen de arriba de todo (2026-08-26, pedido de ARam)
                // -- acá la card del plan actual solo necesita decir eso.
                <button disabled className="btn-black mt-8 w-full opacity-50">
                  Tu plan actual
                </button>
              ) : (
                <div className="mt-8 space-y-2">
                  {paymentSettings.mercadopagoEnabled && (
                    <>
                      <button
                        onClick={() => setMpEmailPlan(p => (p === card.id ? null : card.id))}
                        disabled={loading !== null}
                        className="btn-outline w-full disabled:opacity-50"
                      >
                        {mpEmailPlan === card.id
                          ? 'Ocultar datos de MP'
                          : trialing && card.id === currentPlan ? `Activar ${card.nombre} con MP` : 'Pagar con Mercado Pago'}
                      </button>
                      {mpEmailPlan === card.id && (
                        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-left space-y-3">
                          <div>
                            <label className="block text-base font-semibold text-zinc-800 mb-1.5">
                              Email de tu cuenta de Mercado Pago
                            </label>
                            <input
                              type="email"
                              className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base focus:border-zinc-900 focus:outline-none"
                              value={payerEmail}
                              onChange={e => setPayerEmail(e.target.value)}
                              placeholder="tu@email.com"
                            />
                            <p className="mt-2 text-sm text-zinc-500">
                              Importante: tiene que ser el mismo email con el que vas a iniciar sesión en Mercado Pago al pagar — si no coincide, Mercado Pago rechaza el cobro.
                            </p>
                          </div>
                          <button
                            onClick={() => subscribeMp(card.id)}
                            disabled={loading !== null}
                            className="btn-black w-full disabled:opacity-50"
                          >
                            {loading === card.id && <Loader2 size={15} className="animate-spin" />}
                            Continuar
                          </button>
                        </div>
                      )}
                    </>
                  )}
                  {paymentSettings.manualTransferEnabled && (
                    <button
                      onClick={() => setExpandedPlan(p => (p === card.id ? null : card.id))}
                      className="btn-black w-full"
                    >
                      {expandedPlan === card.id ? 'Ocultar datos de transferencia' : 'Pagar por transferencia'}
                    </button>
                  )}

                  {paymentSettings.manualTransferEnabled && expandedPlan === card.id && (
                    <div className="mt-3">
                      <TransferPaymentBlock
                        paymentSettings={paymentSettings}
                        planId={card.id}
                        planNombre={card.nombre}
                        term={term}
                        monto={priceForTerm(card, term)}
                        accion="pasar mi tienda"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      </>
      )}
      {paymentHistory.length > 0 && (
        <div id="historial-de-pago" className="mt-14 scroll-mt-6">
          <h2 className="text-lg font-semibold text-zinc-900">Historial de pago</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Identificación de pago</th>
                  <th className="px-4 py-2 font-medium">ID de suscripción</th>
                  <th className="px-4 py-2 font-medium">Servicio</th>
                  <th className="px-4 py-2 font-medium">Pagado el</th>
                  <th className="px-4 py-2 font-medium">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {paymentHistory.map(p => (
                  <tr key={p.id} className="border-t border-zinc-100">
                    <td className="px-4 py-2 font-mono text-xs text-zinc-700">{p.mpPaymentId ?? '—'}</td>
                    <td className="px-4 py-2 font-mono text-xs text-zinc-500">{p.mpPreapprovalId ?? '—'}</td>
                    <td className="px-4 py-2 text-zinc-700">{PLANES.find(pl => pl.id === currentPlan)?.nombre ?? currentPlan}</td>
                    <td className="px-4 py-2 text-zinc-700">{p.status === 'approved' ? formatFecha(p.created_at) : '—'}</td>
                    <td className="px-4 py-2 text-zinc-700">
                      {formatARS(p.amount)}
                      {p.status !== 'approved' && <span className="ml-1 text-xs text-zinc-400">({p.status})</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}


      <div className="mt-10 pl-5 space-y-1 text-xs text-zinc-400">
        {paymentSettings.mercadopagoEnabled && (
          <>
            <p>El pago con Mercado Pago se procesa en su sitio seguro — nunca guardamos los datos de tu tarjeta.</p>
            <p>Aceptamos tarjetas de crédito y débito bancarias habilitadas para débito automático, o dinero disponible en tu cuenta de MercadoPago. No se aceptan tarjetas prepagas ni virtuales (ej. Prex, Uala prepaga) para suscripciones recurrentes.</p>
          </>
        )}
        {paymentSettings.manualTransferEnabled && (
          <p>Con transferencia, el plan se activa una vez que confirmemos el pago.</p>
        )}
      </div>
    </div>
  )
}

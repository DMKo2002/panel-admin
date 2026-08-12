// Cobro recurrente de suscripciones Gounuri con tarjeta guardada — alternativa
// a Preapproval (ver billing.ts), en paralelo, para el tenant que no quiere
// crear/usar una cuenta de Mercado Pago.
//
// IMPORTANTE: igual que billing.ts, usa la cuenta de MP de GOUNURI
// (GOUNURI_MP_ACCESS_TOKEN), no el mp_access_token del tenant.
//
// Flujo:
//  1. El tenant tokeniza su tarjeta en el navegador con el Card Payment Brick
//     (Public Key de Gounuri) → token de un solo uso (mismo patrón que
//     tienda-core/MercadoPagoBrick.tsx).
//  2. Servidor: crea (o reusa) un Customer de MP para el tenant y le guarda
//     la tarjeta con ese token → mp_customer_id + mp_card_id, guardados en
//     tenant_billing_card (tabla sin acceso público, ver migración).
//  3. Para cobrar (ahora y cada mes vía cron) se genera un card token nuevo
//     a partir de mp_customer_id + mp_card_id — los tokens son de un solo
//     uso y expiran, no se puede reusar el original — y se crea un Payment
//     con ese token nuevo.

import { randomUUID } from 'crypto'
import { PLANS, type PlanDef } from '@/lib/plans'

const MP_API = 'https://api.mercadopago.com'

function authHeaders(extra?: Record<string, string>) {
  const token = process.env.GOUNURI_MP_ACCESS_TOKEN
  if (!token) throw new Error('[billing-card] Falta GOUNURI_MP_ACCESS_TOKEN en las variables de entorno')
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra }
}

// Busca un Customer existente por email antes de crear uno nuevo — MP no
// deja tener dos Customers con el mismo email.
export async function getOrCreateCustomer(email: string): Promise<string> {
  const searchRes = await fetch(`${MP_API}/v1/customers/search?email=${encodeURIComponent(email)}`, {
    headers: authHeaders(),
  })
  if (searchRes.ok) {
    const data = await searchRes.json()
    const found = data?.results?.[0]?.id
    if (found) return found
  }
  const res = await fetch(`${MP_API}/v1/customers`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email }),
  })
  if (!res.ok) throw new Error(`[billing-card] crear customer falló (${res.status}): ${await res.text()}`)
  const data = await res.json()
  return data.id
}

export async function saveCard(customerId: string, cardToken: string): Promise<string> {
  const res = await fetch(`${MP_API}/v1/customers/${customerId}/cards`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ token: cardToken }),
  })
  if (!res.ok) throw new Error(`[billing-card] guardar tarjeta falló (${res.status}): ${await res.text()}`)
  const data = await res.json()
  return data.id
}

async function freshCardToken(customerId: string, cardId: string): Promise<string> {
  const res = await fetch(`${MP_API}/v1/card_tokens`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ card_id: cardId, customer_id: customerId }),
  })
  if (!res.ok) throw new Error(`[billing-card] generar token de tarjeta guardada falló (${res.status}): ${await res.text()}`)
  const data = await res.json()
  return data.id
}

export interface ChargeResult {
  ok: boolean
  paymentId?: string
  status: string
  statusDetail?: string
}

// Cobro con el token que devolvió el Brick recién tokenizado (un solo uso,
// todavía "fresco"). Es el que hay que usar para el PRIMER cobro, el que
// pasa en el mismo momento en que el tenant carga la tarjeta — no hace falta
// (ni conviene) pasar por guardar-tarjeta-y-regenerar-token para este caso.
export async function chargeWithToken(opts: {
  tenantId: string
  planId: Exclude<PlanDef['id'], 'free'>
  email: string
  token: string
}): Promise<ChargeResult> {
  const plan = PLANS[opts.planId]
  const res = await fetch(`${MP_API}/v1/payments`, {
    method: 'POST',
    headers: authHeaders({ 'X-Idempotency-Key': randomUUID() }),
    body: JSON.stringify({
      transaction_amount: plan.precioARS,
      token: opts.token,
      description: `Gounuri — Plan ${plan.nombre}`,
      installments: 1,
      payer: { email: opts.email },
      external_reference: `${opts.tenantId}:${opts.planId}`,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { ok: false, status: 'error', statusDetail: data?.message ?? `HTTP ${res.status}` }
  }
  return {
    ok: data.status === 'approved',
    paymentId: data.id ? String(data.id) : undefined,
    status: data.status,
    statusDetail: data.status_detail,
  }
}

// Cobro de un mes siguiente, con la tarjeta ya guardada (sin CVV en vivo,
// porque no hay nadie tipeando en ese momento — corre desde el cron). OJO:
// Mercado Pago exige aprobación especial de la cuenta para poder generar un
// card_token sin CVV a partir de una tarjeta guardada (ver nota en
// api/cron/billing-recurring/route.ts) — sin esa aprobación, esta función
// devuelve el error "security_code_id can't be null".
export async function chargeSavedCard(opts: {
  tenantId: string
  customerId: string
  cardId: string
  planId: Exclude<PlanDef['id'], 'free'>
  email: string
}): Promise<ChargeResult> {
  const plan = PLANS[opts.planId]
  let token: string
  try {
    token = await freshCardToken(opts.customerId, opts.cardId)
  } catch (e) {
    return { ok: false, status: 'error', statusDetail: e instanceof Error ? e.message : 'No se pudo generar el token de la tarjeta' }
  }

  const res = await fetch(`${MP_API}/v1/payments`, {
    method: 'POST',
    // Idempotency key nueva por intento real de cobro — evita doble cobro si
    // hay un reintento de red dentro del mismo request, sin bloquear
    // reintentos legítimos en días distintos (a diferencia de una key fija
    // por mes, que haría que MP devuelva el mismo resultado fallido siempre).
    headers: authHeaders({ 'X-Idempotency-Key': randomUUID() }),
    body: JSON.stringify({
      transaction_amount: plan.precioARS,
      token,
      description: `Gounuri — Plan ${plan.nombre}`,
      installments: 1,
      payer: { type: 'customer', id: opts.customerId, email: opts.email },
      external_reference: `${opts.tenantId}:${opts.planId}`,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { ok: false, status: 'error', statusDetail: data?.message ?? `HTTP ${res.status}` }
  }
  return {
    ok: data.status === 'approved',
    paymentId: data.id ? String(data.id) : undefined,
    status: data.status,
    statusDetail: data.status_detail,
  }
}

// Suscripciones de Gounuri via MercadoPago Preapproval (débito automático).
//
// IMPORTANTE: usa la cuenta de MP de GOUNURI (env GOUNURI_MP_ACCESS_TOKEN),
// no el mp_access_token de cada tenant — eso es para que las tiendas cobren
// a sus propios clientes. Acá Gounuri le cobra la mensualidad al tenant.
//
// Flujo: el tenant elige plan en /dashboard/uso → POST /api/billing/subscribe
// crea el preapproval (status pending) y devuelve init_point → el tenant
// autoriza su tarjeta en MP → MP pega al webhook → se actualiza tenants.plan.

import { PLANS, fullPriceForTerm, type PlanDef, type BillingTerm } from '@/lib/plans'

const MP_API = 'https://api.mercadopago.com'

function token(): string {
  const t = process.env.GOUNURI_MP_ACCESS_TOKEN
  if (!t) throw new Error('[billing] Falta GOUNURI_MP_ACCESS_TOKEN en las variables de entorno')
  return t
}

export interface Preapproval {
  id: string
  status: string // pending | authorized | paused | cancelled
  external_reference?: string
  init_point?: string
  payer_email?: string
  auto_recurring?: {
    frequency?: number
    transaction_amount?: number
  }
}

// external_reference = "tenantId:planId" — así el webhook sabe a quién activar
export function buildExternalReference(tenantId: string, planId: PlanDef['id']): string {
  return `${tenantId}:${planId}`
}

// "new:userId:planId:months" — pedido 2026-08-18: "selecciona el plan - paga
// - recién con el pago queda generado la tienda - onboarding". Se usa cuando
// alguien elige un plan pago desde la landing SIN tener tienda todavía (ver
// gounuri-web/src/app/api/ir-a-plan) — no existe tenantId para meter en el
// external_reference porque a propósito no se crea ningún tenant hasta que
// el webhook confirme 'authorized' (así no quedan tiendas "(pendiente)"
// huérfanas de gente que arrancó a pagar y no terminó). El prefijo "new:" no
// puede colisionar con un tenantId real (son uuid, nunca empiezan así).
export function buildSignupExternalReference(userId: string, planId: PlanDef['id'], months: BillingTerm): string {
  return `new:${userId}:${planId}:${months}`
}

// Nombre "sentinel" para tenants placeholder — DEBE coincidir literalmente
// con gounuri-web/src/lib/site.ts (PLACEHOLDER_TENANT_NAME). Los repos no
// comparten código, así que este string se mantiene duplicado a mano en
// ambos lados; cualquier endpoint que actualice nombre/slug/template de un
// tenant debe primero chequear tenant.name === PLACEHOLDER_TENANT_NAME.
export const PLACEHOLDER_TENANT_NAME = '(pendiente)'

export type ParsedExternalReference =
  | { kind: 'tenant'; tenantId: string; planId: string }
  | { kind: 'signup'; userId: string; planId: string; months: BillingTerm }

export function parseExternalReference(ref: string | undefined): ParsedExternalReference | null {
  if (!ref) return null

  if (ref.startsWith('new:')) {
    const [, userId, planId, monthsStr] = ref.split(':')
    const months = Number(monthsStr)
    if (!userId || !planId || !(planId in PLANS) || (months !== 1 && months !== 6 && months !== 12)) return null
    return { kind: 'signup', userId, planId, months }
  }

  const [tenantId, planId] = ref.split(':')
  if (!tenantId || !planId || !(planId in PLANS)) return null
  return { kind: 'tenant', tenantId, planId }
}

export async function createPreapproval(opts: {
  tenantId: string
  planId: Exclude<PlanDef['id'], 'free'>
  payerEmail: string
  backUrl: string
  // 1 = mensual (sin descuento), 6 = -10% pagando 6 meses de una, 12 = -20%
  // pagando 12 meses de una. Default 1 para no romper llamadas viejas.
  months?: BillingTerm
}): Promise<Preapproval> {
  const plan = PLANS[opts.planId]
  const months = opts.months ?? 1
  // Mercado Pago cobra precio de lista, sin el descuento por plazo -- ese
  // descuento es solo para transferencia (2026-08-26, pedido de ARam).
  const amount = fullPriceForTerm(plan, months)
  const reason = months === 1
    ? `Gounuri — Plan ${plan.nombre}`
    : `Gounuri — Plan ${plan.nombre} (${months} meses)`
  const res = await fetch(`${MP_API}/preapproval`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reason,
      external_reference: buildExternalReference(opts.tenantId, opts.planId),
      payer_email: opts.payerEmail,
      back_url: opts.backUrl,
      auto_recurring: {
        frequency: months,
        frequency_type: 'months',
        transaction_amount: amount,
        currency_id: 'ARS',
      },
      status: 'pending',
    }),
  })
  if (!res.ok) throw new Error(`[billing] MP preapproval falló (${res.status}): ${await res.text()}`)
  return res.json()
}

export async function getPreapproval(id: string): Promise<Preapproval> {
  const res = await fetch(`${MP_API}/preapproval/${id}`, {
    headers: { Authorization: `Bearer ${token()}` },
  })
  if (!res.ok) throw new Error(`[billing] MP get preapproval falló (${res.status}): ${await res.text()}`)
  return res.json()
}

// Cancela un preapproval en MP — usado tanto por "dar de baja" (el tenant
// decide no renovar más, ver /api/billing/cancel) como internamente por
// /api/billing/subscribe antes de crear uno nuevo cuando el tenant cambia
// de plazo (evita quedar con dos débitos automáticos activos en paralelo).
// Una vez cancelado, MP no permite reactivarlo — para volver hace falta un
// preapproval nuevo con una autorización nueva.
export async function cancelPreapproval(id: string): Promise<Preapproval> {
  const res = await fetch(`${MP_API}/preapproval/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'cancelled' }),
  })
  if (!res.ok) throw new Error(`[billing] MP cancelar preapproval falló (${res.status}): ${await res.text()}`)
  return res.json()
}

// Detalle de un pago individual — usado por el webhook para construir el
// historial de pagos cuando llega una notificación del tópico "Pagos" (un
// cobro recurrente del mes 2 en adelante; el primer cobro se registra al
// autorizarse el preapproval). Solo se tipan los campos que se usan; el
// objeto real de MP trae muchos más.
export interface Payment {
  id: number | string
  status: string
  status_detail?: string
  transaction_amount?: number
  external_reference?: string
  point_of_interaction?: { transaction_data?: { subscription_id?: string } }
  metadata?: { preapproval_id?: string }
}

export async function getPayment(id: string): Promise<Payment> {
  const res = await fetch(`${MP_API}/v1/payments/${id}`, {
    headers: { Authorization: `Bearer ${token()}` },
  })
  if (!res.ok) throw new Error(`[billing] MP get payment falló (${res.status}): ${await res.text()}`)
  return res.json()
}

export function billingEnabled(): boolean {
  return process.env.BILLING_ENABLED === 'true'
}

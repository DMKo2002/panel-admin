// Suscripciones de Gounuri via MercadoPago Preapproval (débito automático).
//
// IMPORTANTE: usa la cuenta de MP de GOUNURI (env GOUNURI_MP_ACCESS_TOKEN),
// no el mp_access_token de cada tenant — eso es para que las tiendas cobren
// a sus propios clientes. Acá Gounuri le cobra la mensualidad al tenant.
//
// Flujo: el tenant elige plan en /dashboard/uso → POST /api/billing/subscribe
// crea el preapproval (status pending) y devuelve init_point → el tenant
// autoriza su tarjeta en MP → MP pega al webhook → se actualiza tenants.plan.

import { PLANS, type PlanDef } from '@/lib/plans'

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
}

// external_reference = "tenantId:planId" — así el webhook sabe a quién activar
export function buildExternalReference(tenantId: string, planId: PlanDef['id']): string {
  return `${tenantId}:${planId}`
}

export function parseExternalReference(ref: string | undefined): { tenantId: string; planId: string } | null {
  if (!ref) return null
  const [tenantId, planId] = ref.split(':')
  if (!tenantId || !planId || !(planId in PLANS)) return null
  return { tenantId, planId }
}

export async function createPreapproval(opts: {
  tenantId: string
  planId: Exclude<PlanDef['id'], 'free'>
  payerEmail: string
  backUrl: string
}): Promise<Preapproval> {
  const plan = PLANS[opts.planId]
  const res = await fetch(`${MP_API}/preapproval`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reason: `Gounuri — Plan ${plan.nombre}`,
      external_reference: buildExternalReference(opts.tenantId, opts.planId),
      payer_email: opts.payerEmail,
      back_url: opts.backUrl,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: plan.precioARS,
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

export function billingEnabled(): boolean {
  return process.env.BILLING_ENABLED === 'true'
}

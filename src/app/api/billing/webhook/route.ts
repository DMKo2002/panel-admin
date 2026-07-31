// Webhook de MercadoPago para suscripciones de Gounuri.
// Configurar en MP (cuenta Gounuri) → Webhooks → URL:
//   https://<panel>/api/billing/webhook  — evento: subscription_preapproval
//
// Seguridad: no confiamos en el body del request — solo tomamos el id y
// re-consultamos el estado real contra la API de MP con nuestro token.

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPreapproval, parseExternalReference } from '@/lib/billing'

export async function POST(req: Request) {
  let body: { type?: string; action?: string; data?: { id?: string } }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  // Solo nos interesan eventos de preapproval (suscripción)
  const isPreapproval = (body.type ?? body.action ?? '').includes('preapproval')
  const id = body.data?.id
  if (!isPreapproval || !id) return NextResponse.json({ ok: true, ignored: true })

  try {
    const pre = await getPreapproval(id)
    const ref = parseExternalReference(pre.external_reference)
    if (!ref) return NextResponse.json({ ok: true, ignored: 'sin external_reference válido' })

    const service = createServiceClient()

    if (pre.status === 'authorized') {
      await service.from('tenants').update({
        plan: ref.planId,
        plan_status: 'active',
        mp_preapproval_id: pre.id,
        over_limit_since: null, // el upgrade regulariza la gracia
        trial_ends_at: null,    // fin del trial: ya está pagando
        trial_warned_at: null,
        limit_warned_at: null,
      }).eq('id', ref.tenantId)

      // Si estaba suspendida automáticamente (trial vencido / exceso de cupo),
      // el pago la reactiva. Las suspensiones manuales no se tocan.
      await service.from('tenants')
        .update({ status: 'active', suspended_reason: null })
        .eq('id', ref.tenantId)
        .in('suspended_reason', ['trial_expired', 'over_limit'])
    } else if (pre.status === 'paused') {
      await service.from('tenants').update({ plan_status: 'past_due' }).eq('id', ref.tenantId)
    } else if (pre.status === 'cancelled') {
      // Canceló el débito — vuelve al plan gratuito
      await service.from('tenants').update({ plan: 'free', plan_status: 'canceled' }).eq('id', ref.tenantId)
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[billing/webhook]', e)
    // 500 para que MP reintente
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

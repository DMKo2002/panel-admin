// Webhook de MercadoPago para suscripciones de Gounuri.
// Configurar en MP (cuenta Gounuri) → Webhooks → URL:
//   https://<panel>/api/billing/webhook  — evento: subscription_preapproval
//
// Seguridad: no confiamos en el body del request — solo tomamos el id y
// re-consultamos el estado real contra la API de MP con nuestro token.

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { getPreapproval, parseExternalReference, PLACEHOLDER_TENANT_NAME } from '@/lib/billing'
import { getPlanForTenant } from '@/lib/plans'
import { getPlatformPaymentSettings } from '@/lib/platformBilling'
import { sendEmail } from '@/lib/email'

// Notificación a GOUNURI cada vez que MP confirma una suscripción — pedido
// 2026-08-22, para no depender de entrar a mirar el panel. Nunca tira: si
// falla el mail, solo lo logea (no queremos que un error de Resend haga que
// MP reintente el webhook y process la suscripción dos veces).
async function notifySubscriptionPaid(service: SupabaseClient, opts: {
  tenantName: string
  planId: string
  months?: number
  amount?: number
  metodo: string
}) {
  try {
    const settings = await getPlatformPaymentSettings(service)
    const plan = getPlanForTenant(opts.planId)
    const montoTxt = opts.amount ? `$${opts.amount.toLocaleString('es-AR')}` : '(monto no informado por MP)'
    await sendEmail({
      to: settings.contactEmail,
      subject: `💳 Nueva suscripción confirmada — ${opts.tenantName} → ${plan.nombre}`,
      html: `
        <p><strong>${opts.tenantName}</strong> confirmó el pago del plan <strong>${plan.nombre}</strong>${opts.months ? ` (${opts.months} meses)` : ''}.</p>
        <p>Monto: ${montoTxt}</p>
        <p>Método: ${opts.metodo}</p>
      `,
    })
  } catch (e) {
    console.error('[billing/webhook] error notificando suscripción pagada:', e)
  }
}

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

    if (ref.kind === 'signup') {
      // Alguien eligió un plan pago desde la landing de gounuri.com SIN tener
      // tienda todavía (ver gounuri-web/src/app/api/ir-a-plan) — pedido
      // 2026-08-18: "selecciona el plan - paga - recién con el pago queda
      // generado la tienda - onboarding". Acá recién se crea el tenant, y
      // solo si el pago quedó 'authorized'; si queda pending/paused/cancelled
      // no hay tenant que tocar, no hacemos nada.
      if (pre.status !== 'authorized') {
        return NextResponse.json({ ok: true, ignored: 'signup sin autorizar todavía' })
      }

      // Idempotencia: si este webhook ya se procesó antes para este usuario
      // (MP puede reintentar el mismo evento), no crear un segundo tenant.
      const { data: existingUserRows } = await service
        .from('users').select('tenant_id').eq('id', ref.userId).limit(1)
      if (existingUserRows?.[0]?.tenant_id) {
        return NextResponse.json({ ok: true, ignored: 'el usuario ya tiene tenant' })
      }

      // Placeholder mínimo — el nombre/slug/template reales se completan
      // después en /onboarding vía gounuri-web/src/app/api/finalizar-tienda
      // (ese endpoint solo puede tocar un tenant que siga siendo este
      // placeholder, nunca uno ya en uso).
      let slug = `pendiente-${Math.random().toString(36).slice(2, 10)}`
      let tenant: { id: string } | null = null
      let lastError: { code?: string; message: string } | null = null
      for (let attempt = 0; attempt < 3 && !tenant; attempt++) {
        const { data, error } = await service
          .from('tenants')
          .insert({
            slug,
            name: PLACEHOLDER_TENANT_NAME,
            template: 'minimalista',
            plan: ref.planId,
            plan_status: 'active',
            trial_ends_at: null,
            status: 'active',
            mp_preapproval_id: pre.id,
          })
          .select('id')
          .single()
        if (data) { tenant = data; break }
        lastError = error
        if (error?.code === '23505') {
          // slug colisionó (muy improbable) — reintentar con otro random
          slug = `pendiente-${Math.random().toString(36).slice(2, 10)}`
          continue
        }
        break
      }
      if (!tenant) {
        console.error('[billing/webhook] no se pudo crear el tenant placeholder para el signup', ref.userId, lastError)
        return NextResponse.json({ ok: false }, { status: 500 })
      }

      const { data: authUser } = await service.auth.admin.getUserById(ref.userId)
      const { error: userError } = await service
        .from('users')
        .upsert(
          { id: ref.userId, email: authUser?.user?.email, tenant_id: tenant.id, role: 'owner' },
          { onConflict: 'id' }
        )
      if (userError) {
        console.error('[billing/webhook] no se pudo vincular el usuario al tenant placeholder', ref.userId, userError)
        return NextResponse.json({ ok: false }, { status: 500 })
      }

      // await (aunque adentro ya atrapa sus propios errores) para que el
      // envío del mail no quede colgando cuando Vercel corta la ejecución al
      // volver el response — ver nota arriba de notifySubscriptionPaid.
      await notifySubscriptionPaid(service, {
        tenantName: `Alta nueva desde la landing (todavía sin completar onboarding)`,
        planId: ref.planId,
        months: ref.months,
        amount: pre.auto_recurring?.transaction_amount,
        metodo: 'Mercado Pago (débito automático)',
      })

      return NextResponse.json({ ok: true, tenantId: tenant.id })
    }

    if (pre.status === 'authorized') {
      const { data: updatedTenant } = await service.from('tenants').update({
        plan: ref.planId,
        plan_status: 'active',
        mp_preapproval_id: pre.id,
        over_limit_since: null, // el upgrade regulariza la gracia
        trial_ends_at: null,    // fin del trial: ya está pagando
        trial_warned_at: null,
        limit_warned_at: null,
      }).eq('id', ref.tenantId).select('name').single()

      // Si estaba suspendida automáticamente (trial vencido / exceso de cupo),
      // el pago la reactiva. Las suspensiones manuales no se tocan.
      await service.from('tenants')
        .update({ status: 'active', suspended_reason: null })
        .eq('id', ref.tenantId)
        .in('suspended_reason', ['trial_expired', 'over_limit'])

      await notifySubscriptionPaid(service, {
        tenantName: updatedTenant?.name ?? ref.tenantId,
        planId: ref.planId,
        amount: pre.auto_recurring?.transaction_amount,
        metodo: 'Mercado Pago (débito automático)',
      })
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

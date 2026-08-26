// Webhook de MercadoPago para suscripciones de Gounuri.
// Configurar en MP (cuenta Gounuri) → Webhooks → URL:
//   https://<panel>/api/billing/webhook  — eventos: "Planes y suscripciones"
//   Y "Pagos" (2026-08-25: hace falta activar este segundo tópico a mano en
//   el dashboard de MP para que lleguen los cobros recurrentes del mes 2 en
//   adelante — el primero ya llega por el evento de preapproval autorizado.
//   Sin esto activado, el historial de pagos solo muestra el primer cobro).
//
// Seguridad: no confiamos en el body del request — solo tomamos el id y
// re-consultamos el estado real contra la API de MP con nuestro token.

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { getPreapproval, getPayment, parseExternalReference, PLACEHOLDER_TENANT_NAME } from '@/lib/billing'
import { getPlanForTenant, isBillingTerm, type BillingTerm } from '@/lib/plans'
import { getPlatformPaymentSettings } from '@/lib/platformBilling'
import { sendEmail, emailPagoConfirmado } from '@/lib/email'

// now + N meses de calendario — mismo criterio que mark-plan-paid/route.ts.
function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

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

  const topic = body.type ?? body.action ?? ''
  const isPreapproval = topic.includes('preapproval')
  const isPayment = !isPreapproval && topic.includes('payment')
  const id = body.data?.id
  if (!id || (!isPreapproval && !isPayment)) return NextResponse.json({ ok: true, ignored: true })

  const service = createServiceClient()

  // ── Cobro recurrente individual (mes 2 en adelante) ─────────────────────────
  // Distinto del alta/autorización de abajo: esto es un pago puntual, no un
  // cambio de estado de la suscripción. Solo alimenta el historial
  // (billing_charges) — no toca plan/plan_status, eso lo sigue manejando
  // exclusivamente la rama de preapproval de más abajo.
  if (isPayment) {
    try {
      const payment = await getPayment(id)
      const ref = parseExternalReference(payment.external_reference)
      // Los pagos del flujo "new:" (alta desde la landing, sin tenant
      // todavía) no tienen historial que guardar — el tenant recién se crea
      // cuando el preapproval queda autorizado.
      if (!ref || ref.kind !== 'tenant') return NextResponse.json({ ok: true, ignored: 'sin tenant asociado' })

      // MP no documenta un único campo estable para el id del preapproval
      // dentro del objeto Payment — se intenta con los más plausibles y se
      // guarda null si no aparece ninguno (mp_payment_id alcanza para no
      // duplicar el historial; ver comment en la migración). Revisar contra
      // un pago real la primera vez que se active el tópico "Pagos".
      const preapprovalId =
        (payment as { point_of_interaction?: { transaction_data?: { subscription_id?: string } } })
          .point_of_interaction?.transaction_data?.subscription_id
        ?? (payment as { metadata?: { preapproval_id?: string } }).metadata?.preapproval_id
        ?? null

      // Idempotencia simple: MP puede reintentar la misma notificación:  no
      // insertar de nuevo si ya guardamos este mp_payment_id.
      const { data: existing } = await service
        .from('billing_charges').select('id').eq('mp_payment_id', String(payment.id)).limit(1)
      if (existing?.length) return NextResponse.json({ ok: true, ignored: 'ya registrado' })

      await service.from('billing_charges').insert({
        tenant_id: ref.tenantId,
        amount: payment.transaction_amount ?? 0,
        status: payment.status,
        status_detail: payment.status_detail ?? null,
        mp_payment_id: String(payment.id),
        mp_preapproval_id: preapprovalId,
      })
      return NextResponse.json({ ok: true })
    } catch (e) {
      console.error('[billing/webhook] payment', e)
      return NextResponse.json({ ok: false }, { status: 500 })
    }
  }

  // ── Alta / cambio de estado de la suscripción ───────────────────────────────
  try {
    const pre = await getPreapproval(id)
    const ref = parseExternalReference(pre.external_reference)
    if (!ref) return NextResponse.json({ ok: true, ignored: 'sin external_reference válido' })

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
      const months: BillingTerm = isBillingTerm(ref.months) ? ref.months : 1
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
            billing_term: months,
            next_billing_date: addMonths(new Date(), months).toISOString(),
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
      const months: BillingTerm = isBillingTerm(pre.auto_recurring?.frequency) ? (pre.auto_recurring!.frequency as BillingTerm) : 1
      const nextBillingDate = addMonths(new Date(), months)
      const { data: updatedTenant } = await service.from('tenants').update({
        plan: ref.planId,
        plan_status: 'active',
        mp_preapproval_id: pre.id,
        billing_term: months,
        next_billing_date: nextBillingDate.toISOString(),
        billing_paused_by_user: false, // por si venía de un "dar de baja" y se volvió a suscribir
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

      // Registrar el primer cobro en billing_charges (2026-08-26, bug
      // reportado por David en QA: "Ver historial de pago" es un link
      // muerto porque billing_charges está vacía para TODOS los tenants).
      // La rama isPayment de arriba (tópico "Pagos" de MP) es la única que
      // insertaba acá, y ese tópico nunca llegó a activarse/dispararse en
      // la práctica -- este insert es la red de seguridad para que al
      // menos el alta quede en el historial sin depender de esa
      // activación manual en el dashboard de MP. mp_payment_id null (no
      // tenemos un Payment id real acá, solo el preapproval) -- si más
      // adelante se activa el tópico "Pagos" y llega el payment real de
      // este mismo cobro, puede quedar duplicado una vez; no vale la pena
      // complicar la dedup por eso.
      const { data: _existingCharge } = await service
        .from('billing_charges').select('id').eq('mp_preapproval_id', pre.id).limit(1)
      if (!_existingCharge?.length) {
        await service.from('billing_charges').insert({
          tenant_id: ref.tenantId,
          amount: pre.auto_recurring?.transaction_amount ?? 0,
          status: 'approved',
          status_detail: 'preapproval_authorized',
          mp_payment_id: null,
          mp_preapproval_id: pre.id,
        })
      }

      await notifySubscriptionPaid(service, {
        tenantName: updatedTenant?.name ?? ref.tenantId,
        planId: ref.planId,
        amount: pre.auto_recurring?.transaction_amount,
        metodo: 'Mercado Pago (débito automático)',
      })

      // Mail al tenant confirmando el pago (2026-08-26, bug detectado por
      // David en QA: esta rama solo avisaba a Gounuri con
      // notifySubscriptionPaid de arriba -- el dueño de la tienda no se
      // enteraba de nada más que los mails propios de Mercado Pago). Mismo
      // template/patrón que mark-plan-paid/route.ts usa para el flujo de
      // transferencia manual -- acá es el flujo de débito automático de MP.
      // Best-effort: un mail que falla no debe romper el webhook (MP
      // reintentaría de más si devolviéramos error).
      try {
        const { data: ownerRows } = await service
          .from('users').select('email').eq('tenant_id', ref.tenantId).eq('role', 'owner').limit(1)
        const ownerEmail = ownerRows?.[0]?.email
        if (ownerEmail) {
          const plan = getPlanForTenant(ref.planId)
          const panelUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://panel.gounuri.com'
          await sendEmail({
            to: ownerEmail,
            subject: '✅ Pago confirmado — tu tienda ya está activa',
            html: emailPagoConfirmado({
              tenantName: updatedTenant?.name ?? 'tu tienda',
              planNombre: plan.nombre,
              months,
              amount: pre.auto_recurring?.transaction_amount ?? 0,
              paidUntil: nextBillingDate.toISOString(),
              panelUrl,
            }),
          })
        }
      } catch (e) {
        console.error('[billing/webhook] error notificando al tenant del pago:', e)
      }
    } else if (pre.status === 'paused') {
      // OJO: esto es MP pausando SOLO porque falló un cobro (dunning) — el
      // "dar de baja" a pedido del tenant (/api/billing/cancel) usa
      // 'cancelled', no 'paused', y ya marca billing_paused_by_user=true por
      // su cuenta antes de que este webhook llegue — así que si acá vemos
      // 'paused' es siempre un cobro fallido, nunca una baja voluntaria.
      await service.from('tenants').update({ plan_status: 'past_due' }).eq('id', ref.tenantId)
    } else if (pre.status === 'cancelled') {
      // Si billing_paused_by_user ya está en true, esto es el eco async de
      // una baja voluntaria que ya procesó /api/billing/cancel (2026-08-26,
      // bug detectado por David en QA: el popover de "Facturación" en
      // superadmin mostraba "—" en vez de la fecha de vencimiento apenas se
      // cancelaba, porque esta rama pisaba plan/next_billing_date a los
      // pocos segundos de la baja voluntaria). Esa ruta ya dejó
      // next_billing_date intacto a propósito para que el servicio siga
      // vigente hasta esa fecha (lo baja cron/enforce cuando corresponda) —
      // acá no hay nada más que hacer.
      const { data: _pausedRows } = await service
        .from('tenants').select('billing_paused_by_user').eq('id', ref.tenantId).limit(1)
      if (_pausedRows?.[0]?.billing_paused_by_user) {
        return NextResponse.json({ ok: true, ignored: 'baja voluntaria ya procesada por /api/billing/cancel' })
      }

      // Cancelado en MP sin pasar por /api/billing/cancel (por ejemplo, el
      // tenant lo canceló desde su propia cuenta de MP en vez de desde acá).
      // Sin next_billing_date confiable en ese caso, se mantiene el
      // comportamiento anterior: vuelve al plan gratuito al instante en vez
      // de esperar a un vencimiento que no se generó.
      await service.from('tenants').update({
        plan: 'free',
        plan_status: 'canceled',
        billing_term: null,
        next_billing_date: null,
        billing_paused_by_user: false,
      }).eq('id', ref.tenantId)
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[billing/webhook]', e)
    // 500 para que MP reintente
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

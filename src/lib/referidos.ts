// Helpers compartidos del programa de referidos (2026-09) — extraído de
// billing/webhook/route.ts el 2026-09-11 para poder reusar la misma lógica
// de recompensa desde el pago manual por transferencia (ver
// api/superadmin/mark-plan-paid/route.ts), que hasta ahora nunca la
// acreditaba porque vivía solo adentro del webhook de Mercado Pago (bug
// reportado por David en QA: "el descuento se hace únicamente por Mercado
// Pago"). Mismo criterio de idempotencia y best-effort que tenía en el
// webhook — ver comentario abajo.

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail, emailReferidoRecompensa } from '@/lib/email'

export const REFERIDO_RECOMPENSA_MESES = 2

// Recompensa por referido: si este tenant se registró con un código de
// invitación (referred_by) y este es su PRIMER pago confirmado
// (referido_recompensa_aplicada_at todavía null — tanto el webhook de MP
// como mark-plan-paid pueden llamar esto, y el webhook puede reintentar la
// misma notificación), el que invitó suma REFERIDO_RECOMPENSA_MESES al saldo
// de meses gratis. El incremento va por una función de Postgres
// (increment_meses_gratis, ver migración referidos_increment_function) en
// vez de leer-y-reescribir desde acá, para no perder un incremento si dos
// referidos del mismo inviter confirman pago casi al mismo tiempo. Todo esto
// es best-effort: un error acá no debe tirar abajo la confirmación del pago
// en sí (ya se procesó antes de llamar esto), así que va en su propio
// try/catch sin relanzar.
export async function aplicarRecompensaReferido(service: SupabaseClient, opts: {
  tenantId: string
  tenantName: string
}) {
  try {
    const { data: refRows } = await service
      .from('tenants')
      .select('referred_by, referido_recompensa_aplicada_at')
      .eq('id', opts.tenantId)
      .limit(1)
    const refTenant = refRows?.[0]
    if (!refTenant?.referred_by || refTenant.referido_recompensa_aplicada_at) return

    // Se marca ANTES de sumar el saldo — si el mail o el increment fallan y
    // esto se vuelve a llamar, no queremos duplicar la recompensa.
    await service.from('tenants')
      .update({ referido_recompensa_aplicada_at: new Date().toISOString() })
      .eq('id', opts.tenantId)

    const { error: incError } = await service.rpc('increment_meses_gratis', {
      p_tenant_id: refTenant.referred_by,
      p_meses: REFERIDO_RECOMPENSA_MESES,
    })
    if (incError) {
      console.error('[referidos] no se pudo acreditar meses gratis al referente', incError)
      return
    }

    const { data: inviterRows } = await service
      .from('tenants').select('name').eq('id', refTenant.referred_by).limit(1)
    const inviterName = inviterRows?.[0]?.name
    const { data: inviterOwnerRows } = await service
      .from('users').select('email').eq('tenant_id', refTenant.referred_by).eq('role', 'owner').limit(1)
    const inviterOwnerEmail = inviterOwnerRows?.[0]?.email
    if (inviterOwnerEmail) {
      const panelUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://panel.gounuri.com'
      await sendEmail({
        to: inviterOwnerEmail,
        subject: '🎉 Sumaste 2 meses gratis por invitar a alguien a Gounuri',
        html: emailReferidoRecompensa({
          tenantName: inviterName ?? 'tu tienda',
          invitedName: opts.tenantName,
          panelUrl,
        }),
      }).catch(e => console.error('[referidos] email recompensa referido error:', e))
    }
  } catch (e) {
    console.error('[referidos] error procesando recompensa de referido', e)
  }
}

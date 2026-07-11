import { createServiceClient } from '@/lib/supabase/service'

/**
 * Shape mínimo que necesitamos del objeto "payment" que devuelve la API de MP.
 * Se usa `[key: string]: any` porque para el matching por Concepto revisamos
 * el payload completo (ver nota abajo).
 */
export interface MPIncomingPayment {
  id: number | string
  status: string
  operation_type?: string
  transaction_amount?: number
  description?: string | null
  date_created?: string
  [key: string]: any
}

export interface MatchResult {
  matched: boolean
  order_id?: string
  reason:
    | 'not_approved'
    | 'no_amount'
    | 'no_pending_orders'
    | 'matched_by_code'
    | 'matched_by_amount'
    | 'ambiguous_amount'
    | 'no_match'
}

/**
 * Intenta conciliar una transferencia entrante (CVU/CBU) reportada por el
 * webhook de Mercado Pago con un pedido pendiente de pago por transferencia.
 *
 * IMPORTANTE (verificar con una transferencia de prueba real antes de confiar
 * 100% en esto en producción): Mercado Pago no documenta de forma estable en
 * qué campo exacto viaja el "Concepto"/motivo que el pagador escribe al
 * transferir a un CVU/CBU — puede aparecer en `description`, en algún campo
 * dentro de `point_of_interaction`, o en otro lado según el banco de origen.
 * Por eso, en vez de apostar a un único campo, buscamos el order_code como
 * substring en el JSON completo del pago. Esto es más robusto a estos
 * cambios/variaciones, a costa de un chance mínimo de falso positivo si el
 * código apareciera por casualidad en otro campo (muy improbable dado el
 * formato PEDIDO-XXXXXXXX).
 *
 * Orden de prioridad para el match:
 *   1. order_code encontrado en el payload del pago (Concepto)
 *   2. monto exacto, solo si es único entre los pedidos pendientes de esa
 *      tienda (si hay más de un pedido pendiente con el mismo monto, no
 *      adivinamos — se marca para revisión manual)
 *   3. sin match → se notifica al vendedor para confirmación manual
 */
export async function matchIncomingTransfer(
  tenantId: string,
  payment: MPIncomingPayment
): Promise<MatchResult> {
  const service = createServiceClient()

  if (payment.status !== 'approved') {
    return { matched: false, reason: 'not_approved' }
  }

  const amount = payment.transaction_amount
  if (!amount || amount <= 0) {
    return { matched: false, reason: 'no_amount' }
  }

  const { data: pendingOrders } = await service
    .from('orders')
    .select('id, order_code, total')
    .eq('tenant_id', tenantId)
    .eq('payment_method', 'transfer')
    .eq('payment_status', 'pending')

  if (!pendingOrders || pendingOrders.length === 0) {
    return { matched: false, reason: 'no_pending_orders' }
  }

  const paymentBlob = JSON.stringify(payment).toUpperCase()

  const byCode = pendingOrders.find(
    (o) => o.order_code && paymentBlob.includes(String(o.order_code).toUpperCase())
  )

  const byAmount = pendingOrders.filter((o) => Number(o.total) === Number(amount))

  const match = byCode ?? (byAmount.length === 1 ? byAmount[0] : null)

  if (!match) {
    // Monto ambiguo entre varios pedidos pendientes: marcamos todos para
    // revisión manual en vez de arriesgar aprobar el pedido equivocado.
    if (byAmount.length > 1) {
      await service
        .from('orders')
        .update({ needs_manual_review: true })
        .in('id', byAmount.map((o) => o.id))
    }

    await service.from('notifications_log').insert({
      tenant_id: tenantId,
      order_id: null,
      channel: 'whatsapp',
      recipient: 'vendedor',
      subject: `Transferencia recibida sin match automático: $${amount} (pago MP ${payment.id})`,
      status: 'pending',
    })

    return {
      matched: false,
      reason: byAmount.length > 1 ? 'ambiguous_amount' : 'no_match',
    }
  }

  await service
    .from('orders')
    .update({
      payment_status: 'paid',
      status: 'confirmed',
      mp_payment_id: String(payment.id),
      needs_manual_review: false,
    })
    .eq('id', match.id)

  // Descuento de stock — mismo criterio que /api/mark-paid. Si el tenant tiene
  // "modo sin stock" activo, no tocar los números de inventario.
  const { data: cfg } = await service
    .from('store_config')
    .select('ignore_stock')
    .eq('tenant_id', tenantId)
    .single()

  if (!(cfg as any)?.ignore_stock) {
    const { data: items } = await service
      .from('order_items')
      .select('variant_id, quantity')
      .eq('order_id', match.id)

    if (items) {
      for (const item of items) {
        if (!item.variant_id || !item.quantity) continue
        const { data: variant } = await service
          .from('variants')
          .select('stock')
          .eq('id', item.variant_id)
          .single()
        if (variant != null) {
          const newStock = Math.max(0, (variant.stock ?? 0) - item.quantity)
          await service.from('variants').update({ stock: newStock }).eq('id', item.variant_id)
        }
      }
    }
  }

  await service.from('notifications_log').insert({
    tenant_id: tenantId,
    order_id: match.id,
    channel: 'whatsapp',
    recipient: 'pendiente',
    subject: `Transferencia confirmada automáticamente - Pedido ${match.order_code ?? match.id.slice(0, 6)}`,
    status: 'pending',
  })

  return {
    matched: true,
    order_id: match.id,
    reason: byCode ? 'matched_by_code' : 'matched_by_amount',
  }
}

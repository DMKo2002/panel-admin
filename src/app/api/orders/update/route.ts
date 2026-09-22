import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

interface EditedItem {
  variantId: string | null
  productName: string
  variantDesc: string | null
  quantity: number
  unitPrice: number
}

// Guarda de verdad los cambios hechos en el modal "Modificar pedido" — a
// diferencia del viejo EditOrderModal (que solo generaba un PDF corregido
// sin tocar la base), esto reemplaza order_items y recalcula subtotal/total.
// No manda ningún mail acá: el aviso al cliente quedó como tercera opción
// ("Notificar cambio de pedido") en UpdateOrderStatusButton, habilitada
// porque acá dejamos seteado items_edited_at — pedido de David, 2026-09-18.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: _userRows } = await supabase.from('users').select('tenant_id').eq('id', user.id).limit(1)
    const userRow = _userRows?.[0]
    if (!userRow?.tenant_id) return NextResponse.json({ error: 'Sin tenant' }, { status: 403 })

    const { orderId, items } = await req.json() as {
      orderId: string
      items: EditedItem[]
    }

    if (!orderId) return NextResponse.json({ error: 'orderId requerido' }, { status: 400 })
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'El pedido necesita al menos un producto' }, { status: 400 })
    }
    for (const it of items) {
      if (!it.productName || !it.productName.trim()) {
        return NextResponse.json({ error: 'Todos los productos necesitan un nombre' }, { status: 400 })
      }
      if (!Number.isInteger(it.quantity) || it.quantity <= 0) {
        return NextResponse.json({ error: `Cantidad inválida en "${it.productName}"` }, { status: 400 })
      }
      if (typeof it.unitPrice !== 'number' || Number.isNaN(it.unitPrice) || it.unitPrice < 0) {
        return NextResponse.json({ error: `Precio inválido en "${it.productName}"` }, { status: 400 })
      }
    }

    const service = createServiceClient()

    const { data: order } = await service
      .from('orders')
      .select('*, customers(full_name, email, type)')
      .eq('id', orderId)
      .eq('tenant_id', userRow.tenant_id)
      .single()

    if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

    const priceType = order.customers?.type === 'wholesale' ? 'wholesale' : 'retail'
    const subtotal = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0)
    const total = subtotal + (order.shipping_cost ?? 0)

    // Foto de portada por producto — mismo criterio que crear-pedido.ts
    // (tienda-core): se resuelve acá y se copia al item, no se calcula al
    // vuelo en el PDF. Si no se hace esto, el reemplazo de order_items de
    // abajo deja product_image_url en null y el recibo pierde las fotos de
    // los productos apenas se edita el pedido — bug reportado por David,
    // 2026-09-22.
    const variantIds = [...new Set(items.map(it => it.variantId).filter((v): v is string => !!v))]
    const productImageByVariant = new Map<string, string>()
    if (variantIds.length > 0) {
      const { data: variantRows } = await service
        .from('variants')
        .select('id, product_id')
        .in('id', variantIds)
      const productIds = [...new Set((variantRows ?? []).map((v: any) => v.product_id))]
      const { data: productImages } = await service
        .from('product_images')
        .select('product_id, url, is_cover, sort_order')
        .in('product_id', productIds)
        .order('sort_order', { ascending: true })
      const coverImageByProduct = new Map<string, string>()
      for (const img of (productImages ?? []) as any[]) {
        const current = coverImageByProduct.get(img.product_id)
        if (img.is_cover || !current) coverImageByProduct.set(img.product_id, img.url)
      }
      for (const v of (variantRows ?? []) as any[]) {
        const cover = coverImageByProduct.get(v.product_id)
        if (cover) productImageByVariant.set(v.id, cover)
      }
    }

    // Reemplazo completo de los items: más simple y confiable que hacer un
    // diff insert/update/delete, y el volumen por pedido es chico.
    const { error: deleteErr } = await service.from('order_items').delete().eq('order_id', orderId)
    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })

    const { error: insertErr } = await service.from('order_items').insert(
      items.map(it => ({
        order_id: orderId,
        variant_id: it.variantId ?? null,
        product_name: it.productName.trim(),
        variant_desc: it.variantDesc?.trim() || null,
        quantity: it.quantity,
        unit_price: it.unitPrice,
        price_type: priceType,
        product_image_url: (it.variantId && productImageByVariant.get(it.variantId)) ?? null,
      }))
    )
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

    const { error: updateErr } = await service.from('orders')
      .update({ subtotal, total, updated_at: new Date().toISOString(), items_edited_at: new Date().toISOString() })
      .eq('id', orderId)
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, subtotal, total })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

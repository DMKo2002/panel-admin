import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { renderToBuffer } from '@react-pdf/renderer'
import { ReciboPDF } from '@/components/ReciboPDF'
import React from 'react'

// Genera el recibo en PDF con cantidad/color/precio corregidos a mano —
// pensado para mayoristas cuyo stock publicado no coincide con el real
// (requerimiento de Caloria, existía en su WordPress anterior).
//
// A propósito NO escribe nada en la base: nunca toca `orders` ni
// `order_items`. Solo lee el pedido real (cliente, envío, método de pago)
// para el resto del recibo, y superpone los items con los valores editados
// que llegan en el body. Cada vez que se abre el editor vuelve a mostrar
// los datos originales del pedido — no hay nada que "revertir".
//
// Body:
// {
//   orderId: string,
//   items: Array<{ product_name: string, variant_desc?: string | null, quantity: number, unit_price: number }>
// }
export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const orderId: string | undefined = body?.orderId
  const items: any[] = Array.isArray(body?.items) ? body.items : []

  if (!orderId) return NextResponse.json({ error: 'Falta orderId' }, { status: 400 })
  if (items.length === 0) return NextResponse.json({ error: 'El pedido necesita al menos un producto' }, { status: 400 })

  for (const it of items) {
    if (!it.product_name || typeof it.product_name !== 'string') {
      return NextResponse.json({ error: 'Cada producto necesita un nombre' }, { status: 400 })
    }
    if (!Number.isInteger(it.quantity) || it.quantity <= 0) {
      return NextResponse.json({ error: `Cantidad inválida para "${it.product_name}"` }, { status: 400 })
    }
    if (typeof it.unit_price !== 'number' || it.unit_price < 0 || Number.isNaN(it.unit_price)) {
      return NextResponse.json({ error: `Precio inválido para "${it.product_name}"` }, { status: 400 })
    }
  }

  const service = createServiceClient()

  const { data: _userRows } = await service.from('users').select('tenant_id').eq('id', user.id).limit(1)
  const tenantId = _userRows?.[0]?.tenant_id
  if (!tenantId) return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 })

  // Solo lectura — verifica que el pedido es de este tenant y trae los
  // datos que no se editan (cliente, envío, método de pago, etc.)
  const { data: order, error: orderError } = await service
    .from('orders')
    .select(`*, customers (full_name, last_name, email, phone, cuit, address_street, address_city, address_province, address_zip)`)
    .eq('id', orderId).eq('tenant_id', tenantId).single()

  if (orderError || !order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

  const { data: tenant } = await service.from('tenants').select('name').eq('id', tenantId).single()
  const { data: config } = await service
    .from('store_config')
    .select('logo_url, notification_email, whatsapp_number, transfer_cbu, transfer_alias, store_address, pdf_show_variant, pdf_show_pricetype, pdf_show_address, pdf_show_notes')
    .eq('tenant_id', tenantId).single()
  const cfg = config as any

  const editedItems = items.map((it, i) => ({
    id: `edit-${i}`,
    product_name: it.product_name,
    variant_desc: it.variant_desc ?? null,
    quantity: it.quantity,
    unit_price: it.unit_price,
    subtotal: it.quantity * it.unit_price,
  }))
  const newSubtotal = editedItems.reduce((sum, i) => sum + i.subtotal, 0)
  const newTotal = newSubtotal + Number(order.shipping_cost ?? 0)

  const orderForPdf = { ...order, order_items: editedItems, subtotal: newSubtotal, total: newTotal }

  const pdfBuffer = await renderToBuffer(
    React.createElement(ReciboPDF, {
      order: orderForPdf,
      storeName: tenant?.name ?? 'Tienda',
      storeEmail: cfg?.notification_email ?? '',
      storeWhatsapp: cfg?.whatsapp_number ?? '',
      storeCbu: cfg?.transfer_cbu ?? '',
      storeAlias: cfg?.transfer_alias ?? '',
      storeAddress: cfg?.store_address ?? '',
      pdfShowVariant:   cfg?.pdf_show_variant   ?? true,
      pdfShowPricetype: cfg?.pdf_show_pricetype ?? true,
      pdfShowAddress:   cfg?.pdf_show_address   ?? true,
      pdfShowNotes:     cfg?.pdf_show_notes     ?? true,
    }) as any
  )

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="recibo-${orderId.slice(0, 6)}-editado.pdf"`,
    },
  })
}

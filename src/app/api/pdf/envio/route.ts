import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { renderToBuffer } from '@react-pdf/renderer'
import { EtiquetaEnvioPDF } from '@/components/EtiquetaEnvioPDF'
import React from 'react'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const orderId = searchParams.get('order_id')

    if (!orderId) {
      return NextResponse.json({ error: 'order_id requerido' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`*, customers (*), order_items (*)`)
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    }

    const { data: tenant } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', order.tenant_id)
      .single()

    const { data: config } = await supabase
      .from('store_config')
      .select('store_address, whatsapp_number, weight_unit, dimension_unit')
      .eq('tenant_id', order.tenant_id)
      .single()

    const cfg = config as any

    // Peso y medidas de cada producto del pedido. Viven en `products`, y
    // desde el pedido solo se llega por order_items.variant_id -> variants
    // .product_id -> products. Hasta ahora esta consulta no existía: el
    // tenant podía cargar dimensiones y peso en Catálogo pero la etiqueta de
    // envío nunca los leía, así que no aparecían por ningún lado.
    const variantIds = (order.order_items ?? [])
      .map((it: any) => it.variant_id)
      .filter(Boolean)

    // variantId -> { width, length, height, weight }
    const dimsByVariant: Record<string, any> = {}
    if (variantIds.length > 0) {
      const { data: variantRows } = await supabase
        .from('variants')
        .select('id, products (width_cm, length_cm, height_cm, weight_kg)')
        .in('id', variantIds)
      for (const v of variantRows ?? []) {
        const p: any = Array.isArray((v as any).products) ? (v as any).products[0] : (v as any).products
        if (!p) continue
        dimsByVariant[(v as any).id] = {
          width:  p.width_cm,
          length: p.length_cm,
          height: p.height_cm,
          weight: p.weight_kg,
        }
      }
    }

    const pdfBuffer = await renderToBuffer(
      React.createElement(EtiquetaEnvioPDF, {
        order,
        storeName:      tenant?.name ?? 'Tienda',
        storeAddress:   cfg?.store_address   ?? '',
        storeWhatsapp:  cfg?.whatsapp_number ?? '',
        dimsByVariant,
        weightUnit:     cfg?.weight_unit    ?? 'kg',
        dimensionUnit:  cfg?.dimension_unit ?? 'cm',
      }) as any
    )

    const mode = searchParams.get('mode') ?? 'inline'
    const disposition = mode === 'download'
      ? `attachment; filename="envio-${orderId.slice(0, 6)}.pdf"`
      : `inline; filename="envio-${orderId.slice(0, 6)}.pdf"`

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': disposition,
      },
    })

  } catch (error: any) {
    console.error('Error generando etiqueta:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

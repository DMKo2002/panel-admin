import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { renderToBuffer } from '@react-pdf/renderer'
import { ReciboPDF } from '@/components/ReciboPDF'
import React from 'react'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const orderId = searchParams.get('order_id')

    if (!orderId) {
      return NextResponse.json({ error: 'order_id requerido' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Cargar orden completa con items y cliente
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        customers (full_name, last_name, email, phone, cuit, address_street, address_city, address_province, address_zip),
        order_items (*)
      `)
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    }

    // Marca el pedido como "recibo impreso" (solo la primera vez) para que
    // el panel de Pedidos resalte la fila en verde. No debe frenar la
    // descarga del PDF si falla — es solo un dato informativo.
    if (!order.receipt_printed_at) {
      supabase
        .from('orders')
        .update({ receipt_printed_at: new Date().toISOString() })
        .eq('id', orderId)
        .then(({ error }) => {
          if (error) console.error('[pdf] no se pudo marcar receipt_printed_at:', error.message)
        })
    }

    // Cargar datos de la tienda
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', order.tenant_id)
      .single()

    const { data: config } = await supabase
      .from('store_config')
      .select('logo_url, notification_email, whatsapp_number, transfer_cbu, transfer_alias, store_address, pdf_show_variant, pdf_show_pricetype, pdf_show_address, pdf_show_notes')
      .eq('tenant_id', order.tenant_id)
      .single()

    const cfg = config as any

    // Generar PDF
    const pdfBuffer = await renderToBuffer(
      React.createElement(ReciboPDF, {
        order,
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

    const mode = searchParams.get('mode') ?? 'inline'
    const disposition = mode === 'download'
      ? `attachment; filename="recibo-${orderId.slice(0, 6)}.pdf"`
      : `inline; filename="recibo-${orderId.slice(0, 6)}.pdf"`

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': disposition,
      },
    })

  } catch (error: any) {
    console.error('Error generando PDF:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

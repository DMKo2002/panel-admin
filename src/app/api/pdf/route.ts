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
        customers (full_name, email, phone, address_street, address_city, address_province, address_zip),
        order_items (*)
      `)
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    }

    // Cargar datos de la tienda
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', order.tenant_id)
      .single()

    const { data: config } = await supabase
      .from('store_config')
      .select('logo_url, notification_email, whatsapp_number, transfer_cbu, transfer_alias')
      .eq('tenant_id', order.tenant_id)
      .single()

    // Generar PDF
    const pdfBuffer = await renderToBuffer(
      React.createElement(ReciboPDF, {
        order,
        storeName: tenant?.name ?? 'Tienda',
        storeEmail: config?.notification_email ?? '',
        storeWhatsapp: config?.whatsapp_number ?? '',
        storeCbu: config?.transfer_cbu ?? '',
        storeAlias: config?.transfer_alias ?? '',
      }) as any
    )

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="recibo-${orderId.slice(0, 6)}.pdf"`,
      },
    })

  } catch (error: any) {
    console.error('Error generando PDF:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

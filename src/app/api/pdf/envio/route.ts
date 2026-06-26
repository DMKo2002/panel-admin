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
      .select('store_address, whatsapp_number')
      .eq('tenant_id', order.tenant_id)
      .single()

    const cfg = config as any

    const pdfBuffer = await renderToBuffer(
      React.createElement(EtiquetaEnvioPDF, {
        order,
        storeName:      tenant?.name ?? 'Tienda',
        storeAddress:   cfg?.store_address   ?? '',
        storeWhatsapp:  cfg?.whatsapp_number ?? '',
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

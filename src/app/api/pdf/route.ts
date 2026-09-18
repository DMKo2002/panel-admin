import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { generateReciboPdfBuffer } from '@/lib/generateReciboPdf'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const orderId = searchParams.get('order_id')

    if (!orderId) {
      return NextResponse.json({ error: 'order_id requerido' }, { status: 400 })
    }

    const pdfBuffer = await generateReciboPdfBuffer(orderId)

    if (!pdfBuffer) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    }

    // Marca el pedido como "recibo impreso" (solo la primera vez) para que
    // el panel de Pedidos resalte la fila en verde. No debe frenar la
    // descarga del PDF si falla — es solo un dato informativo.
    const supabase = createServiceClient()
    const { data: order } = await supabase.from('orders').select('receipt_printed_at').eq('id', orderId).single()
    if (order && !order.receipt_printed_at) {
      supabase
        .from('orders')
        .update({ receipt_printed_at: new Date().toISOString() })
        .eq('id', orderId)
        .then(({ error }) => {
          if (error) console.error('[pdf] no se pudo marcar receipt_printed_at:', error.message)
        })
    }

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

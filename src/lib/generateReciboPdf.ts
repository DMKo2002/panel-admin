import { createServiceClient } from '@/lib/supabase/service'
import { renderToBuffer } from '@react-pdf/renderer'
import { ReciboPDF } from '@/components/ReciboPDF'
import React from 'react'

// Generación del PDF de recibo como buffer reutilizable — factorizado desde
// /api/pdf/route.ts (2026-09-18) para poder adjuntar el mismo PDF a los
// mails de "pedido enviado / listo para retirar" sin duplicar la lógica de
// carga de datos. La ruta /api/pdf sigue siendo la única que marca
// receipt_printed_at (es un dato sobre que alguien lo vio/descargó desde el
// panel, no sobre que se haya generado internamente para un mail).
export async function generateReciboPdfBuffer(orderId: string): Promise<Buffer | null> {
  const supabase = createServiceClient()

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select(`
      *,
      customers (full_name, last_name, email, phone, cuit, address_street, address_city, address_province, address_zip),
      order_items (*)
    `)
    .eq('id', orderId)
    .single()

  if (orderError || !order) return null

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

  return pdfBuffer
}

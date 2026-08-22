// POST /api/superadmin/update-billing-settings — edita la fila única de
// platform_billing_settings (id=1). Ver /superadmin/pagos y la migración
// platform_billing_settings (2026-08-22).
//
// Mismo patrón de gate + service client que el resto de /api/superadmin/*
// (ver mark-plan-paid/route.ts, update-tenant/route.ts).

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/superadmin'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isSuperAdmin(user.email)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const body = await req.json()
  const {
    manual_transfer_enabled,
    mercadopago_enabled,
    transfer_cbu,
    transfer_alias,
    whatsapp_number,
    contact_email,
  } = body

  if (typeof manual_transfer_enabled !== 'boolean' || typeof mercadopago_enabled !== 'boolean') {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }
  if (typeof contact_email !== 'string' || !contact_email.trim()) {
    return NextResponse.json({ error: 'Falta el email de contacto' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service
    .from('platform_billing_settings')
    .update({
      manual_transfer_enabled,
      mercadopago_enabled,
      transfer_cbu: typeof transfer_cbu === 'string' ? (transfer_cbu.trim() || null) : null,
      transfer_alias: typeof transfer_alias === 'string' ? (transfer_alias.trim() || null) : null,
      whatsapp_number: typeof whatsapp_number === 'string' ? (whatsapp_number.trim() || null) : null,
      contact_email: contact_email.trim(),
      updated_at: new Date().toISOString(),
      updated_by: user.email ?? null,
    })
    .eq('id', 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

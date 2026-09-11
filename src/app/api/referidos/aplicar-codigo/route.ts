// POST /api/referidos/aplicar-codigo — carga un código de invitación DESPUÉS
// del registro (2026-09-11, pedido de David en QA: el código solo se podía
// cargar en /registro; quien empezó el trial sin código, o a quien no le
// funcionó por algún motivo, no tenía forma de sumarlo más tarde). Pensado
// para usarse desde la pantalla de pago (SuscripcionSelector.tsx) justo
// antes de suscribirse, así el 20% queda confirmado ahí mismo, no aplicado
// en silencio. Solo mientras el tenant todavía no pagó por primera vez
// (plan_status !== 'active') y todavía no tiene un código cargado — no
// reemplaza uno ya puesto, y no aplica descuentos retroactivos a un pago ya
// confirmado.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const service = createServiceClient()
  const { data: userRows } = await service.from('users').select('tenant_id, role').eq('id', user.id).limit(1)
  const userRow = userRows?.[0]
  if (!userRow?.tenant_id) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
  if (userRow.role === 'staff') return NextResponse.json({ error: 'Solo el owner puede cargar un código de invitación' }, { status: 403 })
  const tenantId = userRow.tenant_id

  const body = await req.json().catch(() => ({}))
  const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : ''
  if (!code) return NextResponse.json({ error: 'Ingresá un código.' }, { status: 400 })

  const { data: tenantRows } = await service
    .from('tenants')
    .select('referred_by, plan_status')
    .eq('id', tenantId)
    .limit(1)
  const tenant = tenantRows?.[0]
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

  if (tenant.referred_by) {
    return NextResponse.json({ error: 'Ya tenés un código de invitación cargado.' }, { status: 400 })
  }
  if (tenant.plan_status === 'active') {
    return NextResponse.json({ error: 'Ya hiciste tu primer pago — no se puede aplicar un código nuevo después.' }, { status: 400 })
  }

  const { data: foundRows } = await service
    .from('tenants')
    .select('id, name')
    .eq('referral_code', code)
    .limit(1)
  const found = foundRows?.[0]
  if (!found || found.id === tenantId) {
    return NextResponse.json({ error: 'Código inválido.' }, { status: 400 })
  }

  // Guard contra carrera: solo aplica si sigue sin referred_by (por si esto
  // se llamó dos veces casi al mismo tiempo).
  const { data: updatedRows } = await service
    .from('tenants')
    .update({ referred_by: found.id })
    .eq('id', tenantId)
    .is('referred_by', null)
    .select('id')
  if (!updatedRows || updatedRows.length === 0) {
    return NextResponse.json({ error: 'Ya tenés un código de invitación cargado.' }, { status: 400 })
  }

  return NextResponse.json({ ok: true, tiendaName: found.name })
}

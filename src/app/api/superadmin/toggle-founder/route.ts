// POST /api/superadmin/toggle-founder — marca/desmarca a mano un tenant como
// "Founder" (promoción 2026-08-24 para los primeros 50 clientes reales:
// precio Business para siempre, límites de uso de Premium — ver
// getPlanForTenant en lib/plans.ts).
//
// Asignación 100% manual desde /superadmin, nunca automática por orden de
// alta — así David/Aram pueden excluir a mano cuentas de prueba/demo, y
// también marcar retroactivamente tenants reales que ya estaban de antes.
// El cupo de 50 se valida acá server-side (bloquea activar un founder #51,
// pero SIEMPRE permite desactivar, incluso si por algún motivo hubiera más
// de 50 marcados).
//
// Al activar, además fijamos plan = 'standard': la promesa es "precio
// Business para siempre", así que un Founder no puede quedar con precio de
// Mini o Premium por un cambio de plan posterior sin querer — el límite
// ampliado (Premium) lo aporta is_founder, nunca el campo plan. Al
// desactivar NO tocamos el plan (vuelve a pagar el precio normal de
// cualquier plan en el que haya quedado).
//
// Requiere la migración founder_migration.sql aplicada.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { isSuperAdmin } from '@/lib/superadmin'

// No exportado: Next.js solo permite exports específicos (GET/POST/config)
// desde un route.ts — cualquier otro export rompe el build ("is not a valid
// Route export field"). El cliente (SuperadminClient.tsx) tiene su propia
// copia de este mismo número para el contador — si este valor cambia, hay
// que actualizar los dos.
const FOUNDER_LIMIT = 50

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isSuperAdmin(user.email)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { tenantId, isFounder } = await req.json()
  if (!tenantId) return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 })
  if (typeof isFounder !== 'boolean') {
    return NextResponse.json({ error: 'isFounder requerido (boolean)' }, { status: 400 })
  }

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  if (isFounder) {
    // Cupo duro de 50 — cuenta a todos los OTROS tenants ya marcados (si este
    // tenant ya era founder, el toggle es un no-op y no debe bloquearse a sí
    // mismo).
    const { count, error: countError } = await serviceClient
      .from('tenants')
      .select('id', { count: 'exact', head: true })
      .eq('is_founder', true)
      .neq('id', tenantId)
    if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })
    if ((count ?? 0) >= FOUNDER_LIMIT) {
      return NextResponse.json(
        { error: `Ya hay ${FOUNDER_LIMIT} Founders marcados — el cupo está completo.` },
        { status: 400 }
      )
    }

    const { error } = await serviceClient
      .from('tenants')
      .update({
        is_founder: true,
        founder_marked_at: new Date().toISOString(),
        founder_marked_by: user.email ?? null,
        plan: 'standard',
      })
      .eq('id', tenantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await serviceClient
      .from('tenants')
      .update({ is_founder: false, founder_marked_at: null, founder_marked_by: null })
      .eq('id', tenantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { count: foundersCount } = await serviceClient
    .from('tenants')
    .select('id', { count: 'exact', head: true })
    .eq('is_founder', true)

  return NextResponse.json({ ok: true, isFounder, foundersCount: foundersCount ?? 0 })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { isSuperAdmin } from '@/lib/superadmin'
import { cancelPreapprovalIfActive, findActivePreapprovalIdsForTenant } from '@/lib/billing'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isSuperAdmin(user.email)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { tenantId } = await req.json()
  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 })
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Cancelar el débito automático de Mercado Pago ANTES de borrar (2026-09-29,
  // incidente: un tenant de prueba borrado seguía cobrando $20/mes porque el
  // preapproval vive en MP y borrar la fila no lo toca -- y al borrarla se
  // pierde el id). Si no se puede cancelar, NO se borra: mejor una tienda de
  // más que un cobro a alguien que ya no tiene servicio.
  const { data: _tenantRows } = await service
    .from('tenants').select('name, mp_preapproval_id').eq('id', tenantId).limit(1)
  const tenantRow = _tenantRows?.[0]
  if (!tenantRow) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

  const preapprovalIds = new Set<string>()
  if (tenantRow.mp_preapproval_id) preapprovalIds.add(tenantRow.mp_preapproval_id)

  // Suscripciones viejas del mismo tenant que ya no están guardadas en la
  // fila (best-effort: si la búsqueda falla se sigue con el id guardado y
  // se avisa en la respuesta; el webhook igual cancela cobros huérfanos).
  let warning: string | undefined
  if (process.env.GOUNURI_MP_ACCESS_TOKEN) {
    try {
      for (const id of await findActivePreapprovalIdsForTenant(tenantId)) preapprovalIds.add(id)
    } catch (e) {
      console.error('[delete-tenant] no se pudo buscar preapprovals extra en MP', e)
      warning = 'No se pudo buscar otras suscripciones de esta tienda en Mercado Pago. Revisalas a mano.'
    }
  }

  let cancelled = 0
  for (const id of preapprovalIds) {
    try {
      const outcome = await cancelPreapprovalIfActive(id)
      if (outcome === 'cancelled') cancelled++
    } catch (e) {
      console.error('[delete-tenant] no se pudo cancelar el preapproval', id, e)
      return NextResponse.json({
        error: `No se pudo cancelar el débito automático en Mercado Pago (suscripción ${id}). La tienda NO se borró. Probá de nuevo o cancelala a mano en MP.`,
      }, { status: 502 })
    }
  }

  // Borrar tenant — cascadea a store_config, products, orders, etc.
  const { error } = await service.from('tenants').delete().eq('id', tenantId)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, preapprovalsCancelled: cancelled, ...(warning ? { warning } : {}) })
}

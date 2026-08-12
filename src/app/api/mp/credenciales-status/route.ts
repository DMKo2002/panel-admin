// GET /api/mp/credenciales-status — indica si el tenant ya tiene un Access
// Token de MercadoPago cargado, SIN exponer el valor real al navegador.
//
// mp_access_token es una columna sensible: da control total sobre la cuenta
// de cobro del tenant. Desde 2026-08-11 el rol "authenticated" ya no tiene
// permiso de SELECT sobre esta columna a nivel de base de datos (ver revoke
// en store_config) — así que cualquier lectura tiene que pasar por acá, con
// el service client, nunca con el cliente normal del navegador.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const service = createServiceClient()
  const { data: _userRows } = await service.from('users').select('tenant_id').eq('id', user.id).limit(1)
  const tenantId = _userRows?.[0]?.tenant_id
  if (!tenantId) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

  const { data: _rows } = await service
    .from('store_config')
    .select('mp_access_token')
    .eq('tenant_id', tenantId)
    .limit(1)

  const conectado = Boolean(_rows?.[0]?.mp_access_token)
  return NextResponse.json({ conectado })
}

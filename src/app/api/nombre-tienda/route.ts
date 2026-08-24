// POST /api/nombre-tienda — el dueño de la tienda edita el nombre que se
// muestra en el Panel Admin (sidebar) y en tenants.name.
//
// Antes no existía NINGUNA forma de editar esto desde el propio Panel
// Admin — solo Superadmin podía renombrar una tienda (ver
// /api/superadmin/update-tenant). Agregado 2026-08-24 a pedido de David,
// justo después de que un bug de permisos (ver founder_permissions_migration.sql)
// hiciera que el nombre cayera al fallback "Mi tienda" para todos y dejara
// en evidencia que no había ningún lápiz para arreglarlo a mano.
//
// Mismo patrón de auth que /api/dominio: service client (evita cualquier
// lío de GRANTs por columna como el de is_founder) + bloquea staff (solo el
// dueño puede renombrar su tienda, no el personal).

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const MAX_LEN = 60

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const service = createServiceClient()
  const { data: _userRows } = await service.from('users').select('tenant_id, role').eq('id', user.id).limit(1)
  const userRow = _userRows?.[0]
  if (!userRow?.tenant_id) return NextResponse.json({ error: 'No se encontró el tenant' }, { status: 404 })
  if (userRow.role === 'staff') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { name } = await req.json().catch(() => ({}))
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (!trimmed) return NextResponse.json({ error: 'El nombre no puede estar vacío' }, { status: 400 })
  if (trimmed.length > MAX_LEN) {
    return NextResponse.json({ error: `El nombre no puede tener más de ${MAX_LEN} caracteres` }, { status: 400 })
  }

  const { error } = await service.from('tenants').update({ name: trimmed }).eq('id', userRow.tenant_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, name: trimmed })
}

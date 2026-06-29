import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { isSuperAdmin } from '@/lib/superadmin'

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

  // Borrar tenant — cascadea a store_config, products, orders, etc.
  const { error } = await service.from('tenants').delete().eq('id', tenantId)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

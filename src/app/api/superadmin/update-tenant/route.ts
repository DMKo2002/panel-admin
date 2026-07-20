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

  const { tenantId, name, template } = await req.json()
  if (!tenantId || (!name?.trim() && !template)) {
    return NextResponse.json({ error: 'Datos requeridos' }, { status: 400 })
  }

  const validTemplates = ['minimalista', 'mono', 'atelier', 'axis']
  if (template && !validTemplates.includes(template)) {
    return NextResponse.json({ error: 'Template inválido' }, { status: 400 })
  }

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const patch: Record<string, string> = {}
  if (name?.trim()) patch.name = name.trim()
  if (template) patch.template = template

  const { error } = await serviceClient
    .from('tenants')
    .update(patch)
    .eq('id', tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

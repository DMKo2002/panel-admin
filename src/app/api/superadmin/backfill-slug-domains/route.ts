// POST — backfill único: da de alta {slug}.gounuri.com en Vercel para todos
// los tenants existentes que todavía no lo tienen (bug encontrado 2026-08-12,
// ver lib/vercel.ts y api/create-tenant/route.ts — de acá en más los tenants
// nuevos ya se dan de alta solos, esto es solo para los que se crearon antes
// del fix). Idempotente: correrlo de nuevo no rompe nada, los que ya están
// dados de alta simplemente se saltan sin error.

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { isSuperAdmin } from '@/lib/superadmin'
import { addDomainToProject } from '@/lib/vercel'

export async function POST() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isSuperAdmin(user.email)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: tenants, error } = await serviceClient
    .from('tenants')
    .select('id, slug, name, template')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const resultados: { tenant: string; ok: boolean; detalle?: string }[] = []
  for (const t of tenants ?? []) {
    try {
      await addDomainToProject(t.template ?? 'minimalista', `${t.slug}.gounuri.com`)
      resultados.push({ tenant: `${t.name} (${t.slug})`, ok: true })
    } catch (e) {
      resultados.push({ tenant: `${t.name} (${t.slug})`, ok: false, detalle: e instanceof Error ? e.message : String(e) })
    }
  }

  return NextResponse.json({
    ok: true,
    total: resultados.length,
    exitosos: resultados.filter(r => r.ok).length,
    fallidos: resultados.filter(r => !r.ok),
  })
}

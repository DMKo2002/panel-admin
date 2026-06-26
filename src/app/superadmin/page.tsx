import { createClient } from '@supabase/supabase-js'
import SuperadminClient, { TenantRow } from './SuperadminClient'

// URLs de los deployments por template (para tenants sin dominio propio)
const TEMPLATE_URLS: Record<string, string> = {
  default: process.env.NEXT_PUBLIC_PREVIEW_URL_MINIMALISTA ?? '',
  mono:    process.env.NEXT_PUBLIC_PREVIEW_URL_MONO        ?? '',
  atelier: process.env.NEXT_PUBLIC_PREVIEW_URL_ATELIER     ?? '',
  axis:    process.env.NEXT_PUBLIC_PREVIEW_URL_AXIS        ?? '',
}

export default async function SuperadminPage() {
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Traer todos los tenants
  const { data: tenants } = await serviceClient
    .from('tenants')
    .select('id, name, slug, domain, template, status')
    .order('created_at', { ascending: false })

  // Traer owners (role = owner) de cada tenant
  const { data: users } = await serviceClient
    .from('users')
    .select('tenant_id, email')
    .eq('role', 'owner')

  const ownerByTenant = Object.fromEntries(
    (users ?? []).map(u => [u.tenant_id, u.email])
  )

  const rows: TenantRow[] = (tenants ?? []).map(t => ({
    id:          t.id,
    name:        t.name,
    slug:        t.slug,
    domain:      t.domain ?? null,
    template:    t.template ?? 'default',
    status:      t.status,
    ownerEmail:  ownerByTenant[t.id] ?? null,
    frontendUrl: t.domain
      ? `https://${t.domain}`
      : (TEMPLATE_URLS[t.template ?? 'default'] || null),
  }))

  return <SuperadminClient initialTenants={rows} />
}

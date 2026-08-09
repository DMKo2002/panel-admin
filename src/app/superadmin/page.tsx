import { createClient } from '@supabase/supabase-js'
import SuperadminClient, { TenantRow } from './SuperadminClient'

// URLs de los deployments por template (para tenants sin dominio propio)
const TEMPLATE_URLS: Record<string, string> = {
  minimalista: process.env.NEXT_PUBLIC_PREVIEW_URL_MINIMALISTA ?? '',
  mono:        process.env.NEXT_PUBLIC_PREVIEW_URL_MONO        ?? '',
  atelier:     process.env.NEXT_PUBLIC_PREVIEW_URL_ATELIER     ?? '',
  axis:        process.env.NEXT_PUBLIC_PREVIEW_URL_AXIS        ?? '',
}

export default async function SuperadminPage() {
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Mes actual — mismo criterio que src/lib/usage.ts (getTenantUsage) para
  // que "Visitas" y "Pedidos" acá coincidan con lo que cada tenant ve en su
  // propio "Plan y uso".
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthKey = monthStart.toISOString().slice(0, 10)

  // Vista agregada de superadmin: todo en consultas en bloque (nunca una por
  // tenant) para que esto siga andando rápido aunque haya cientos de tenants.
  // isSuperAdmin ya bloquea el acceso a esta ruta en superadmin/layout.tsx —
  // acá no hay ningún chequeo de plan: un tenant en Business Standard sin
  // acceso a Google Analytics en SU panel igual aparece acá con sus datos.
  const [
    { data: tenants },
    { data: users },
    { data: visitsRows },
    { data: orderRows },
    { data: configRows },
  ] = await Promise.all([
    serviceClient.from('tenants').select('id, name, slug, domain, template, status, plan').order('created_at', { ascending: false }),
    serviceClient.from('users').select('tenant_id, email').eq('role', 'owner'),
    serviceClient.from('tenant_visits').select('tenant_id, count').eq('month', monthKey),
    serviceClient.from('orders').select('tenant_id').gte('created_at', monthStart.toISOString()),
    serviceClient.from('store_config').select('tenant_id, ga4_measurement_id'),
  ])

  const ownerByTenant = Object.fromEntries(
    (users ?? []).map(u => [u.tenant_id, u.email])
  )
  const visitsByTenant = Object.fromEntries(
    (visitsRows ?? []).map(v => [v.tenant_id, Number((v as any).count ?? 0)])
  )
  const ga4ByTenant = Object.fromEntries(
    (configRows ?? []).map(c => [c.tenant_id, !!(c as any).ga4_measurement_id])
  )
  const orderCountByTenant: Record<string, number> = {}
  for (const o of orderRows ?? []) {
    orderCountByTenant[o.tenant_id] = (orderCountByTenant[o.tenant_id] ?? 0) + 1
  }

  const rows: TenantRow[] = (tenants ?? []).map(t => ({
    id:          t.id,
    name:        t.name,
    slug:        t.slug,
    domain:      t.domain ?? null,
    template:    t.template ?? 'minimalista',
    status:      t.status,
    plan:        t.plan ?? 'basic',
    ownerEmail:  ownerByTenant[t.id] ?? null,
    frontendUrl: t.domain
      ? `https://${t.domain}`
      : (TEMPLATE_URLS[t.template ?? 'minimalista'] || null),
    visitCount:  visitsByTenant[t.id] ?? 0,
    orderCount:  orderCountByTenant[t.id] ?? 0,
    ga4Linked:   ga4ByTenant[t.id] ?? false,
  }))

  return <SuperadminClient initialTenants={rows} />
}

import { createClient } from '@supabase/supabase-js'
import SuperadminClient, { TenantRow } from './SuperadminClient'

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
    serviceClient.from('tenants').select('id, name, slug, domain, template, status, plan, plan_status, suspended_reason').order('created_at', { ascending: false }),
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
    // Deuda = pago pendiente vigente, sea que la tienda siga activa (gracia)
    // o ya se haya suspendido por eso — el resto de las suspensiones
    // (trial vencido, exceso de cupo) no son "deuda" de pago.
    debe: t.plan_status === 'past_due' || (t.status === 'suspended' && t.suspended_reason === 'payment_failed'),
    ownerEmail:  ownerByTenant[t.id] ?? null,
    // La dirección real del tenant siempre es {slug}.gounuri.com de fallback
    // (o su dominio propio si tiene uno) — antes acá se mostraba una URL fija
    // de preview por template (*.vercel.app), que no correspondía a ESE
    // tenant en particular. Ver bug de dominios del 2026-08-12.
    frontendUrl: t.domain ? `https://${t.domain}` : `https://${t.slug}.gounuri.com`,
    visitCount:  visitsByTenant[t.id] ?? 0,
    orderCount:  orderCountByTenant[t.id] ?? 0,
    ga4Linked:   ga4ByTenant[t.id] ?? false,
  }))

  return <SuperadminClient initialTenants={rows} />
}

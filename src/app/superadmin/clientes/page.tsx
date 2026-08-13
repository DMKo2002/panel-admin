import { createClient } from '@supabase/supabase-js'
import ClientesClient, { GounuriAccountRow } from './ClientesClient'

// Superadmin > Clientes Gounuri — gente que se registró en gounuri.com para
// crear su propia tienda (gounuri_accounts), separado de la vista de
// "Tenants" (que lista las tiendas ya creadas). Acá se ve el registro
// completo, hayan terminado el onboarding (creado un tenant) o no.
export default async function ClientesGounuriPage() {
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [{ data: accounts }, { data: tenants }] = await Promise.all([
    serviceClient
      .from('gounuri_accounts')
      .select('id, nombre, apellido, dni, celular, email, store_name, tenant_id, confirmed_at, created_at')
      .order('created_at', { ascending: false }),
    serviceClient.from('tenants').select('id, slug, domain, status'),
  ])

  const tenantById = Object.fromEntries((tenants ?? []).map(t => [t.id, t]))

  const rows: GounuriAccountRow[] = (accounts ?? []).map(a => {
    const tenant = a.tenant_id ? tenantById[a.tenant_id] : null
    return {
      id: a.id,
      nombre: a.nombre,
      apellido: a.apellido,
      dni: a.dni,
      celular: a.celular,
      email: a.email,
      storeName: a.store_name,
      confirmado: !!a.confirmed_at,
      createdAt: a.created_at,
      tiendaUrl: tenant ? `https://${tenant.domain ?? `${tenant.slug}.gounuri.com`}` : null,
      tiendaStatus: tenant?.status ?? null,
    }
  })

  return <ClientesClient initialAccounts={rows} />
}

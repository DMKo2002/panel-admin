import { createClient } from '@supabase/supabase-js'
import ClientesClient, { GounuriAccountRow } from './ClientesClient'

// Superadmin > Clientes Gounuri — 2026-08-13: se unificó la info del dueño
// (nombre/DNI/celular) directo en la columna Owner de /superadmin (Tenants),
// así que esta pantalla ya no duplica esos datos. Lo que queda acá son los
// que se registraron en gounuri.com pero TODAVÍA no terminaron el onboarding
// (no crearon tenant) — sirve como lista de leads para mailing/marketing,
// sin perder el registro aunque nunca lleguen a tener tienda.
export default async function ClientesGounuriPage() {
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: accounts } = await serviceClient
    .from('gounuri_accounts')
    .select('id, nombre, apellido, dni, celular, email, store_name, confirmed_at, created_at')
    .is('tenant_id', null)
    .order('created_at', { ascending: false })

  const rows: GounuriAccountRow[] = (accounts ?? []).map(a => ({
    id: a.id,
    nombre: a.nombre,
    apellido: a.apellido,
    dni: a.dni,
    celular: a.celular,
    email: a.email,
    storeName: a.store_name,
    confirmado: !!a.confirmed_at,
    createdAt: a.created_at,
  }))

  return <ClientesClient initialAccounts={rows} />
}

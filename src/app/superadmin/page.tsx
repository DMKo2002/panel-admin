import { createClient } from '@supabase/supabase-js'
import SuperadminClient, { TenantRow } from './SuperadminClient'
import { getPlanForTenant } from '@/lib/plans'

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
  //
  // 2026-08-18: se agregó productCount + storageBytes (columna "Uso") — la
  // idea es tener acá, consolidado entre todos los tenants, el mismo
  // parámetro de consumo real que antes cada uno veía solo en su propio
  // "Plan y uso" (ver dashboard/uso, ahora redirect) para poder calibrar
  // mejor los límites de cada plan con datos de todos juntos en vez de
  // tienda por tienda. productCount usa el mismo criterio "traer todas las
  // filas de la columna y contar en JS" que ya usa orderCount acá abajo —
  // storageBytes necesita sí o sí una RPC bulk (tenant_storage_bytes_all)
  // porque storage.objects no es accesible via PostgREST directo.
  const [
    { data: tenants },
    { data: users },
    { data: visitsRows },
    { data: orderRows },
    { data: productRows },
    { data: storageRows, error: storageError },
    { data: configRows },
    { data: accounts },
  ] = await Promise.all([
    serviceClient.from('tenants').select('id, name, slug, domain, template, status, plan, plan_status, suspended_reason, manual_payment_note, manual_payment_at, manual_payment_by, manual_payment_term, manual_payment_amount, manual_paid_until, trial_ends_at').order('created_at', { ascending: false }),
    serviceClient.from('users').select('tenant_id, email').eq('role', 'owner'),
    serviceClient.from('tenant_visits').select('tenant_id, count').eq('month', monthKey),
    serviceClient.from('orders').select('tenant_id').gte('created_at', monthStart.toISOString()),
    serviceClient.from('products').select('tenant_id'),
    serviceClient.rpc('tenant_storage_bytes_all'),
    serviceClient.from('store_config').select('tenant_id, ga4_measurement_id'),
    // Datos personales del dueño (gounuri_accounts) — unificados acá en vez
    // de una pantalla aparte, para ver tienda + persona en una sola fila.
    serviceClient.from('gounuri_accounts').select('tenant_id, nombre, apellido, dni, celular').not('tenant_id', 'is', null),
  ])

  const ownerByTenant = Object.fromEntries(
    (users ?? []).map(u => [u.tenant_id, u.email])
  )
  const accountByTenant = Object.fromEntries(
    (accounts ?? []).map(a => [a.tenant_id, a])
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
  const productCountByTenant: Record<string, number> = {}
  for (const p of productRows ?? []) {
    productCountByTenant[p.tenant_id] = (productCountByTenant[p.tenant_id] ?? 0) + 1
  }
  // Si falta la migración de tenant_storage_bytes_all, no rompemos la
  // página entera — mismo criterio que storageError en src/lib/usage.ts.
  const storageByTenant: Record<string, number> = {}
  if (!storageError) {
    for (const s of (storageRows ?? []) as { tenant_id: string; bytes: number }[]) {
      storageByTenant[s.tenant_id] = Number(s.bytes ?? 0)
    }
  }

  const rows: TenantRow[] = (tenants ?? []).map(t => {
    const plan = getPlanForTenant(t.plan)
    const productCount = productCountByTenant[t.id] ?? 0
    const storageBytes = storageByTenant[t.id] ?? 0
    const storageMB = storageBytes / (1024 * 1024)
    return {
      id:          t.id,
      name:        t.name,
      slug:        t.slug,
      domain:      t.domain ?? null,
      template:    t.template ?? 'minimalista',
      status:      t.status,
      plan:        t.plan ?? 'basic',
      planStatus:  t.plan_status ?? null,
      // Deuda = pago pendiente vigente, sea que la tienda siga activa (gracia)
      // o ya se haya suspendido por eso — el resto de las suspensiones
      // (trial vencido, exceso de cupo) no son "deuda" de pago.
      debe: t.plan_status === 'past_due' || (t.status === 'suspended' && t.suspended_reason === 'payment_failed'),
      ownerEmail:  ownerByTenant[t.id] ?? null,
      ownerNombre:   accountByTenant[t.id]?.nombre ?? null,
      ownerApellido: accountByTenant[t.id]?.apellido ?? null,
      ownerDni:      accountByTenant[t.id]?.dni ?? null,
      ownerCelular:  accountByTenant[t.id]?.celular ?? null,
      // La dirección real del tenant siempre es {slug}.gounuri.com de fallback
      // (o su dominio propio si tiene uno) — antes acá se mostraba una URL fija
      // de preview por template (*.vercel.app), que no correspondía a ESE
      // tenant en particular. Ver bug de dominios del 2026-08-12.
      frontendUrl: t.domain ? `https://${t.domain}` : `https://${t.slug}.gounuri.com`,
      visitCount:  visitsByTenant[t.id] ?? 0,
      orderCount:  orderCountByTenant[t.id] ?? 0,
      ga4Linked:   ga4ByTenant[t.id] ?? false,
      // Uso real vs. límite del plan — ver comentario más arriba (2026-08-18).
      productCount,
      productLimit: plan.maxProductos,
      storageMB,
      storageLimitMB: plan.storageMB,
      storageAvailable: !storageError,
      manualPaymentNote:   t.manual_payment_note ?? null,
      manualPaymentAt:     t.manual_payment_at ?? null,
      manualPaymentBy:     t.manual_payment_by ?? null,
      manualPaymentTerm:   t.manual_payment_term ?? null,
      manualPaymentAmount: t.manual_payment_amount ?? null,
      manualPaidUntil:     t.manual_paid_until ?? null,
      // 2026-08-20: para el contador de "días para renovar" — cubre tanto
      // el trial (trial_ends_at) como el pago manual (manualPaidUntil de
      // arriba). Un tenant nunca tiene los dos a la vez: manual_paid_until
      // solo se setea cuando plan_status pasa a 'active' vía mark-plan-paid.
      trialEndsAt: t.trial_ends_at ?? null,
    }
  })

  return <SuperadminClient initialTenants={rows} />
}

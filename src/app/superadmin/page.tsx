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
    serviceClient.from('tenants').select('id, name, slug, domain, domain_status, template, status, plan, plan_status, suspended_reason, manual_payment_note, manual_payment_at, manual_payment_by, manual_payment_term, manual_payment_amount, manual_paid_until, trial_ends_at, billing_term, next_billing_date, created_at, manual_payment_pending_at, manual_payment_pending_plan, manual_payment_pending_term, is_founder, founder_marked_at, founder_marked_by').order('created_at', { ascending: false }),
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
    const plan = getPlanForTenant(t.plan, t.is_founder ?? false)
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
      // (trial vencido, exceso de cupo) no son "deuda" de pago. Cubre tanto
      // Mercado Pago (past_due / payment_failed) como transferencia vencida
      // sin renovar (manual_paid_until ya pasó, esté en gracia o ya
      // suspendida) — 2026-08-22, antes solo miraba el caso de MP.
      debe: t.plan_status === 'past_due'
        || (t.status === 'suspended' && t.suspended_reason === 'payment_failed')
        || (t.status === 'suspended' && t.suspended_reason === 'manual_payment_expired')
        || (!!t.manual_paid_until && new Date(t.manual_paid_until).getTime() < now.getTime()),
      ownerEmail:  ownerByTenant[t.id] ?? null,
      ownerNombre:   accountByTenant[t.id]?.nombre ?? null,
      ownerApellido: accountByTenant[t.id]?.apellido ?? null,
      ownerDni:      accountByTenant[t.id]?.dni ?? null,
      ownerCelular:  accountByTenant[t.id]?.celular ?? null,
      domainStatus: t.domain_status ?? 'none',
      // La dirección real del tenant siempre es {slug}.gounuri.com de fallback
      // (o su dominio propio si tiene uno Y ya está verificado) — antes acá
      // se mostraba una URL fija de preview por template (*.vercel.app), que
      // no correspondía a ESE tenant en particular (bug del 2026-08-12).
      // 2026-08-26: bug encontrado en vivo con HAEJIN_HAEJIN — esto trataba
      // "domain" como la dirección real apenas el tenant lo tipeaba, aunque
      // domain_status siguiera en 'none'/'pending' (DNS todavía sin
      // configurar) y el dominio propio todavía no resolviera nada. Ahora
      // solo se usa el dominio propio acá si ya está 'verified'; si no, cae
      // al fallback {slug}.gounuri.com que sí funciona siempre.
      frontendUrl: (t.domain && t.domain_status === 'verified') ? `https://${t.domain}` : `https://${t.slug}.gounuri.com`,
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
      // Ciclo de facturación via Mercado Pago (2026-08-26) -- billingTerm
      // (1/6/12 meses) + nextBillingDate del preapproval, mismos campos que
      // usa Panel Admin /facturacion/suscripcion. Se agregan acá para poder
      // mostrar "Ciclo de facturación / Fecha de vencimiento / Días que
      // faltan" en el popover de "Facturación" de la tabla de superadmin,
      // sin tener que salir a gounuri.com/perfil/plan a mirarlo tenant por
      // tenant.
      billingTerm: t.billing_term ?? null,
      nextBillingDate: t.next_billing_date ?? null,
      // Fecha de alta — para "ordenar por fecha de unión" en la tabla
      // (2026-08-22).
      createdAt: t.created_at,
      // "Pago a confirmar" (2026-08-22) — declaró intención de pago por
      // transferencia desde /perfil/plan pero todavía nadie confirmó que la
      // plata llegó. Ver notify-manual-intent (gounuri-web) y
      // mark-plan-paid (que lo limpia al confirmar).
      manualPaymentPendingAt:   t.manual_payment_pending_at ?? null,
      manualPaymentPendingPlan: t.manual_payment_pending_plan ?? null,
      manualPaymentPendingTerm: t.manual_payment_pending_term ?? null,
      // Promoción "Founders" (2026-08-24) — ver toggle-founder y lib/plans.ts.
      isFounder:       t.is_founder ?? false,
      founderMarkedAt: t.founder_marked_at ?? null,
      founderMarkedBy: t.founder_marked_by ?? null,
    }
  })

  return <SuperadminClient initialTenants={rows} />
}

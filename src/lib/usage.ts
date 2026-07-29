// Medición de uso por tenant + lógica de período de gracia (15 días).
//
// Se usa desde /dashboard/uso (página completa) y desde el banner del
// dashboard. Requiere las migraciones tenant_storage_migration.sql (RPC) y
// grace_period_migration.sql (columna tenants.over_limit_since).
//
// Regla de gracia acordada (2026-07): al superar un límite arranca un período
// de 15 días con warnings; la tienda NUNCA se corta automáticamente durante
// la gracia. Si el uso vuelve a estar dentro del límite, la gracia se resetea.
// El corte real post-gracia es manual/futuro — por ahora solo warnings.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getPlanForTenant, type PlanDef } from '@/lib/plans'

export const GRACE_DAYS = 15

export interface TenantUsage {
  plan: PlanDef
  storageBytes: number
  storageError: boolean
  storagePct: number
  productCount: number
  productPct: number
  orderCount: number // pedidos del mes — informativo, sin límite
  overLimit: boolean
  nearLimit: boolean
  // null = sin gracia activa; número = días restantes (puede ser 0 o negativo)
  graceDaysLeft: number | null
}

export async function getTenantUsage(service: SupabaseClient, tenantId: string): Promise<TenantUsage> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [storageRes, productsRes, ordersRes, tenantRes] = await Promise.all([
    service.rpc('tenant_storage_bytes', { tid: tenantId }),
    service.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    service.from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', monthStart),
    service.from('tenants').select('over_limit_since, plan, plan_status').eq('id', tenantId).limit(1),
  ])

  const plan = getPlanForTenant(tenantRes.data?.[0]?.plan)

  const storageError = storageRes.error != null
  const storageBytes = Number(storageRes.data ?? 0)
  const storageMB = storageBytes / (1024 * 1024)
  const storagePct = (storageMB / plan.storageMB) * 100

  const productCount = productsRes.count ?? 0
  const productPct = (productCount / plan.maxProductos) * 100

  const overLimit = storagePct >= 100 || productPct >= 100
  const nearLimit = !overLimit && (storagePct >= 80 || productPct >= 80)

  // ── Estado de gracia (best effort: si la columna no existe todavía, se ignora)
  let graceDaysLeft: number | null = null
  const overLimitSince: string | null = tenantRes.data?.[0]?.over_limit_since ?? null

  if (!tenantRes.error) {
    if (overLimit && !overLimitSince) {
      // Arranca la gracia ahora
      await service.from('tenants').update({ over_limit_since: now.toISOString() }).eq('id', tenantId)
      graceDaysLeft = GRACE_DAYS
    } else if (overLimit && overLimitSince) {
      const elapsedDays = Math.floor((now.getTime() - new Date(overLimitSince).getTime()) / 86_400_000)
      graceDaysLeft = GRACE_DAYS - elapsedDays
    } else if (!overLimit && overLimitSince) {
      // Volvió a estar dentro del límite — se limpia la gracia
      await service.from('tenants').update({ over_limit_since: null }).eq('id', tenantId)
    }
  }

  return {
    plan,
    storageBytes,
    storageError,
    storagePct,
    productCount,
    productPct,
    orderCount: ordersRes.count ?? 0,
    overLimit,
    nearLimit,
    graceDaysLeft,
  }
}

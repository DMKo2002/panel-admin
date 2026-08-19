// Medición de uso por tenant + estado de cuenta (trial / gracia / suspensión).
//
// Se usa desde /dashboard/uso, el banner del dashboard y el cron de
// enforcement (/api/cron/enforce). Requiere las migraciones:
// tenant_storage_migration.sql (RPC storage), grace_period_migration.sql
// (over_limit_since), billing_migration.sql (plan_status) y
// trial_visitas_migration.sql (trial_ends_at, suspended_reason, tenant_visits).
//
// Modelo (2026-07-31):
//   · Trial: 7 días gratis del plan elegido (plan_status = 'trial').
//     Vencido el trial: 7 días de gracia con warnings → suspensión (cron).
//   · Plan pago que supera cupo (storage/productos): 14 días de gracia con
//     warnings → suspensión (cron). Si el uso se regulariza, se limpia sola.
//   · Visitas: se miden y se muestran, pero NO cuentan para overLimit todavía.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getPlanForTenant, TRIAL_DAYS, TRIAL_GRACE_DAYS, type PlanDef } from '@/lib/plans'

export const GRACE_DAYS = 14
export { TRIAL_DAYS, TRIAL_GRACE_DAYS }

// Gracia para tenants marcados como pagados a mano (transferencia, ver
// /api/superadmin/mark-plan-paid) cuyo plazo (1/6/12 meses) venció sin que
// nadie los haya vuelto a marcar como pagados — mismo criterio de 7 días que
// el trial, para no tener un tercer número de gracia distinto sin motivo.
export const PAID_TERM_GRACE_DAYS = 7

export type AccountState =
  | 'trial'        // trial vigente
  | 'trial_grace'  // trial vencido, dentro de la gracia de 7 días
  | 'active'       // suscripción pagando (plan_status = 'active') o legacy
  | 'suspended'    // tienda pública apagada (tenants.status = 'suspended')

export interface TenantUsage {
  plan: PlanDef
  storageBytes: number
  storageError: boolean
  storagePct: number
  productCount: number
  productPct: number
  orderCount: number // pedidos del mes — informativo, sin límite
  visitCount: number // visitas del mes — se mide, no bloquea (por ahora)
  visitPct: number
  overLimit: boolean
  nearLimit: boolean
  // null = sin gracia por exceso activa; número = días restantes (puede ser <= 0)
  graceDaysLeft: number | null
  // Estado de cuenta
  accountState: AccountState
  // null = no aplica; número = días restantes de trial o de gracia post-trial
  trialDaysLeft: number | null
  trialGraceDaysLeft: number | null
  suspendedReason: string | null
}

export async function getTenantUsage(service: SupabaseClient, tenantId: string): Promise<TenantUsage> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthKey = monthStart.toISOString().slice(0, 10)

  const [storageRes, productsRes, ordersRes, tenantRes, visitsRes] = await Promise.all([
    service.rpc('tenant_storage_bytes', { tid: tenantId }),
    service.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    service.from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', monthStart.toISOString()),
    service.from('tenants').select('over_limit_since, plan, plan_status, status, trial_ends_at, suspended_reason').eq('id', tenantId).limit(1),
    service.from('tenant_visits').select('count').eq('tenant_id', tenantId).eq('month', monthKey).limit(1),
  ])

  const tenantRow = tenantRes.data?.[0]
  const plan = getPlanForTenant(tenantRow?.plan)

  const storageError = storageRes.error != null
  const storageBytes = Number(storageRes.data ?? 0)
  const storageMB = storageBytes / (1024 * 1024)
  const storagePct = (storageMB / plan.storageMB) * 100

  const productCount = productsRes.count ?? 0
  const productPct = (productCount / plan.maxProductos) * 100

  const visitCount = Number(visitsRes.data?.[0]?.count ?? 0)
  const visitPct = (visitCount / plan.visitasMes) * 100

  const overLimit = storagePct >= 100 || productPct >= 100
  const nearLimit = !overLimit && (storagePct >= 80 || productPct >= 80)

  // ── Gracia por exceso de cupo (best effort si faltan migraciones) ──────────
  let graceDaysLeft: number | null = null
  const overLimitSince: string | null = tenantRow?.over_limit_since ?? null

  if (!tenantRes.error) {
    if (overLimit && !overLimitSince) {
      await service.from('tenants').update({ over_limit_since: now.toISOString() }).eq('id', tenantId)
      graceDaysLeft = GRACE_DAYS
    } else if (overLimit && overLimitSince) {
      const elapsedDays = Math.floor((now.getTime() - new Date(overLimitSince).getTime()) / 86_400_000)
      graceDaysLeft = GRACE_DAYS - elapsedDays
    } else if (!overLimit && overLimitSince) {
      // Volvió a estar dentro del límite — se limpia la gracia
      await service.from('tenants').update({ over_limit_since: null, limit_warned_at: null }).eq('id', tenantId)
    }
  }

  // ── Estado de cuenta (trial / gracia post-trial / suspensión) ──────────────
  let accountState: AccountState = 'active'
  let trialDaysLeft: number | null = null
  let trialGraceDaysLeft: number | null = null

  const trialEndsAt: string | null = tenantRow?.trial_ends_at ?? null

  if (tenantRow?.status === 'suspended') {
    accountState = 'suspended'
  } else if (tenantRow?.plan_status === 'trial' && trialEndsAt) {
    const msLeft = new Date(trialEndsAt).getTime() - now.getTime()
    if (msLeft > 0) {
      accountState = 'trial'
      trialDaysLeft = Math.ceil(msLeft / 86_400_000)
    } else {
      accountState = 'trial_grace'
      trialGraceDaysLeft = TRIAL_GRACE_DAYS - Math.floor(-msLeft / 86_400_000)
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
    visitCount,
    visitPct,
    overLimit,
    nearLimit,
    graceDaysLeft,
    accountState,
    trialDaysLeft,
    trialGraceDaysLeft,
    suspendedReason: tenantRow?.suspended_reason ?? null,
  }
}

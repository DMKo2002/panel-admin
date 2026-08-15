// Definición de planes y sus límites — fuente única de verdad.
//
// Modelo (definido 2026-07): hasta diciembre 2026 se vende página completa;
// desde enero 2027 arranca la suscripción. Parámetros de límite: almacenamiento
// (costo real en Supabase), cantidad de productos (número comunicable) y
// visitas mensuales (cap de seguridad, medición pendiente). Pedidos: SIEMPRE
// ilimitados, sin comisión — es el diferenciador vs Tiendanube, no tocar.

// Modelo de trial (2026-07-31): registro self-serve con 7 días gratis del plan
// elegido, luego 7 días de gracia para pagar; plan pago que supera cupo tiene
// 14 días de gracia (GRACE_DAYS en usage.ts) antes de suspenderse.
export const TRIAL_DAYS = 7
export const TRIAL_GRACE_DAYS = 7

export interface PlanDef {
  id: 'free' | 'mini' | 'standard' | 'premium'
  nombre: string
  precioARS: number // 0 = gratis
  storageMB: number
  maxProductos: number
  visitasMes: number
}

// Límites recalibrados 2026-08-12 contra el uso real de las tiendas en
// producción (Yenine, la más grande, tenía 205 productos / 159 MB — Standard
// le sobraba por 2x en productos y 12x en storage, y Premium era un salto a
// un número de marketing que ninguna tienda real se acerca a pisar). Mini
// además le quedaba justo pisando los talones a la tienda real más chica
// (Conor's, 44 productos contra un tope de 50). Objetivo: Standard cómodo
// para la gran mayoría de clientes sin sentir la necesidad de subir de plan.
export const PLANS: Record<PlanDef['id'], PlanDef> = {
  free: {
    id: 'free',
    nombre: 'Gratis',
    precioARS: 0,
    storageMB: 150,
    maxProductos: 30,
    visitasMes: 5_000,
  },
  mini: {
    id: 'mini',
    nombre: 'Mini',
    precioARS: 9_900,
    storageMB: 300,
    maxProductos: 50,
    visitasMes: 15_000,
  },
  standard: {
    id: 'standard',
    nombre: 'Business',
    precioARS: 29_900,
    storageMB: 1_024,
    maxProductos: 300,
    visitasMes: 75_000,
  },
  premium: {
    id: 'premium',
    nombre: 'Premium',
    precioARS: 54_900,
    storageMB: 3_072,
    maxProductos: 600,
    visitasMes: 300_000,
  },
}

// Devuelve el plan real del tenant si es un id válido; cualquier valor legacy
// ('basic', null, etc.) cae a Standard — así los tenants existentes no quedan
// de golpe en 'free' con warnings de exceso. Cuando arranque la suscripción
// (enero 2027), el registro nuevo debe crear tenants con plan = 'free'.
export function getPlanForTenant(tenantPlan?: string | null): PlanDef {
  if (tenantPlan && tenantPlan in PLANS) return PLANS[tenantPlan as PlanDef['id']]
  return PLANS.standard
}

export function formatStorage(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB`
  return `${Math.round(mb)} MB`
}

// ── Descuento por pago adelantado (2026-08-12) ──────────────────────────────
// El tenant puede pagar 1 mes (sin descuento), 6 meses de una (10% off sobre
// el total) o 12 meses de una (20% off). Se cobra como UN solo preapproval de
// MP con auto_recurring.frequency = esos meses — MP vuelve a cobrar recién
// cuando se cumple el plazo, no todos los meses.
export type BillingTerm = 1 | 6 | 12

export const TERM_DISCOUNTS: Record<BillingTerm, number> = {
  1: 0,
  6: 0.10,
  12: 0.20,
}

export function isBillingTerm(v: unknown): v is BillingTerm {
  return v === 1 || v === 6 || v === 12
}

// Precio TOTAL a cobrar por el plazo elegido (ya con el descuento aplicado),
// redondeado al peso — no es el precio mensual.
export function priceForTerm(plan: PlanDef, months: BillingTerm): number {
  const discount = TERM_DISCOUNTS[months]
  return Math.round(plan.precioARS * months * (1 - discount))
}

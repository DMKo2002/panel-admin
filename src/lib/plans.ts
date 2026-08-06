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
    // TEMPORAL (2026-08-06): $1 para probar el cobro real de MP end-to-end.
    // Volver a 10_000 apenas termine el test — ver memoria/tarea de este día.
    precioARS: 1,
    storageMB: 200,
    maxProductos: 50,
    visitasMes: 10_000,
  },
  standard: {
    id: 'standard',
    nombre: 'Standard',
    precioARS: 29_999,
    storageMB: 2_048,
    maxProductos: 400,
    visitasMes: 50_000,
  },
  premium: {
    id: 'premium',
    nombre: 'Premium',
    precioARS: 79_999,
    storageMB: 10_240,
    maxProductos: 1_000,
    visitasMes: 200_000,
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

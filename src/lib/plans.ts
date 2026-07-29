// Definición de planes y sus límites — fuente única de verdad.
//
// Modelo (definido 2026-07): hasta diciembre 2026 se vende página completa;
// desde enero 2027 arranca la suscripción. Parámetros de límite: almacenamiento
// (costo real en Supabase), cantidad de productos (número comunicable) y
// visitas mensuales (cap de seguridad, medición pendiente). Pedidos: SIEMPRE
// ilimitados, sin comisión — es el diferenciador vs Tiendanube, no tocar.

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
    precioARS: 10_000,
    storageMB: 200,
    maxProductos: 50,
    visitasMes: 10_000,
  },
  standard: {
    id: 'standard',
    nombre: 'Standard',
    precioARS: 30_000,
    storageMB: 2_048,
    maxProductos: 400,
    visitasMes: 50_000,
  },
  premium: {
    id: 'premium',
    nombre: 'Premium',
    precioARS: 80_000,
    storageMB: 10_240,
    maxProductos: 1_000,
    visitasMes: 200_000,
  },
}

// TODO (enero 2027): leer el plan real desde tenants.plan cuando exista la
// lógica de suscripción + débito automático. Por ahora todos son Standard.
export function getPlanForTenant(_tenantPlan?: string | null): PlanDef {
  return PLANS.standard
}

export function formatStorage(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB`
  return `${Math.round(mb)} MB`
}

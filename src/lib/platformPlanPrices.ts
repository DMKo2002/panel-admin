// Precios reales de los planes pagos -- fila por plan en
// platform_plan_prices, editable desde /superadmin/planes (2026-08-29,
// pedido de ARam: en Argentina los precios necesitan poder ajustarse
// seguido por inflación, sin depender de un redeploy).
//
// PLANS (lib/plans.ts) sigue siendo la fuente de límites/nombre/descripción
// -- precioARS ahí es solo el default/fallback si la tabla todavía no tiene
// la fila de ese plan o la consulta falla, mismo criterio que
// platformBilling.ts con platform_billing_settings.
import type { SupabaseClient } from '@supabase/supabase-js'
import { PLANS, type PlanId } from '@/lib/plans'

export type PlanPrices = Record<PlanId, number>

function fallbackPrices(): PlanPrices {
  return {
    mini: PLANS.mini.precioARS,
    standard: PLANS.standard.precioARS,
    premium: PLANS.premium.precioARS,
  }
}

export async function getPlatformPlanPrices(service: SupabaseClient): Promise<PlanPrices> {
  const { data, error } = await service.from('platform_plan_prices').select('plan_id, precio_ars')
  const prices = fallbackPrices()
  if (error || !data) {
    console.error('[platformPlanPrices] no se pudo leer platform_plan_prices, uso fallback hardcodeado:', error?.message)
    return prices
  }
  for (const row of data) {
    if (row.plan_id === 'mini' || row.plan_id === 'standard' || row.plan_id === 'premium') {
      prices[row.plan_id] = row.precio_ars
    }
  }
  return prices
}

// Devuelve el PlanDef de PLANS con precioARS pisado por el precio vigente
// -- así priceForTerm/fullPriceForTerm (que reciben un PlanDef entero)
// cobran/muestran el precio real sin tener que tocar su firma.
export function applyPlanPrice(planId: PlanId, prices: PlanPrices) {
  return { ...PLANS[planId], precioARS: prices[planId] }
}

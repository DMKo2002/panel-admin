// /superadmin/planes — precios reales de Mini/Business/Premium, editables
// sin redeploy (2026-08-29, pedido de ARam: en Argentina los precios
// necesitan poder ajustarse seguido por inflación).
//
// Fuente de verdad: platform_plan_prices (una fila por plan). PLANS
// (lib/plans.ts) sigue definiendo nombre/límites/descripción -- precioARS
// ahí es solo el default si la tabla todavía no tiene esa fila.
//
// A propósito esto NO le manda nada a Mercado Pago (decisión de ARam
// 2026-08-29): cambiar acá el precio solo afecta altas nuevas y lo que se
// muestra en pantalla (landing, onboarding, facturación). Una suscripción
// de MP ya activa sigue debitando el monto con el que se autorizó -- eso se
// ajusta a mano, directo en el dashboard de Mercado Pago, nunca desde acá.
import { PLANS } from '@/lib/plans'
import { createServiceClient } from '@/lib/supabase/service'
import { getPlatformPlanPrices } from '@/lib/platformPlanPrices'
import PreciosPlanesClient from './PreciosPlanesClient'

export const dynamic = 'force-dynamic'

export default async function SuperadminPlanesPage() {
  const service = createServiceClient()
  const prices = await getPlatformPlanPrices(service)

  const { data: rows } = await service
    .from('platform_plan_prices')
    .select('plan_id, updated_at, updated_by')
  const meta = Object.fromEntries((rows ?? []).map(r => [r.plan_id, { updatedAt: r.updated_at as string, updatedBy: r.updated_by as string | null }]))

  return (
    <div>
      <h1 className="text-lg font-semibold text-zinc-100">Precios de los planes</h1>
      <p className="text-sm text-zinc-400 mt-1 mb-6 max-w-xl">
        Precio mensual de lista de cada plan. Se usa para altas nuevas, para lo que se muestra en gounuri.com y en el Panel Admin (onboarding, facturación), y para calcular el monto por transferencia. No toca ninguna suscripción de Mercado Pago ya activa — eso se ajusta a mano, directo en MP.
      </p>
      <PreciosPlanesClient
        initial={{
          mini: prices.mini,
          standard: prices.standard,
          premium: prices.premium,
        }}
        nombres={{
          mini: PLANS.mini.nombre,
          standard: PLANS.standard.nombre,
          premium: PLANS.premium.nombre,
        }}
        meta={meta as Record<string, { updatedAt: string; updatedBy: string | null }>}
      />
    </div>
  )
}

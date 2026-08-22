// /superadmin/pagos — cómo le pagan las tiendas SU suscripción a GOUNURI
// (transferencia y/o Mercado Pago). No confundir con /dashboard/pagos, que
// es la config de cada tienda hacia SUS PROPIOS clientes (store_config).
//
// Fila única en platform_billing_settings (id=1, ver migración
// platform_billing_settings 2026-08-22). gounuri.com/perfil/plan lee esta
// misma fila (server-side, service client) para decidir qué botones de pago
// mostrarle al dueño de cada tienda.

import { createServiceClient } from '@/lib/supabase/service'
import PagosGounuriClient from './PagosGounuriClient'

export const dynamic = 'force-dynamic'

export default async function SuperadminPagosPage() {
  const service = createServiceClient()
  const { data } = await service
    .from('platform_billing_settings')
    .select('*')
    .eq('id', 1)
    .single()

  return (
    <div>
      <h1 className="text-lg font-semibold text-zinc-100">Pagos de GOUNURI</h1>
      <p className="text-sm text-zinc-400 mt-1 mb-6 max-w-xl">
        Cómo cobra GOUNURI la suscripción de cada tienda — transferencia y/o Mercado Pago. Esto es lo que ven los dueños de tienda en gounuri.com al querer cambiar de plan.
      </p>
      <PagosGounuriClient initial={data ?? null} />
    </div>
  )
}

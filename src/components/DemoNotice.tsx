import { createClient } from '@/lib/supabase/server'
import DemoNoticeClient from '@/components/DemoNoticeClient'

// Server component: muestra el cartel solo si la tienda todavía tiene
// productos demo (products.is_demo). Si no hay, no renderiza nada.
export default async function DemoNotice({ tenantId }: { tenantId: string }) {
  const supabase = await createClient()
  const { count } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_demo', true)
  if (!count) return null
  return <DemoNoticeClient count={count} />
}

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Badge from '@/components/Badge'

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

export default async function PreciosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  const tenantId = userRow?.tenant_id
  if (!tenantId) return null

  const { data: products } = await supabase
    .from('products')
    .select('id, name, variants(id, size, color, price_rules(*))')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .order('name')

  return (
    <div>
      <div className="px-8 py-6 border-b border-zinc-200 bg-white">
        <h1 className="text-xl font-semibold text-zinc-900">Precios</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Precios por variante — podés editar desde cada producto</p>
      </div>

      <div className="px-8 py-6 space-y-4">
        {products?.map((product: any) => (
          <div key={product.id} className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-100">
              <p className="text-sm font-semibold text-zinc-800">{product.name}</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-2">Variante</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-2">Tipo</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-2">Cant. mínima</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-2">Precio</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {product.variants?.flatMap((v: any) =>
                  v.price_rules?.length > 0
                    ? v.price_rules.map((rule: any) => (
                        <tr key={rule.id} className="border-b border-zinc-50 last:border-0">
                          <td className="px-4 py-2.5 text-zinc-600">{[v.size, v.color].filter(Boolean).join(' / ') || '—'}</td>
                          <td className="px-4 py-2.5">
                            {rule.type === 'wholesale'
                              ? <Badge variant="amber">Mayorista</Badge>
                              : <Badge variant="blue">Minorista</Badge>
                            }
                          </td>
                          <td className="px-4 py-2.5 text-zinc-500">x{rule.min_qty}</td>
                          <td className="px-4 py-2.5 font-medium text-zinc-900">{formatPrice(rule.price)}</td>
                          <td className="px-4 py-2.5">
                            {rule.active ? <Badge variant="green">Activo</Badge> : <Badge variant="zinc">Inactivo</Badge>}
                          </td>
                        </tr>
                      ))
                    : [
                        <tr key={v.id} className="border-b border-zinc-50 last:border-0">
                          <td className="px-4 py-2.5 text-zinc-400">{[v.size, v.color].filter(Boolean).join(' / ') || '—'}</td>
                          <td colSpan={4} className="px-4 py-2.5 text-zinc-300 text-xs">Sin precios configurados</td>
                        </tr>
                      ]
                )}
              </tbody>
            </table>
          </div>
        ))}

        {(!products || products.length === 0) && (
          <div className="text-center py-12 text-zinc-400">No hay productos activos con precios configurados</div>
        )}
      </div>
    </div>
  )
}

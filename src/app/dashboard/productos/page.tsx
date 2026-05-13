import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Badge from '@/components/Badge'
import { Plus, ImageOff } from 'lucide-react'

export default async function ProductosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  const tenantId = userRow?.tenant_id
  if (!tenantId) return null

  const { data: products } = await supabase
    .from('products')
    .select('*, product_images(*), variants(*, price_rules(*))')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Productos</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{products?.length ?? 0} productos</p>
        </div>
        <Link href="/dashboard/productos/nuevo" className="btn-primary">
          <Plus size={16} />
          Nuevo producto
        </Link>
      </div>

      <div className="px-8 py-6">
        <div className="grid grid-cols-3 gap-4">
          {products?.map((product: any) => {
            const cover = product.product_images?.find((i: any) => i.is_cover) ?? product.product_images?.[0]
            const totalStock = product.variants?.reduce((acc: number, v: any) => acc + (v.stock ?? 0), 0) ?? 0
            const retailPrice = product.variants?.[0]?.price_rules?.find((p: any) => p.type === 'retail' && p.active)?.price
            const wholesalePrice = product.variants?.[0]?.price_rules?.find((p: any) => p.type === 'wholesale' && p.active)?.price

            return (
              <div key={product.id} className="bg-white rounded-xl border border-zinc-200 overflow-hidden hover:border-zinc-300 hover:shadow-sm transition-all cursor-pointer group">
                {/* Imagen */}
                <div className="h-40 bg-zinc-50 flex items-center justify-center relative overflow-hidden">
                  {cover ? (
                    <img src={cover.url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <ImageOff size={28} className="text-zinc-300" />
                  )}
                  {!product.active && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                      <Badge variant="zinc">Inactivo</Badge>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-4">
                  <p className="font-medium text-zinc-900 text-sm truncate">{product.name}</p>

                  <div className="mt-1.5 space-y-0.5">
                    {retailPrice && (
                      <p className="text-xs text-zinc-500">
                        Minorista: <span className="text-zinc-800 font-medium">
                          {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(retailPrice)}
                        </span>
                      </p>
                    )}
                    {wholesalePrice && (
                      <p className="text-xs text-zinc-500">
                        Mayorista: <span className="text-zinc-800 font-medium">
                          {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(wholesalePrice)}
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="mt-3">
                    {totalStock === 0
                      ? <Badge variant="red">Sin stock</Badge>
                      : totalStock <= 3
                      ? <Badge variant="amber">Stock bajo: {totalStock}</Badge>
                      : <Badge variant="green">Stock: {totalStock}</Badge>
                    }
                  </div>
                </div>
              </div>
            )
          })}

          {(!products || products.length === 0) && (
            <div className="col-span-3 py-16 text-center">
              <p className="text-zinc-400 mb-4">Todavía no hay productos cargados</p>
              <Link href="/dashboard/productos/nuevo" className="btn-primary inline-flex">
                <Plus size={16} />
                Crear primer producto
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

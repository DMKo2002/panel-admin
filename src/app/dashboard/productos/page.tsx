import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import ProductosGrid from '@/components/ProductosGrid'

export default async function ProductosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  const tenantId = userRow?.tenant_id
  if (!tenantId) return null

  const [{ data: rawProducts }, { data: categories }] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, active, category_id, product_images(*), variants(stock, color, price_rules(type, price, compare_at_price, active, min_qty))')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }),
    supabase
      .from('categories')
      .select('id, name, slug')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .order('sort_order'),
  ])

  // Build category slug lookup
  const catMap = Object.fromEntries((categories ?? []).map(c => [c.id, c.slug]))

  const products = (rawProducts ?? []).map((product: any) => {
    const cover = product.product_images?.find((i: any) => i.is_cover) ?? product.product_images?.[0]
    const totalStock = product.variants?.reduce((acc: number, v: any) => acc + (v.stock ?? 0), 0) ?? 0
    const retailRule = product.variants?.[0]?.price_rules?.find(
      (p: any) => p.type === 'retail' && p.active && (p.min_qty ?? 1) <= 1
    )
    const wholesaleRule = product.variants?.[0]?.price_rules?.find(
      (p: any) => p.type === 'wholesale' && p.active
    )
    const colors = [...new Set((product.variants ?? []).map((v: any) => v.color).filter(Boolean))] as string[]

    return {
      id: product.id,
      name: product.name,
      active: product.active,
      cover: cover?.url ?? null,
      retailPrice: retailRule?.price,
      wholesalePrice: wholesaleRule?.price,
      compareAtPrice: retailRule?.compare_at_price ?? undefined,
      totalStock,
      colors,
      category: catMap[product.category_id] ?? undefined,
    }
  })

  return (
    <div>
      <div className="px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Productos</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{products.length} productos</p>
        </div>
        <Link href="/dashboard/productos/nuevo" className="btn-primary">
          <Plus size={16} />
          Nuevo producto
        </Link>
      </div>

      <ProductosGrid products={products} categories={categories ?? []} />
    </div>
  )
}

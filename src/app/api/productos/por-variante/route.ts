import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Dado un variant_id (el que ya tiene guardado un order_item), devuelve el
// producto dueño y todas sus variantes — para que el modal "Modificar
// pedido" pueda mostrar el selector de talle/color con las opciones reales
// al abrir un pedido existente, sin que el admin tenga que re-buscar el
// producto si solo quiere cambiar el talle/color de una línea ya cargada.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: _userRows } = await supabase.from('users').select('tenant_id').eq('id', user.id).limit(1)
  const userRow = _userRows?.[0]
  if (!userRow?.tenant_id) return NextResponse.json({ error: 'Sin tenant' }, { status: 403 })

  const variantId = req.nextUrl.searchParams.get('variant_id')
  if (!variantId) return NextResponse.json({ error: 'variant_id requerido' }, { status: 400 })

  const service = createServiceClient()

  const { data: variant } = await service
    .from('variants')
    .select('product_id')
    .eq('id', variantId)
    .single()

  if (!variant?.product_id) return NextResponse.json({ error: 'Variante no encontrada' }, { status: 404 })

  const { data: product } = await service
    .from('products')
    .select('id, name, tenant_id, variants(id, size, color, sku, stock, active)')
    .eq('id', variant.product_id)
    .single()

  if (!product || product.tenant_id !== userRow.tenant_id) {
    return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
  }

  return NextResponse.json({ productId: product.id, productName: product.name, variants: product.variants ?? [] })
}

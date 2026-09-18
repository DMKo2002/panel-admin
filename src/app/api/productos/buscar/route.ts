import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Buscador de catálogo para el editor de pedidos (Panel Admin → Pedidos →
// Modificar pedido). Devuelve productos + sus variantes reales para que el
// admin solo pueda agregar/corregir un ítem eligiendo de la lista — nunca
// tipeando a mano un producto, talle o color que no existe (pedido de David,
// 2026-09-18). Limitado a 8 resultados: es un autocompletar, no un listado.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: _userRows } = await supabase.from('users').select('tenant_id').eq('id', user.id).limit(1)
  const userRow = _userRows?.[0]
  if (!userRow?.tenant_id) return NextResponse.json({ error: 'Sin tenant' }, { status: 403 })

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ products: [] })

  const service = createServiceClient()

  const { data: products, error } = await service
    .from('products')
    .select('id, name, variants(id, size, color, sku, stock, active, price_rules(id, type, price, compare_at_price, min_qty, active))')
    .eq('tenant_id', userRow.tenant_id)
    .ilike('name', `%${q}%`)
    .order('name', { ascending: true })
    .limit(8)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ products: products ?? [] })
}

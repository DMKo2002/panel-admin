import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { toCsv } from '@/lib/csv'
import { isSuperAdmin } from '@/lib/superadmin'

const HEADERS = [
  'producto_id', 'variante_id', 'categoria', 'nombre', 'descripcion', 'imagenes', 'sku',
  'talle', 'color', 'color_hex', 'stock', 'stock_alerta_baja',
  'precio_minorista', 'precio_minorista_tachado',
  'precio_mayorista', 'precio_mayorista_min_qty',
  'producto_activo', 'variante_activa',
]

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  // Import/export CSV es solo para superadmin (dmko2002@gmail.com, arambeck1972@gmail.com) —
  // el resto de las cuentas ni ve el botón en la UI, pero esto evita que alguien
  // le pegue directo a la URL.
  if (!isSuperAdmin(user.email)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const service = createServiceClient()
  const { data: userRows } = await service.from('users').select('tenant_id').eq('id', user.id).limit(1)
  const tenantId = userRows?.[0]?.tenant_id
  if (!tenantId) return NextResponse.json({ error: 'Usuario sin tienda asignada' }, { status: 400 })

  const [{ data: categories }, { data: products }] = await Promise.all([
    service.from('categories').select('id, name, parent_id').eq('tenant_id', tenantId),
    service
      .from('products')
      .select(`
        id, name, sku, description, active, category_id,
        product_images ( url, sort_order, is_cover ),
        variants ( id, size, color, color_hex, sku, stock, low_stock_alert, active,
          price_rules ( type, price, compare_at_price, min_qty, active )
        )
      `)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }),
  ])

  // Path completo de categoría, ej: "Ropa > Remeras"
  const catById = new Map((categories ?? []).map((c: any) => [c.id, c]))
  function categoryPath(catId: string | null): string {
    if (!catId) return ''
    const parts: string[] = []
    let current = catById.get(catId)
    let guard = 0
    while (current && guard++ < 10) {
      parts.unshift(current.name)
      current = current.parent_id ? catById.get(current.parent_id) : undefined
    }
    return parts.join(' > ')
  }

  const rows: (string | number)[][] = [HEADERS]

  for (const p of (products ?? []) as any[]) {
    const images = (p.product_images ?? [])
      .sort((a: any, b: any) => (b.is_cover ? 1 : 0) - (a.is_cover ? 1 : 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((i: any) => i.url)
      .join(';')
    const catPath = categoryPath(p.category_id)

    const variants = p.variants ?? []
    if (variants.length === 0) {
      // Producto sin variantes todavía — igual se exporta una fila para no perderlo.
      rows.push([
        p.id, '', catPath, p.name, p.description ?? '', images, p.sku ?? '',
        '', '', '', '', '',
        '', '', '', '',
        p.active ? '1' : '0', '',
      ])
      continue
    }

    for (const v of variants) {
      const rules = v.price_rules ?? []
      const retail = rules.find((r: any) => r.type === 'retail' && (r.min_qty ?? 1) <= 1)
      const wholesale = rules.find((r: any) => r.type === 'wholesale')
      rows.push([
        p.id, v.id, catPath, p.name, p.description ?? '', images, p.sku ?? '',
        v.size ?? '', v.color ?? '', v.color_hex ?? '',
        v.stock ?? 0, v.low_stock_alert ?? '',
        retail?.price ?? '', retail?.compare_at_price ?? '',
        wholesale?.price ?? '', wholesale?.min_qty ?? '',
        p.active ? '1' : '0', v.active ? '1' : '0',
      ])
    }
  }

  const csv = toCsv(rows)
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="productos-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { buildDisplayNameByRawColor } from '@/lib/colorNames'

// Borra TODAS las variantes de un producto que compartan un mismo color
// (columna) o un mismo talle (fila) desde el editor de producto. Se usa
// cuando el tenant quiere eliminar de verdad una columna/fila entera, no
// solo vaciarle los precios (eso dejaba variantes "zombie" dando vueltas).
export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { productId, by, value } = await req.json()
  // OJO: "value" puede ser legítimamente una cadena vacía (variantes viejas
  // sin talle/color, o una fila/columna de la tabla libre que nunca se
  // llegó a nombrar) — un chequeo con "!value" las trata como "falta el
  // dato" y bloquea el borrado con este mismo error 400, aunque productId
  // y by estén perfectos. Se valida presencia real (undefined/null) en vez
  // de truthiness.
  if (!productId || !by || value === undefined || value === null) {
    return NextResponse.json({ error: 'Faltan datos (productId, by, value)' }, { status: 400 })
  }
  if (by !== 'color' && by !== 'size') {
    return NextResponse.json({ error: 'by debe ser "color" o "size"' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: _userRows } = await service.from('users').select('tenant_id').eq('id', user.id).limit(1)
  const tenantId = _userRows?.[0]?.tenant_id
  if (!tenantId) return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 })

  // Verificar que el producto pertenece al tenant del usuario
  const { data: productRows } = await service.from('products')
    .select('id').eq('id', productId).eq('tenant_id', tenantId).limit(1)
  if (!productRows?.[0]) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })

  // Se trae TODA la variante cruda del producto y se filtra en JS — no se
  // puede matchear "value" directo contra la columna "color" en la base
  // porque el editor MUESTRA un nombre normalizado (ej: variantes viejas
  // guardadas como color="#555555" se muestran como "Gris Oscuro"), pero
  // esa normalización nunca se persiste hasta que el tenant guarda el
  // producto. Si acá se buscara por el nombre mostrado tal cual, para esos
  // colores legacy nunca matcheaba nada y el borrado quedaba "roto" en
  // silencio (404) — exactamente el bug reportado en Mykonos y Connors.
  const { data: allVariants } = await service.from('variants')
    .select('id, color, size, color_hex')
    .eq('product_id', productId)

  let variantIds: string[] = []
  if (by === 'size') {
    variantIds = (allVariants ?? [])
      .filter(v => (v.size ?? '') === value)
      .map(v => v.id)
  } else {
    // Mismo criterio de normalización + desambiguación de colisiones que
    // usa el editor (productos/[id]/page.tsx) al cargar la matriz, para que
    // el nombre que ve el tenant en pantalla sea el mismo que se busca acá.
    const displayByRaw = buildDisplayNameByRawColor(allVariants ?? [])
    variantIds = (allVariants ?? [])
      .filter(v => (displayByRaw[v.color ?? ''] ?? '') === value)
      .map(v => v.id)
  }
  if (variantIds.length === 0) {
    return NextResponse.json({ error: 'No se encontraron variantes con ese valor' }, { status: 404 })
  }

  // No permitir borrar variantes que ya tengan pedidos asociados — evita
  // romper el historial de pedidos.
  const { count } = await service.from('order_items')
    .select('id', { count: 'exact', head: true })
    .in('variant_id', variantIds)
  if (count && count > 0) {
    return NextResponse.json({
      error: `${count} pedido${count > 1 ? 's' : ''} ya incluyen estas variantes — no se pueden borrar sin romper ese historial. Si ya no se vende, poné el stock en 0 en vez de eliminarlo.`,
    }, { status: 409 })
  }

  await service.from('price_rules').delete().in('variant_id', variantIds)
  const { error: deleteError } = await service.from('variants').delete().in('id', variantIds)
  if (deleteError) {
    return NextResponse.json({ error: 'No se pudieron eliminar las variantes: ' + deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, deleted: variantIds.length })
}

// POST /api/demo/borrar — borra TODO lo que vino de los datos demo de la
// tienda (productos con variantes/precios/imágenes y categorías marcados
// is_demo = true). No toca nada que el dueño haya cargado él mismo.
//
// Ver lib/seedDemoStore.ts (cómo se cargan) y SQL/demo_data_migration.sql.

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const maxDuration = 60

function storagePathFromUrl(url: string | null | undefined, bucket: string): string | null {
  if (!url) return null
  const marker = `/object/public/${bucket}/`
  const i = url.indexOf(marker)
  if (i < 0) return null
  try {
    return decodeURIComponent(url.slice(i + marker.length).split('?')[0])
  } catch {
    return null
  }
}

export async function POST() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: _userRows } = await supabase.from('users').select('tenant_id').eq('id', user.id).limit(1)
  const tenantId = _userRows?.[0]?.tenant_id
  if (!tenantId) return NextResponse.json({ error: 'Sin tienda' }, { status: 404 })

  const service = createServiceClient()

  const { data: demoProducts, error: readError } = await service
    .from('products').select('id').eq('tenant_id', tenantId).eq('is_demo', true)
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
  const productIds = (demoProducts ?? []).map((p: any) => p.id)

  // Archivos de las imágenes demo (copias propias de esta tienda): se borran
  // de Storage para que no sigan sumando al cupo de almacenamiento.
  let archivosBorrados = 0
  if (productIds.length > 0) {
    const { data: imgs } = await service.from('product_images').select('url').in('product_id', productIds)
    const paths = (imgs ?? [])
      .map((i: any) => storagePathFromUrl(i.url, 'product-images'))
      // Seguridad: solo archivos dentro de la carpeta de ESTA tienda.
      .filter((p): p is string => !!p && p.startsWith(`${tenantId}/`))
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await service.storage.from('product-images').remove(paths.slice(i, i + 100))
      if (error) console.error('[demo/borrar] no se pudieron borrar archivos', error.message)
      else archivosBorrados += Math.min(100, paths.length - i)
    }
  }

  // Variantes, precios, imágenes y product_categories se borran en cascada.
  const { error: prodError } = await service
    .from('products').delete().eq('tenant_id', tenantId).eq('is_demo', true)
  if (prodError) return NextResponse.json({ error: prodError.message }, { status: 500 })

  const { error: catError } = await service
    .from('categories').delete().eq('tenant_id', tenantId).eq('is_demo', true)
  if (catError) return NextResponse.json({ error: catError.message }, { status: 500 })

  return NextResponse.json({ ok: true, productos: productIds.length, archivos: archivosBorrados })
}

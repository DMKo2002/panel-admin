import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseCsv, csvRowsToObjects } from '@/lib/csv'
import { isSuperAdmin } from '@/lib/superadmin'

function slugify(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function toBool(v: string, fallback = true): boolean {
  const t = v.trim().toLowerCase()
  if (t === '') return fallback
  return !['0', 'false', 'no', 'inactivo'].includes(t)
}

function toNum(v: string): number | null {
  const t = v.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function normalizeHex(v: string): string | null {
  const t = v.trim()
  if (!t) return null
  const withHash = t.startsWith('#') ? t : `#${t}`
  return /^#[0-9A-Fa-f]{3,8}$/.test(withHash) ? withHash.toUpperCase() : null
}

/**
 * Importación CSV de productos. Formato flexible: acepta el CSV generado por
 * /api/productos/export (con columnas separadas de precio minorista/mayorista)
 * o un CSV externo (migración desde otra tienda) que solo tenga una columna
 * genérica "precio" — en ese caso, por criterio del negocio, ese precio se
 * carga SIEMPRE como precio mayorista (nunca minorista por default).
 *
 * Agrupa filas por producto usando producto_id si viene, o por
 * (nombre + categoria) si no — así una fila por variante puede listar el
 * mismo producto varias veces (una por talle/color) y quedan agrupadas.
 */
export async function POST(req: NextRequest) {
  try {
    const text = await req.text()
    if (!text.trim()) return NextResponse.json({ error: 'Archivo vacío' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    // Import/export CSV es solo para superadmin — ver export/route.ts
    if (!isSuperAdmin(user.email)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const service = createServiceClient()
    const { data: userRows } = await service.from('users').select('tenant_id').eq('id', user.id).limit(1)
    const tenantId = userRows?.[0]?.tenant_id
    if (!tenantId) return NextResponse.json({ error: 'Usuario sin tienda asignada' }, { status: 400 })

    const objects = csvRowsToObjects(parseCsv(text))
    if (objects.length === 0) return NextResponse.json({ error: 'El CSV no tiene filas de datos' }, { status: 400 })

    // ── Categorías existentes del tenant, para resolver/crear por path ──────
    const { data: existingCats } = await service.from('categories').select('id, name, parent_id').eq('tenant_id', tenantId)
    const catCache = new Map<string, string>() // key: `${parentId ?? 'root'}::${nameLower}` -> id
    for (const c of existingCats ?? []) {
      catCache.set(`${c.parent_id ?? 'root'}::${c.name.trim().toLowerCase()}`, c.id)
    }
    let catSortOrder = (existingCats ?? []).length

    async function resolveCategoryPath(path: string): Promise<string | null> {
      const segments = path.split('>').map(s => s.trim()).filter(Boolean)
      if (segments.length === 0) return null
      let parentId: string | null = null
      let catId: string | null = null
      for (const segment of segments) {
        const key = `${parentId ?? 'root'}::${segment.toLowerCase()}`
        let id = catCache.get(key)
        if (!id) {
          const { data: created, error } = await service.from('categories').insert({
            tenant_id: tenantId, name: segment, slug: slugify(segment),
            parent_id: parentId, active: true, sort_order: catSortOrder++,
          }).select('id').single()
          if (error) throw new Error(`No se pudo crear la categoría "${segment}": ${error.message}`)
          id = created!.id
          catCache.set(key, id)
        }
        parentId = id
        catId = id
      }
      return catId
    }

    // ── Productos existentes del tenant, para poder matchear por id o por nombre ──
    const { data: existingProducts } = await service.from('products').select('id, name, category_id').eq('tenant_id', tenantId)
    const productById = new Map((existingProducts ?? []).map((p: any) => [p.id, p]))

    // ── Variantes existentes del tenant, para no confundir un variante_id de
    // OTRA tienda (ej: reimportando el export de otro tenant) con una propia.
    // Sin este chequeo, un UPDATE por id ajeno afecta 0 filas silenciosamente
    // (sin error) y la variante nunca se crea — bug que causaba pérdida de
    // color/talle/precio al migrar entre tiendas.
    const existingProductIds = (existingProducts ?? []).map((p: any) => p.id)
    const { data: existingVariants } = existingProductIds.length
      ? await service.from('variants').select('id, product_id').in('product_id', existingProductIds)
      : { data: [] as any[] }
    const variantById = new Map((existingVariants ?? []).map((v: any) => [v.id, v]))

    const groupKeyToProductId = new Map<string, string>()
    const productsCreatedThisRun = new Set<string>()

    let productsCreated = 0, productsUpdated = 0, variantsCreated = 0, variantsUpdated = 0
    const errors: string[] = []

    for (let i = 0; i < objects.length; i++) {
      const row = objects[i]
      const rowNum = i + 2 // +1 header, +1 base-1

      try {
        const nombre = row['nombre']?.trim()
        if (!nombre) { errors.push(`Fila ${rowNum}: falta "nombre", se salteó.`); continue }

        const producto_id = row['producto_id']?.trim()
        const categoria = row['categoria']?.trim() ?? ''
        // Multi-categoría: columna opcional "categorias" (plural) con varios
        // paths separados por ";" — ej: "Marca > Cosrx;Skin Care > Facial > Serum y Ampolla;Tipo de piel > Mixto".
        // Van a la tabla puente product_categories, además de la "categoria"
        // singular de siempre que sigue seteando products.category_id.
        const categoriasMulti = (row['categorias'] ?? '').split(';').map(s => s.trim()).filter(Boolean)
        const groupKey = producto_id || `${nombre.toLowerCase()}|${categoria.toLowerCase()}`

        let productId = groupKeyToProductId.get(groupKey)

        if (!productId) {
          const categoryId = categoria ? await resolveCategoryPath(categoria) : null

          // "producto_id" solo cuenta como existente si REALMENTE pertenece a
          // esta tienda — si viene de un export de OTRO tenant (migración),
          // productById.has() da false y cae a CREATE, como corresponde.
          if (producto_id && productById.has(producto_id)) {
            // UPDATE producto existente
            const updates: Record<string, any> = { name: nombre }
            if (row['descripcion']?.trim()) updates.description = row['descripcion'].trim()
            if (categoryId) updates.category_id = categoryId
            if (row['sku']?.trim()) updates.sku = row['sku'].trim()
            if (row['producto_activo'] !== undefined) updates.active = toBool(row['producto_activo'])
            const { error } = await service.from('products').update(updates).eq('id', producto_id).eq('tenant_id', tenantId)
            if (error) throw new Error(error.message)
            productId = producto_id
            productsUpdated++
          } else {
            // CREATE producto nuevo
            const { data: created, error } = await service.from('products').insert({
              id: randomUUID(),
              tenant_id: tenantId,
              name: nombre,
              slug: slugify(nombre) + '-' + Math.random().toString(36).slice(2, 6),
              description: row['descripcion']?.trim() || null,
              category_id: categoryId,
              sku: row['sku']?.trim() || null,
              active: toBool(row['producto_activo']),
            }).select('id').single()
            if (error) throw new Error(error.message)
            productId = created!.id
            productsCreated++
            productsCreatedThisRun.add(productId)

            // Imágenes solo se cargan al CREAR el producto — en un update no se
            // tocan para no duplicar ni pisar portada/orden ya curados a mano.
            const imageUrls = (row['imagenes'] ?? '').split(';').map(u => u.trim()).filter(Boolean)
            if (imageUrls.length > 0) {
              await service.from('product_images').insert(
                imageUrls.map((url, idx) => ({
                  id: randomUUID(), product_id: productId, url, sort_order: idx, is_cover: idx === 0,
                }))
              )
            }
          }
          groupKeyToProductId.set(groupKey, productId!)

          // ── Multi-categoría (tabla puente product_categories) ──────────
          // Solo se procesa una vez por producto (primera fila del grupo),
          // igual que las imágenes. Reemplaza el set completo — así una
          // reimportación del mismo CSV deja las categorías como en el
          // archivo, no las va acumulando.
          if (categoriasMulti.length > 0) {
            const resolvedIds = new Set<string>()
            for (const path of categoriasMulti) {
              const id = await resolveCategoryPath(path)
              if (id) resolvedIds.add(id)
            }
            if (resolvedIds.size > 0) {
              await service.from('product_categories').delete().eq('product_id', productId)
              await service.from('product_categories').insert(
                [...resolvedIds].map(category_id => ({ product_id: productId, category_id }))
              )
            }
          }
        }

        // ── Variante ──────────────────────────────────────────────────────
        const variante_id = row['variante_id']?.trim()
        const talle = row['talle']?.trim() || null
        const color = row['color']?.trim() || null
        const color_hex = normalizeHex(row['color_hex'] ?? '')
        const stock = toNum(row['stock'] ?? '') ?? 0
        const lowStockAlert = toNum(row['stock_alerta_baja'] ?? '')
        const variantActive = toBool(row['variante_activa'] ?? '')

        // Igual que con producto_id: un variante_id que no pertenece a ESTE
        // tenant/producto no cuenta como existente — si no, el UPDATE de abajo
        // afecta 0 filas en silencio (sin error) y la variante nunca se crea.
        const variantExists = variante_id
          && variantById.has(variante_id)
          && variantById.get(variante_id)!.product_id === productId

        let variantId = variantExists ? variante_id : undefined

        if (variantExists) {
          const { error } = await service.from('variants').update({
            size: talle, color, color_hex, stock,
            ...(lowStockAlert !== null && { low_stock_alert: lowStockAlert }),
            active: variantActive,
          }).eq('id', variante_id).eq('product_id', productId)
          if (error) throw new Error(error.message)
          variantsUpdated++
        } else {
          const { data: createdVariant, error } = await service.from('variants').insert({
            id: randomUUID(), product_id: productId, size: talle, color, color_hex,
            stock, low_stock_alert: lowStockAlert ?? 5, active: variantActive,
          }).select('id').single()
          if (error) throw new Error(error.message)
          variantId = createdVariant!.id
          variantsCreated++
        }

        // ── Precios ───────────────────────────────────────────────────────
        const precioMinorista = toNum(row['precio_minorista'] ?? '')
        const precioMinoristaTachado = toNum(row['precio_minorista_tachado'] ?? '')
        const precioMayorista = toNum(row['precio_mayorista'] ?? '')
        const precioMayoristaMinQty = toNum(row['precio_mayorista_min_qty'] ?? '') ?? 1
        // Columna genérica de CSVs externos (migraciones) — sin distinción
        // minorista/mayorista. Por criterio del negocio, ese precio entra
        // SIEMPRE como precio mayorista, nunca minorista.
        const precioGenerico = toNum(row['precio'] ?? '')

        async function upsertPriceRule(type: 'retail' | 'wholesale', price: number, minQty: number, compareAt: number | null) {
          const { data: existingRule } = await service
            .from('price_rules').select('id')
            .eq('variant_id', variantId).eq('type', type).eq('active', true)
            .limit(1).maybeSingle()
          if (existingRule) {
            await service.from('price_rules').update({
              price, min_qty: minQty, compare_at_price: compareAt,
            }).eq('id', existingRule.id)
          } else {
            await service.from('price_rules').insert({
              id: randomUUID(), variant_id: variantId, type, price, min_qty: minQty,
              compare_at_price: compareAt, active: true,
            })
          }
        }

        if (precioMinorista !== null) await upsertPriceRule('retail', precioMinorista, 1, precioMinoristaTachado)
        if (precioMayorista !== null) await upsertPriceRule('wholesale', precioMayorista, precioMayoristaMinQty, null)
        if (precioMinorista === null && precioMayorista === null && precioGenerico !== null) {
          await upsertPriceRule('wholesale', precioGenerico, precioMayoristaMinQty, null)
        }
      } catch (rowErr: any) {
        errors.push(`Fila ${rowNum}: ${rowErr.message}`)
      }
    }

    return NextResponse.json({
      ok: true,
      productsCreated, productsUpdated, variantsCreated, variantsUpdated,
      errors,
    })
  } catch (error: any) {
    console.error('Error importando CSV de productos:', error)
    return NextResponse.json({ error: error.message ?? 'Error interno' }, { status: 500 })
  }
}

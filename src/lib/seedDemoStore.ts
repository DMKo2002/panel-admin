// Llena una tienda recién creada con los datos demo de su template.
//
// 2026-10-01: antes la tienda arrancaba totalmente vacía. Ahora se copian los
// productos (con variantes y precios), categorías, imágenes, logo/hero y
// textos de la tienda demo del template (tenants con slug = template, ej.
// atelier.gounuri.com). Todo lo copiado queda marcado con is_demo = true para
// que el Panel Admin pueda avisar que son de ejemplo y ofrecer borrarlos.
//
// Los archivos de Storage se COPIAN (no se apunta a los del demo): así si el
// dueño borra una imagen, no se rompe el demo ni las otras tiendas.
//
// Best effort: si algo falla, se revierte lo demo insertado y la tienda queda
// vacía como antes — nunca debe frenar la creación del tenant.
//
// ⚠️ Hay una copia idéntica en Panel Admin/src/lib/seedDemoStore.ts (los dos
// create-tenant son archivos separados, ver creart_dual_registro_flow).
// Mantener sincronizado a mano.

import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET_PRODUCTS = 'product-images'
const BUCKET_ASSETS = 'store-assets'
const COPY_CONCURRENCY = 8

// Solo contenido/apariencia del template. A propósito NO se copia nada que el
// dueño cargó en el onboarding (contacto, redes, pagos, direcciones, SEO,
// legales, integraciones).
const CONFIG_COPY_COLS = [
  'primary_color', 'logo_url', 'favicon_url', 'hero_image_url',
  'hero_eyebrow', 'hero_title_line1', 'hero_title_italic', 'hero_title_line3',
  'hero_season', 'hero_subtitle', 'hero_text_color', 'nav_text_color',
  'collection_text_color', 'banner_bg_color', 'newsletter_bg_color',
  'blog_heading', 'blog_subheading', 'blog_posts', 'collection_posts',
  // Forma de los datos de las variantes del demo: los productos copiados
  // tienen que verse bien con la configuración con la que fueron cargados.
  'variant_attributes', 'variant_mode', 'product_image_ratio',
  'variant_column_type', 'variant_row_label', 'variant_column_label',
  'preferred_colors',
]

export type SeedDemoResult = {
  ok: boolean
  skipped?: string
  products?: number
  categories?: number
  images?: number
  error?: string
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

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

async function insertAll(service: SupabaseClient, table: string, rows: any[]) {
  for (const part of chunk(rows, 400)) {
    if (part.length === 0) continue
    const { error } = await service.from(table).insert(part)
    if (error) throw new Error(`insert ${table}: ${error.message}`)
  }
}

export async function seedDemoStore(service: SupabaseClient, tenantId: string, template: string): Promise<SeedDemoResult> {
  let seededSomething = false
  try {
    // Idempotencia: si ya tiene productos, no se toca nada.
    const { count: existing } = await service
      .from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId)
    if ((existing ?? 0) > 0) return { ok: true, skipped: 'ya tiene productos' }

    const { data: demoRows } = await service
      .from('tenants').select('id').eq('slug', template).eq('template', template).limit(1)
    const demoId: string | undefined = demoRows?.[0]?.id
    if (!demoId || demoId === tenantId) return { ok: true, skipped: 'sin tienda demo para este template' }

    const [catsRes, prodsRes, assetsRes, cfgRes] = await Promise.all([
      service.from('categories').select('*').eq('tenant_id', demoId),
      service.from('products').select('*').eq('tenant_id', demoId),
      service.from('store_assets').select('slot, url').eq('tenant_id', demoId),
      service.from('store_config').select(CONFIG_COPY_COLS.join(',')).eq('tenant_id', demoId).limit(1),
    ])
    for (const r of [catsRes, prodsRes, assetsRes, cfgRes]) {
      if (r.error) throw new Error(`leyendo demo: ${r.error.message}`)
    }
    const demoCats = (catsRes.data ?? []) as any[]
    const demoProds = (prodsRes.data ?? []) as any[]
    const demoAssets = (assetsRes.data ?? []) as any[]
    const demoCfg = (cfgRes.data?.[0] ?? null) as any

    const demoProductIds = demoProds.map(p => p.id)
    let demoPCats: any[] = []
    let demoVariants: any[] = []
    let demoImages: any[] = []
    if (demoProductIds.length > 0) {
      const [pcRes, vRes, imRes] = await Promise.all([
        service.from('product_categories').select('product_id, category_id').in('product_id', demoProductIds),
        service.from('variants').select('*, price_rules(*)').in('product_id', demoProductIds),
        service.from('product_images').select('*').in('product_id', demoProductIds),
      ])
      for (const r of [pcRes, vRes, imRes]) {
        if (r.error) throw new Error(`leyendo demo: ${r.error.message}`)
      }
      demoPCats = (pcRes.data ?? []) as any[]
      demoVariants = (vRes.data ?? []) as any[]
      demoImages = (imRes.data ?? []) as any[]
    }

    // ── IDs nuevos ─────────────────────────────────────────────────────────
    const catMap = new Map<string, string>(demoCats.map(c => [c.id, randomUUID()]))
    const prodMap = new Map<string, string>(demoProds.map(p => [p.id, randomUUID()]))

    // ── Filas de base de datos ─────────────────────────────────────────────
    seededSomething = true
    await insertAll(service, 'categories', demoCats.map(({ id, tenant_id, parent_id, ...c }) => ({
      ...c,
      id: catMap.get(id),
      tenant_id: tenantId,
      parent_id: parent_id ? (catMap.get(parent_id) ?? null) : null,
      is_demo: true,
    })))

    await insertAll(service, 'products', demoProds.map(({ id, tenant_id, category_id, created_at, updated_at, ...p }) => ({
      ...p,
      id: prodMap.get(id),
      tenant_id: tenantId,
      category_id: category_id ? (catMap.get(category_id) ?? null) : null,
      is_demo: true,
    })))

    await insertAll(service, 'product_categories', demoPCats
      .filter(pc => prodMap.has(pc.product_id) && catMap.has(pc.category_id))
      .map(pc => ({ product_id: prodMap.get(pc.product_id), category_id: catMap.get(pc.category_id) })))

    const variantRows: any[] = []
    const priceRuleRows: any[] = []
    for (const v of demoVariants) {
      const { id, product_id, price_rules, ...rest } = v
      const newProductId = prodMap.get(product_id)
      if (!newProductId) continue
      const newVariantId = randomUUID()
      variantRows.push({ ...rest, id: newVariantId, product_id: newProductId })
      for (const r of (price_rules ?? []) as any[]) {
        const { id: _rid, variant_id: _vid, ...rr } = r
        priceRuleRows.push({ ...rr, variant_id: newVariantId })
      }
    }
    await insertAll(service, 'variants', variantRows)
    await insertAll(service, 'price_rules', priceRuleRows)

    // ── Imágenes de producto: copia de archivos + filas ───────────────────
    const imageResults = await mapWithConcurrency(demoImages, COPY_CONCURRENCY, async (img: any) => {
      const newProductId = prodMap.get(img.product_id)
      if (!newProductId) return null
      const { id: _id, product_id: _pid, url, ...rest } = img
      const oldPath = storagePathFromUrl(url, BUCKET_PRODUCTS)
      // URL externa (no es de nuestro Storage): se conserva tal cual.
      if (!oldPath) return { ...rest, product_id: newProductId, url }
      const fileName = oldPath.split('/').pop() as string
      const newPath = `${tenantId}/${newProductId}/${fileName}`
      const { error } = await service.storage.from(BUCKET_PRODUCTS).copy(oldPath, newPath)
      if (error) {
        console.error('[seedDemoStore] no se pudo copiar', oldPath, error.message)
        return null
      }
      const { data: pub } = service.storage.from(BUCKET_PRODUCTS).getPublicUrl(newPath)
      return { ...rest, product_id: newProductId, url: pub.publicUrl }
    })
    const imageRows = imageResults.filter(Boolean) as any[]
    await insertAll(service, 'product_images', imageRows)

    // ── Assets de la tienda (logo, hero, colecciones, blog) ───────────────
    // Se copian TODOS los archivos de la carpeta del demo (no solo los que
    // tienen fila en store_assets), porque store_config.logo_url/hero pueden
    // apuntar a archivos sin fila propia.
    const copiedAssets = new Set<string>()
    const { data: assetFiles } = await service.storage.from(BUCKET_ASSETS).list(demoId, { limit: 1000 })
    const files = (assetFiles ?? []).filter((f: any) => f.id && f.name)
    await mapWithConcurrency(files, COPY_CONCURRENCY, async (f: any) => {
      const { error } = await service.storage.from(BUCKET_ASSETS).copy(`${demoId}/${f.name}`, `${tenantId}/${f.name}`)
      if (error) console.error('[seedDemoStore] no se pudo copiar asset', f.name, error.message)
      else copiedAssets.add(f.name)
    })

    const stamp = Date.now()
    const assetRows = demoAssets
      .map((a: any) => {
        const oldPath = storagePathFromUrl(a.url, BUCKET_ASSETS)
        const fileName = oldPath?.split('/').pop()
        if (!fileName || !copiedAssets.has(fileName)) return null
        const { data: pub } = service.storage.from(BUCKET_ASSETS).getPublicUrl(`${tenantId}/${fileName}`)
        return { tenant_id: tenantId, slot: a.slot, url: `${pub.publicUrl}?t=${stamp}` }
      })
      .filter(Boolean) as any[]
    await insertAll(service, 'store_assets', assetRows)

    // ── store_config: apariencia y textos del template ────────────────────
    if (demoCfg) {
      const rewritten = JSON.parse(
        JSON.stringify(demoCfg).split(`/${BUCKET_ASSETS}/${demoId}/`).join(`/${BUCKET_ASSETS}/${tenantId}/`)
      )
      const { error: cfgError } = await service.from('store_config').update(rewritten).eq('tenant_id', tenantId)
      if (cfgError) throw new Error(`store_config: ${cfgError.message}`)
    }

    return { ok: true, products: demoProds.length, categories: demoCats.length, images: imageRows.length }
  } catch (e: any) {
    console.error('[seedDemoStore] falló, se revierte lo demo insertado', e)
    if (seededSomething) {
      try {
        await service.from('products').delete().eq('tenant_id', tenantId).eq('is_demo', true)
        await service.from('categories').delete().eq('tenant_id', tenantId).eq('is_demo', true)
      } catch (e2) {
        console.error('[seedDemoStore] falló el rollback', e2)
      }
    }
    return { ok: false, error: e?.message ?? String(e) }
  }
}

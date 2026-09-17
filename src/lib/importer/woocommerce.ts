import { parseCsv, csvRowsToObjects } from '@/lib/csv'
import { processImageForUpload, type ImageQuality } from './image'

// Importador de catálogo estilo WooCommerce (export en español, mismas
// columnas que ya vinimos migrando a mano con importar-caloria.py /
// importar-iruda.py — "Nombre", "Tipo", "SKU", "Categorías", "Imágenes",
// "Precio normal", "Precio de oferta"/"Precio rebajado", "Superior",
// atributos 1/2, "¿En inventario?"). Pensado para correr en lotes chicos
// (ver /api/superadmin/importador/[jobId]/step) — cada llamada es
// stateless (no hay memoria compartida entre invocaciones serverless),
// así que todo lo que hace falta recordar entre lotes vive en la fila de
// `import_jobs` (product_keys, contadores), no acá.

export type StockMode = 'csv' | 'zero'
export type PriceType = 'retail' | 'wholesale'

export type WooRow = Record<string, string>

export function parseWooCsv(csvText: string): WooRow[] {
  return csvRowsToObjects(parseCsv(csvText))
}

// ── Agrupamiento: "padres" (variable/simple, se convierten en products) y
// "variaciones" (variation, se convierten en variants) ──────────────────
export function groupRows(rows: WooRow[]) {
  const padres = new Map<string, WooRow>()
  for (const r of rows) {
    if (r['Tipo'] === 'variable' || r['Tipo'] === 'simple') padres.set(r['ID'], r)
  }
  const padresBySku = new Map<string, WooRow>()
  for (const p of padres.values()) {
    const sku = (p['SKU'] || '').trim()
    if (sku) padresBySku.set(sku, p)
  }
  const variaciones = rows.filter(r => r['Tipo'] === 'variation')

  const varsByParent = new Map<string, WooRow[]>()
  for (const v of variaciones) {
    const sup = (v['Superior'] || '').trim()
    if (!sup) continue // filas de variación vacías/basura del export — se descartan en silencio
    let pid: string | null = null
    if (sup.startsWith('id:')) {
      const candidate = sup.replace('id:', '')
      if (padres.has(candidate)) pid = candidate
    } else {
      const parent = padresBySku.get(sup)
      if (parent) pid = parent['ID']
    }
    if (!pid) continue
    if (!varsByParent.has(pid)) varsByParent.set(pid, [])
    varsByParent.get(pid)!.push(v)
  }

  // Orden estable = orden de aparición en el CSV, para que el "cursor" de
  // avance del job (processed_products) sea determinístico entre llamadas.
  const orderedIds = Array.from(padres.keys())
  return { padres, varsByParent, orderedIds }
}

// ── Categorías: árbol completo (no aplanado), reutilizando las que ya
// existan en el tenant por slug ──────────────────────────────────────────
function parseCategoryPath(raw: string): string[] {
  return raw.split('>').map(p => p.trim()).filter(Boolean).map(titleCase)
}
function titleCase(s: string) {
  return s.replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
}
function slugify(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

const JUNK_CATEGORIES = new Set(['sin categorizar', 'new arrivals', 'oferta'])

export async function buildCategoryTree(
  service: any,
  tenantId: string,
  padres: Map<string, WooRow>,
  log: (msg: string, level?: 'info' | 'warn') => void
): Promise<Map<string, string>> {
  const allPaths = new Set<string>()
  for (const r of padres.values()) {
    for (const c of (r['Categorías'] || '').split(',')) {
      const raw = c.trim()
      if (!raw) continue
      const path = parseCategoryPath(raw)
      if (path.length === 0) continue
      if (JUNK_CATEGORIES.has(path[path.length - 1].toLowerCase())) continue
      allPaths.add(JSON.stringify(path))
    }
  }
  // Cada ancestro también necesita existir como nodo propio.
  const allNodes = new Set<string>()
  for (const pj of allPaths) {
    const path: string[] = JSON.parse(pj)
    for (let i = 1; i <= path.length; i++) allNodes.add(JSON.stringify(path.slice(0, i)))
  }

  const { data: existing } = await service.from('categories').select('id, slug').eq('tenant_id', tenantId)
  const bySlug = new Map<string, string>((existing ?? []).map((c: any) => [c.slug, c.id]))

  const sorted = Array.from(allNodes).sort((a, b) => JSON.parse(a).length - JSON.parse(b).length)
  let sortOrder = (existing ?? []).length

  for (const pj of sorted) {
    const path: string[] = JSON.parse(pj)
    const name = path[path.length - 1]
    const slug = slugify(path.join(' '))
    if (bySlug.has(slug)) continue
    const parentSlug = path.length > 1 ? slugify(path.slice(0, -1).join(' ')) : null
    const parentId = parentSlug ? bySlug.get(parentSlug) ?? null : null
    const { data: created, error } = await service.from('categories').insert({
      tenant_id: tenantId, name, slug, parent_id: parentId, active: true, sort_order: sortOrder++,
    }).select('id').single()
    if (error) { log(`No se pudo crear la categoría "${path.join(' > ')}": ${error.message}`, 'warn'); continue }
    bySlug.set(slug, created.id)
    log(`Categoría lista: ${path.join(' > ')}`)
  }

  return bySlug
}

/** Para llamadas de step posteriores al primero: todas las categorías que
 * hacen falta ya existen (se crearon en /start) — solo hace falta leerlas. */
export async function loadCategoriesBySlug(service: any, tenantId: string): Promise<Map<string, string>> {
  const { data } = await service.from('categories').select('id, slug').eq('tenant_id', tenantId)
  return new Map<string, string>((data ?? []).map((c: any) => [c.slug, c.id]))
}

function pickCategoriesForProduct(prod: WooRow, bySlug: Map<string, string>): string[] {
  const candidates: string[][] = []
  for (const c of (prod['Categorías'] || '').split(',')) {
    const raw = c.trim()
    if (!raw) continue
    const path = parseCategoryPath(raw)
    if (path.length && bySlug.has(slugify(path.join(' ')))) candidates.push(path)
  }
  // más específica (más profunda) primero
  candidates.sort((a, b) => b.length - a.length)
  return candidates.map(p => bySlug.get(slugify(p.join(' ')))!).filter(Boolean)
}

// ── Talles ────────────────────────────────────────────────────────────
const UNICO_RE = /^(talle\s*)?[uú]nic[oa]$/i
const STANDARD_TALLES = new Set(['XS', 'S', 'M', 'L', 'XL', 'XXL'])
export function normalizeTalle(raw: string, log: (msg: string, level?: 'info' | 'warn' | 'error') => void): string {
  const val = (raw || '').trim()
  if (!val) return 'Unico'
  if (UNICO_RE.test(val)) return 'Unico'
  const upper = val.toUpperCase()
  if (STANDARD_TALLES.has(upper)) return upper
  log(`Talle no estándar (se deja tal cual, revisar a mano): "${val}"`, 'warn')
  return val
}

// ── Atributos color/talle (posición 1 o 2, detectada por nombre) ────────
function attrNames(row: WooRow) {
  return [(row['Nombre del atributo 1'] || '').trim().toLowerCase(), (row['Nombre del atributo 2'] || '').trim().toLowerCase()]
}
function colorValue(row: WooRow): string {
  const [a1, a2] = attrNames(row)
  if (a1.includes('color')) return (row['Valor(es) del atributo 1'] || '').trim()
  if (a2.includes('color')) return (row['Valor(es) del atributo 2'] || '').trim()
  return ''
}
function talleValue(row: WooRow): string {
  const [a1, a2] = attrNames(row)
  if (a1.includes('talle') || a1.includes('size')) return (row['Valor(es) del atributo 1'] || '').trim()
  if (a2.includes('talle') || a2.includes('size')) return (row['Valor(es) del atributo 2'] || '').trim()
  return ''
}
function hexMapFromSwatches(parent: WooRow): Record<string, string | null> {
  try {
    const sw = JSON.parse(parent['Swatches Attributes'] || '{}')
    const terms = sw?.Color?.terms ?? {}
    const out: Record<string, string | null> = {}
    for (const k of Object.keys(terms)) out[k] = terms[k]?.color ?? null
    return out
  } catch { return {} }
}

// ── Precio ────────────────────────────────────────────────────────────
function priceAndCompare(row: WooRow): { precio: number; compare: number | null } {
  const precioRaw = parseFloat((row['Precio normal'] || '0').replace(',', '.'))
  let precio = Number.isFinite(precioRaw) ? Math.round(precioRaw) : 0
  const rebajadoRaw = (row['Precio de oferta'] || row['Precio rebajado'] || '').trim()
  let compare: number | null = null
  if (rebajadoRaw) {
    const n = parseFloat(rebajadoRaw.replace(',', '.'))
    if (Number.isFinite(n)) compare = Math.round(n)
  }
  if (compare != null && compare < precio) { const tmp = precio; precio = compare; compare = tmp }
  else if (compare === precio) compare = null
  return { precio, compare }
}

// ── Stock ─────────────────────────────────────────────────────────────
function resolveStock(row: WooRow, stockMode: StockMode, name: string, log: (msg: string, level?: 'info' | 'warn' | 'error') => void): { stock: number; active: boolean } {
  if (stockMode === 'zero') return { stock: 0, active: true }

  const flag = (row['¿En inventario?'] ?? '').trim()
  if (flag === '0') return { stock: 0, active: false }

  const numericRaw = (row['Inventario'] ?? row['Stock'] ?? '').trim()
  if (numericRaw !== '') {
    const n = parseInt(numericRaw, 10)
    if (Number.isFinite(n)) return { stock: Math.max(0, n), active: n > 0 }
  }
  // Sin conteo numérico disponible en el CSV — activa con stock 0, a cargar a mano.
  log(`Stock real sin confirmar para "${name}" — quedó activo con stock 0`, 'warn')
  return { stock: 0, active: true }
}

// ── Descarga de imagen desde la URL de origen ────────────────────────
async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(20000) })
    if (!resp.ok) return null
    const arr = await resp.arrayBuffer()
    return Buffer.from(arr)
  } catch {
    return null
  }
}

export interface ImportContext {
  service: any
  tenantId: string
  stockMode: StockMode
  priceType: PriceType
  imageQuality: ImageQuality
  imageRatio: '1:1' | '2:3'
  categoriesBySlug: Map<string, string>
  varsByParent: Map<string, WooRow[]>
  log: (msg: string, level?: 'info' | 'warn' | 'error') => void
}

export interface ProductOutcome {
  created: boolean
  skipped: boolean
  variantsCreated: number
  imagesUploaded: number
  imagesFailed: number
}

/** Procesa un único producto padre (con sus variaciones) — idempotente:
 * si ya existe por SKU/nombre y ya tiene variantes, no hace nada. */
export async function importOneProduct(ctx: ImportContext, pid: string, prod: WooRow): Promise<ProductOutcome> {
  const { service, tenantId, log } = ctx
  const name = (prod['Nombre'] || '').trim()
  if (!name) return { created: false, skipped: true, variantsCreated: 0, imagesUploaded: 0, imagesFailed: 0 }

  const skuVal = (prod['SKU'] || '').trim()

  let existing: any = null
  if (skuVal) {
    const { data } = await service.from('products').select('id, slug').eq('tenant_id', tenantId).eq('sku', skuVal).limit(1)
    existing = data?.[0] ?? null
  } else {
    const { data } = await service.from('products').select('id, slug').eq('tenant_id', tenantId).eq('name', name).limit(1)
    existing = data?.[0] ?? null
  }

  let productId: string
  let slug: string
  let mustCreateImagesAndVariants = true

  if (existing) {
    productId = existing.id
    slug = existing.slug
    const { data: existingVariants } = await service.from('variants').select('id').eq('product_id', productId).limit(1)
    if (existingVariants && existingVariants.length > 0) {
      log(`Ya importado, salteado: ${name}`)
      return { created: false, skipped: true, variantsCreated: 0, imagesUploaded: 0, imagesFailed: 0 }
    }
    mustCreateImagesAndVariants = true
    log(`Producto existe sin variantes, completando: ${name}`)
  } else {
    const categoryIds = pickCategoriesForProduct(prod, ctx.categoriesBySlug)
    const primaryCategoryId = categoryIds[0] ?? null

    const baseSlug = slugify(name)
    slug = baseSlug
    let counter = 1
    for (;;) {
      const { data: clash } = await service.from('products').select('id').eq('tenant_id', tenantId).eq('slug', slug).limit(1)
      if (!clash || clash.length === 0) break
      slug = `${baseSlug}-${counter++}`
    }

    const { data: createdProduct, error } = await service.from('products').insert({
      tenant_id: tenantId,
      name,
      slug,
      description: prod['Descripción corta'] || prod['Descripción'] || null,
      category_id: primaryCategoryId,
      active: (prod['Publicado'] ?? '1') === '1',
      sku: skuVal || null,
    }).select('id').single()

    if (error || !createdProduct) {
      log(`No se pudo crear "${name}": ${error?.message ?? 'sin id'}`, 'error')
      return { created: false, skipped: false, variantsCreated: 0, imagesUploaded: 0, imagesFailed: 0 }
    }
    productId = createdProduct.id

    if (categoryIds.length > 0) {
      await service.from('product_categories').insert(categoryIds.map(category_id => ({ product_id: productId, category_id })))
    }
  }

  let imagesUploaded = 0
  let imagesFailed = 0

  if (mustCreateImagesAndVariants && !existing) {
    // ── Imágenes: se descargan, procesan (calidad elegida) y re-alojan en
    // Storage ANTES de crear la fila — si falla, no se crea referencia
    // rota (mejor sin foto que con un link muerto al hosting viejo).
    const seen = new Set<string>()
    const urls: string[] = []
    for (const u of (prod['Imágenes'] || '').split(',')) {
      const t = u.trim()
      if (t && !seen.has(t)) { seen.add(t); urls.push(t) }
    }
    for (let idx = 0; idx < urls.length; idx++) {
      const raw = await downloadImage(urls[idx])
      if (!raw) { imagesFailed++; log(`Imagen ${idx + 1}/${urls.length} de "${name}": no se pudo descargar`, 'warn'); continue }
      let processed: Buffer
      try {
        processed = await processImageForUpload(raw, ctx.imageRatio, ctx.imageQuality)
      } catch (e: any) {
        imagesFailed++; log(`Imagen ${idx + 1}/${urls.length} de "${name}": no se pudo procesar (${e?.message})`, 'warn'); continue
      }
      const path = `${tenantId}/${slug}-${idx}.jpg`
      const { error: upErr } = await service.storage.from('product-images').upload(path, processed, {
        upsert: true, contentType: 'image/jpeg', cacheControl: '31536000',
      })
      if (upErr) { imagesFailed++; log(`Imagen ${idx + 1}/${urls.length} de "${name}": error al subir (${upErr.message})`, 'warn'); continue }
      const { data: { publicUrl } } = service.storage.from('product-images').getPublicUrl(path)
      await service.from('product_images').insert({
        product_id: productId, url: publicUrl, sort_order: idx, is_cover: idx === 0, size_bytes: processed.byteLength,
      })
      imagesUploaded++
      log(`Imagen ${idx + 1}/${urls.length} subida (${slug}-${idx}.jpg, ${Math.round(processed.byteLength / 1024)}KB)`)
    }
  }

  // ── Variantes ──
  const linked = ctx.varsByParent.get(pid) ?? []
  let conPrecio = linked.filter(v => (v['Precio normal'] || '').trim())
  if (conPrecio.length === 0 && (prod['Precio normal'] || '').trim()) conPrecio = [prod]
  const reales = conPrecio.filter(v => v !== prod && colorValue(v))
  const hexByColor = hexMapFromSwatches(prod)

  let variantsCreated = 0
  async function crearVariante(size: string, color: string | null, sku: string | undefined, precio: number, compare: number | null, stockRow: WooRow) {
    const { stock, active } = resolveStock(stockRow, ctx.stockMode, name, log)
    const talleNorm = normalizeTalle(size, log)
    const { data: vres, error: vErr } = await service.from('variants').insert({
      product_id: productId, size: talleNorm, color: color || null,
      color_hex: color ? hexByColor[color] ?? null : null,
      sku: sku || null, stock, active,
    }).select('id').single()
    if (vErr || !vres) { log(`Variante de "${name}": ${vErr?.message}`, 'error'); return }
    await service.from('price_rules').insert({
      variant_id: vres.id, type: ctx.priceType, min_qty: 1, price: precio, compare_at_price: compare, active: true,
    })
    variantsCreated++
  }

  if (reales.length > 0) {
    const vistos = new Set<string>()
    for (const v of reales) {
      const color = colorValue(v)
      const size = talleValue(v) || 'Unico'
      const key = `${color}::${size}`
      if (vistos.has(key)) continue
      vistos.add(key)
      const { precio, compare } = priceAndCompare(v)
      await crearVariante(size, color, v['SKU'], precio, compare, v)
    }
  } else {
    const [a1n, a2n] = attrNames(prod)
    let colors: string[] = [], talles: string[] = []
    if (a1n.includes('color')) {
      colors = (prod['Valor(es) del atributo 1'] || '').split(',').map(c => c.trim()).filter(Boolean)
      talles = (prod['Valor(es) del atributo 2'] || '').split(',').map(t => t.trim()).filter(Boolean)
    } else if (a2n.includes('color')) {
      colors = (prod['Valor(es) del atributo 2'] || '').split(',').map(c => c.trim()).filter(Boolean)
      talles = (prod['Valor(es) del atributo 1'] || '').split(',').map(t => t.trim()).filter(Boolean)
    }
    if (colors.length === 0) colors = ['']
    if (talles.length === 0) talles = ['Unico']

    let precio = 0, compare: number | null = null
    if (conPrecio.length > 0) ({ precio, compare } = priceAndCompare(conPrecio[0]))
    const skuFallback = conPrecio[0]?.['SKU']

    for (const color of colors) {
      for (const size of talles) {
        await crearVariante(size, color || null as any, skuFallback, precio, compare, prod)
      }
    }
  }

  log(`OK: ${name} (${variantsCreated} variante/s, ${imagesUploaded} imagen/es)`)
  return { created: !existing, skipped: false, variantsCreated, imagesUploaded, imagesFailed }
}

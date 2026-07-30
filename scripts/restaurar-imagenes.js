#!/usr/bin/env node
/**
 * Restaura las imágenes de producto de Caloria y Yenine desde sus sitios
 * WooCommerce originales (que siguen online), deshaciendo la recompresión
 * agresiva del 2026-07-30.
 *
 * Cómo funciona: replica el mapeo de los scripts de importación —
 *   storage path = {TENANT_ID}/{product_slug}-{idx}.{ext}
 * matcheando cada fila del CSV de WooCommerce (por SKU, si no por nombre)
 * contra la tabla products para obtener el slug real. Después descarga la
 * imagen original de la URL del CSV y la sube ENCIMA del path existente.
 *
 * Por default aplica una compresión suave (máx 2000px, JPEG q90) que es
 * visualmente indistinguible del original pero no repite el problema de
 * egress. Con --raw sube el original byte a byte.
 *
 * Solo sobrescribe archivos que YA existen en storage (no crea huérfanos).
 *
 * Uso:
 *   node scripts/restaurar-imagenes.js            ← dry run
 *   node scripts/restaurar-imagenes.js --apply    ← restaurar
 *   node scripts/restaurar-imagenes.js --apply --raw   ← originales sin comprimir
 */

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local')
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (!process.env[key]) process.env[key] = value
  }
}
loadEnvLocal()

const APPLY = process.argv.includes('--apply')
const RAW = process.argv.includes('--raw')

let sharp = null
if (!RAW) {
  try { sharp = require('sharp') } catch { console.error('Falta sharp: npm install (o usar --raw)'); process.exit(1) }
}

const CSV_YENINE_DEMO = path.join(__dirname, '..', '..', 'wc-product-export.csv')

const TENANTS = [
  {
    nombre: 'Caloria',
    tenantId: '14ba1f61-611b-487e-9523-0a472b45dc38',
    csv: path.join(__dirname, '..', '..', 'wc-caloria-export.csv'),
  },
  {
    nombre: 'Yenine',
    tenantId: '76876126-7cdb-45d7-abc5-335921cc0dc2',
    csv: path.join(__dirname, '..', '..', 'wc-yenine-export.csv'),
  },
  // Demos — también fueron recomprimidos (sus UUIDs con ceros van primero en
  // el orden alfabético del bucket). Sus catálogos salieron del export viejo
  // de Yenine; los productos que no matcheen se saltean y se loguean.
  // El demo de glow se restaura aparte: node scripts/upload-glow-cosmeticos-images.js --sobrescribir
  { nombre: 'Demo Mono',        tenantId: '00000000-0000-0000-0000-000000000002', csv: CSV_YENINE_DEMO },
  { nombre: 'Demo Atelier',     tenantId: '00000000-0000-0000-0000-000000000003', csv: CSV_YENINE_DEMO },
  { nombre: 'Demo Axis',        tenantId: '00000000-0000-0000-0000-000000000004', csv: CSV_YENINE_DEMO },
  { nombre: 'Demo Minimalista', tenantId: '00000000-0000-0000-0000-000000000005', csv: CSV_YENINE_DEMO },
  { nombre: 'Demo Bazaar',      tenantId: '00000000-0000-0000-0000-000000000006', csv: CSV_YENINE_DEMO },
]

const BUCKET = 'product-images'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// ── Parser CSV mínimo (maneja comillas y comas internas) ─────────────────────
function parseCSV(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  const headers = rows[0]
  return rows.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])))
}

function extDe(url) {
  const e = url.split('.').pop().split('?')[0].toLowerCase()
  return ['jpg', 'jpeg', 'png', 'webp'].includes(e) ? e : 'jpg'
}

function mb(b) { return (b / (1024 * 1024)).toFixed(2) + ' MB' }

async function existeEnStorage(pathArchivo) {
  const dir = pathArchivo.split('/').slice(0, -1).join('/')
  const nombre = pathArchivo.split('/').pop()
  const { data } = await supabase.storage.from(BUCKET).list(dir, { limit: 1000, search: nombre })
  return !!data?.some(f => f.name === nombre)
}

async function procesarTenant({ nombre, tenantId, csv }) {
  console.log(`\n════ ${nombre} (${tenantId}) ════`)
  if (!fs.existsSync(csv)) { console.error(`  CSV no encontrado: ${csv}`); return { ok: 0, fail: 0 } }

  const rows = parseCSV(fs.readFileSync(csv, 'utf8').replace(/^﻿/, ''))
  const imgCol = Object.keys(rows[0]).find(k => k.includes('magen')) ?? 'Imágenes'
  const padres = rows.filter(r => r['Tipo'] === 'variable' && (r[imgCol] ?? '').trim())
  console.log(`  ${padres.length} productos con imágenes en el CSV`)

  let ok = 0, fail = 0, saltados = 0

  for (const row of padres) {
    const skuVal = (row['SKU'] ?? '').trim()
    const nombreProd = (row['Nombre'] ?? '').trim()

    // Buscar el producto para obtener el slug real (mismo criterio del import)
    let prod = null
    if (skuVal) {
      const { data } = await supabase.from('products').select('id, slug').eq('tenant_id', tenantId).eq('sku', skuVal).limit(1)
      prod = data?.[0] ?? null
    }
    if (!prod) {
      const { data } = await supabase.from('products').select('id, slug').eq('tenant_id', tenantId).eq('name', nombreProd).limit(1)
      prod = data?.[0] ?? null
    }
    if (!prod?.slug) { console.warn(`  ? sin match en DB: "${nombreProd}"`); fail++; continue }

    const urls = row[imgCol].split(',').map(u => u.trim()).filter(Boolean)
    for (let idx = 0; idx < urls.length; idx++) {
      const url = urls[idx]
      const ext = extDe(url)
      const storagePath = `${tenantId}/${prod.slug}-${idx}.${ext}`

      if (!(await existeEnStorage(storagePath))) { saltados++; continue }

      let resp
      try {
        resp = await fetch(url)
      } catch (e) { console.warn(`  ✗ ${url}: ${e.message}`); fail++; continue }
      if (!resp.ok) { console.warn(`  ✗ HTTP ${resp.status}: ${url}`); fail++; continue }
      let buf = Buffer.from(await resp.arrayBuffer())
      const pesoOriginal = buf.length

      if (!RAW && sharp) {
        try {
          let p = sharp(buf).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
          if (ext === 'png') p = p.png({ compressionLevel: 9 })
          else if (ext === 'webp') p = p.webp({ quality: 90 })
          else p = p.jpeg({ quality: 90, mozjpeg: true })
          const out = await p.toBuffer()
          if (out.length < buf.length) buf = out
        } catch { /* si sharp falla, subir el original tal cual */ }
      }

      console.log(`  ${APPLY ? '✔' : '→'} ${storagePath} (${mb(pesoOriginal)}${buf.length !== pesoOriginal ? ` → ${mb(buf.length)}` : ''})`)

      if (APPLY) {
        const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
        const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buf, {
          upsert: true, contentType, cacheControl: '31536000',
        })
        if (error) { console.warn(`  ✗ upload ${storagePath}: ${error.message}`); fail++; continue }
      }
      ok++
    }
  }

  console.log(`  Resultado: ${ok} imágenes ${APPLY ? 'restauradas' : 'a restaurar'}, ${fail} problemas, ${saltados} sin archivo previo en storage (saltadas)`)
  return { ok, fail }
}

// ── Demo Glow: sus imágenes vienen del script upload-glow-cosmeticos-images.js
// (URLs de stylekorean), pero se subieron a paths aleatorios — acá matcheamos
// cada producto por nombre y pisamos el path REAL que figura en product_images.
async function procesarGlow() {
  const GLOW_TENANT_ID = '00000000-0000-0000-0000-000000000007'
  console.log(`\n════ Demo Glow (${GLOW_TENANT_ID}) ════`)

  const scriptSrc = fs.readFileSync(path.join(__dirname, 'upload-glow-cosmeticos-images.js'), 'utf8')
  const m = scriptSrc.match(/const PRODUCTS = (\[[\s\S]*?\n\])/)
  if (!m) { console.error('  No se pudo leer PRODUCTS del script de glow'); return }
  // eslint-disable-next-line no-eval
  const productos = eval(m[1])
  console.log(`  ${productos.length} productos en el script original`)

  let ok = 0, fail = 0
  for (const p of productos) {
    const { data: prods } = await supabase.from('products').select('id').eq('tenant_id', GLOW_TENANT_ID).eq('name', p.nombre).limit(1)
    const prodId = prods?.[0]?.id
    if (!prodId) { console.warn(`  ? sin match en DB: "${p.nombre}"`); fail++; continue }

    const { data: imgs } = await supabase.from('product_images').select('url').eq('product_id', prodId).order('sort_order').limit(1)
    const url = imgs?.[0]?.url
    if (!url) { console.warn(`  ? "${p.nombre}" sin imagen en DB`); fail++; continue }

    const marker = '/object/public/' + BUCKET + '/'
    const i = url.indexOf(marker)
    if (i === -1) { console.warn(`  ? URL rara: ${url}`); fail++; continue }
    const storagePath = decodeURIComponent(url.slice(i + marker.length).split('?')[0])

    let resp
    try { resp = await fetch(p.imagen, { headers: { 'User-Agent': 'Mozilla/5.0' } }) } catch (e) { console.warn(`  ✗ ${p.imagen}: ${e.message}`); fail++; continue }
    if (!resp.ok) { console.warn(`  ✗ HTTP ${resp.status}: ${p.imagen}`); fail++; continue }
    let buf = Buffer.from(await resp.arrayBuffer())

    const ext = extDe(storagePath)
    if (!RAW && sharp) {
      try {
        let pipe = sharp(buf).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
        if (ext === 'png') pipe = pipe.png({ compressionLevel: 9 })
        else if (ext === 'webp') pipe = pipe.webp({ quality: 90 })
        else pipe = pipe.jpeg({ quality: 90, mozjpeg: true })
        const out = await pipe.toBuffer()
        if (out.length < buf.length) buf = out
      } catch { /* subir original */ }
    }

    console.log(`  ${APPLY ? '✔' : '→'} ${storagePath} (${mb(buf.length)})`)
    if (APPLY) {
      const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
      const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buf, { upsert: true, contentType, cacheControl: '31536000' })
      if (error) { console.warn(`  ✗ upload: ${error.message}`); fail++; continue }
    }
    ok++
  }
  console.log(`  Resultado: ${ok} ${APPLY ? 'restauradas' : 'a restaurar'}, ${fail} problemas`)
}

async function main() {
  console.log(APPLY ? `── MODO APPLY${RAW ? ' (RAW, sin comprimir)' : ' (compresión suave q90)'} ──` : '── DRY RUN — usar --apply para restaurar ──')
  for (const t of TENANTS) await procesarTenant(t)
  await procesarGlow()
  console.log('\nListo. Refrescar las pestañas de las tiendas después de aplicar (la URL no cambia, el cache del browser puede tardar).')
}

main().catch(e => { console.error(e); process.exit(1) })

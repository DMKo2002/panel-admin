#!/usr/bin/env node
/**
 * Recomprime las imágenes YA subidas en Supabase Storage (buckets
 * product-images y store-assets). La compresión automática del Panel solo
 * aplica a subidas nuevas — este script arregla el stock histórico (los heros
 * de 3-4 MB que reventaron el egress).
 *
 * Qué hace por cada imagen de más de 200 KB:
 *   - la descarga
 *   - la redimensiona a máx 1920px de lado mayor (respetando EXIF)
 *   - la re-encodea EN EL MISMO FORMATO (jpg→jpg q80, png→png máx compresión,
 *     webp→webp q80) para que la URL y el content-type no cambien — así no
 *     hay que tocar ninguna fila de la DB
 *   - si el resultado es al menos 10% más liviano, la sube encima (upsert)
 *     con cacheControl de 1 año
 *
 * Requiere: npm install (sharp está en devDependencies)
 *
 * Uso:
 *   node scripts/recomprimir-imagenes.js            ← dry run: muestra qué haría
 *   node scripts/recomprimir-imagenes.js --apply    ← recomprime en serio
 *
 * IMPORTANTE: después de correrlo con --apply, refrescar las pestañas del
 * Panel Admin / tiendas abiertas. Las imágenes cacheadas en Vercel o en el
 * browser pueden tardar en reflejarse (la URL no cambia).
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

let sharp
try {
  sharp = require('sharp')
} catch {
  console.error('Falta sharp. Correr primero:  npm install')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')
const BUCKETS = ['product-images', 'store-assets']
const UMBRAL_BYTES = 200 * 1024 // solo tocar imágenes de más de 200 KB
const MAX_DIM = 1920
const MEJORA_MINIMA = 0.9 // subir solo si queda al menos 10% más liviana

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Lista recursiva de un bucket (list() es por "carpeta")
async function listarRecursivo(bucket, prefix = '') {
  const out = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset })
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`)
    if (!data || data.length === 0) break
    for (const item of data) {
      const full = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id === null) {
        // es una "carpeta"
        out.push(...await listarRecursivo(bucket, full))
      } else {
        out.push({ path: full, size: item.metadata?.size ?? 0, mimetype: item.metadata?.mimetype ?? '' })
      }
    }
    if (data.length < 1000) break
    offset += 1000
  }
  return out
}

function formatoDe(p) {
  const ext = p.split('.').pop().toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg'
  if (ext === 'png') return 'png'
  if (ext === 'webp') return 'webp'
  return null // svg, gif, mp4, etc. — no tocar
}

function mb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

async function main() {
  console.log(APPLY ? '── MODO APPLY: se van a sobrescribir imágenes ──' : '── DRY RUN (sin cambios) — usar --apply para ejecutar ──')
  let totalAntes = 0
  let totalDespues = 0
  let procesadas = 0
  let saltadas = 0

  for (const bucket of BUCKETS) {
    console.log(`\nBucket: ${bucket}`)
    const archivos = await listarRecursivo(bucket)
    console.log(`  ${archivos.length} archivos encontrados`)

    for (const f of archivos) {
      const formato = formatoDe(f.path)
      if (!formato || f.size < UMBRAL_BYTES) { saltadas++; continue }

      const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(f.path)
      if (dlErr) { console.warn(`  ✗ ${f.path}: no se pudo descargar (${dlErr.message})`); continue }
      const original = Buffer.from(await blob.arrayBuffer())

      let pipeline = sharp(original).rotate().resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
      if (formato === 'jpeg') pipeline = pipeline.jpeg({ quality: 80, mozjpeg: true })
      else if (formato === 'png') pipeline = pipeline.png({ compressionLevel: 9, palette: true })
      else pipeline = pipeline.webp({ quality: 80 })

      let comprimida
      try {
        comprimida = await pipeline.toBuffer()
      } catch (e) {
        console.warn(`  ✗ ${f.path}: sharp falló (${e.message})`)
        continue
      }

      if (comprimida.length > original.length * MEJORA_MINIMA) { saltadas++; continue }

      totalAntes += original.length
      totalDespues += comprimida.length
      procesadas++
      console.log(`  ${APPLY ? '✔' : '→'} ${f.path}: ${mb(original.length)} → ${mb(comprimida.length)}`)

      if (APPLY) {
        const contentType = formato === 'jpeg' ? 'image/jpeg' : formato === 'png' ? 'image/png' : 'image/webp'
        const { error: upErr } = await supabase.storage.from(bucket).upload(f.path, comprimida, {
          upsert: true,
          contentType,
          cacheControl: '31536000',
        })
        if (upErr) console.warn(`  ✗ ${f.path}: no se pudo subir (${upErr.message})`)
      }
    }
  }

  console.log('\n──────────────────────────────────')
  console.log(`Imágenes a recomprimir: ${procesadas} (${saltadas} saltadas por chicas/óptimas/no-imagen)`)
  console.log(`Peso total: ${mb(totalAntes)} → ${mb(totalDespues)} (ahorro ${totalAntes > 0 ? Math.round((1 - totalDespues / totalAntes) * 100) : 0}%)`)
  if (!APPLY && procesadas > 0) console.log('\nPara aplicar de verdad:  node scripts/recomprimir-imagenes.js --apply')
}

main().catch(e => { console.error(e); process.exit(1) })

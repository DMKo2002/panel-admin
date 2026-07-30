#!/usr/bin/env node
/**
 * Restaura las fotos de los 6 productos demo (Falda Jean, Sweater Capa,
 * Sweater trenza, Falda de lana, Sweater de lana, Sweater rayado) en TODOS
 * los tenants demo, a partir de las fotos originales puestas en una carpeta
 * local. Esos productos se crearon a mano (no vienen de ningún CSV), así que
 * no hay fuente online — hay que aportar las fotos originales.
 *
 * CÓMO USAR:
 * 1. Crear la carpeta  scripts/fotos-demo/  y poner ahí las fotos con este
 *    nombre:  {nombre-del-producto}-{numero}.jpg  (numeradas desde 1, en el
 *    mismo orden en que aparecen en la tienda). Ejemplos:
 *      falda-jean-1.jpg        falda-jean-2.jpg
 *      sweater-capa-1.jpg
 *      sweater-trenza-1.jpg
 *      falda-de-lana-1.jpg
 *      sweater-de-lana-1.jpg
 *      sweater-rayado-1.jpg
 *    (también sirven .png y .webp)
 * 2. node scripts/restaurar-demo-productos.js            ← dry run
 * 3. node scripts/restaurar-demo-productos.js --apply    ← restaurar
 *
 * El script busca en cada tenant demo el producto cuyo nombre normalizado
 * coincida con el prefijo del archivo, y sobrescribe la imagen N del producto
 * (por sort_order) con la foto N de la carpeta. Las URLs no cambian.
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
const FOTOS_DIR = path.join(__dirname, 'fotos-demo')
const BUCKET = 'product-images'

let sharp = null
if (!RAW) {
  try { sharp = require('sharp') } catch { console.error('Falta sharp: npm install (o usar --raw)'); process.exit(1) }
}

const DEMO_TENANTS = [
  { nombre: 'Demo Mono',        id: '00000000-0000-0000-0000-000000000002' },
  { nombre: 'Demo Atelier',     id: '00000000-0000-0000-0000-000000000003' },
  { nombre: 'Demo Axis',        id: '00000000-0000-0000-0000-000000000004' },
  { nombre: 'Demo Minimalista', id: '00000000-0000-0000-0000-000000000005' },
  { nombre: 'Demo Bazaar',      id: '00000000-0000-0000-0000-000000000006' },
  { nombre: 'Demo Glow',        id: '00000000-0000-0000-0000-000000000007' },
]

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// "Sweater trenza" → "sweater-trenza" (sin acentos, minúsculas, guiones)
function normalizar(nombre) {
  return nombre.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function cargarFotos() {
  if (!fs.existsSync(FOTOS_DIR)) {
    console.error(`No existe la carpeta ${FOTOS_DIR}`)
    console.error('Creala y poné ahí las fotos (ver instrucciones arriba del script).')
    process.exit(1)
  }
  // { 'falda-jean': ['falda-jean-1.jpg', 'falda-jean-2.jpg'], ... }
  const grupos = {}
  for (const f of fs.readdirSync(FOTOS_DIR).sort()) {
    // Acepta también la doble extensión típica de Windows (falda-1.jpg.png):
    // lo que importa es el nombre y el número — el formato real lo detecta sharp.
    const m = f.match(/^(.+?)-(\d+)(?:\.(?:jpg|jpeg|png|webp))*\.(jpg|jpeg|png|webp)$/i)
    if (!m) { console.warn(`  (ignorado: ${f} — no cumple el formato nombre-N.ext)`); continue }
    const clave = m[1].toLowerCase()
    grupos[clave] = grupos[clave] ?? []
    grupos[clave].push({ archivo: f, orden: parseInt(m[2], 10) })
  }
  for (const k of Object.keys(grupos)) grupos[k].sort((a, b) => a.orden - b.orden)
  return grupos
}

async function comprimirSuave(buf, ext) {
  if (RAW || !sharp) return buf
  try {
    let p = sharp(buf).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    if (ext === 'png') p = p.png({ compressionLevel: 9 })
    else if (ext === 'webp') p = p.webp({ quality: 90 })
    else p = p.jpeg({ quality: 90, mozjpeg: true })
    const out = await p.toBuffer()
    return out.length < buf.length ? out : buf
  } catch { return buf }
}

function pathDeUrl(url) {
  const marker = '/object/public/' + BUCKET + '/'
  const i = url.indexOf(marker)
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split('?')[0])
}

async function main() {
  console.log(APPLY ? '── MODO APPLY ──' : '── DRY RUN — usar --apply para restaurar ──')
  const fotos = cargarFotos()
  const claves = Object.keys(fotos)
  if (claves.length === 0) { console.error('No hay fotos válidas en la carpeta.'); process.exit(1) }
  console.log(`Fotos cargadas: ${claves.map(k => `${k} (${fotos[k].length})`).join(', ')}\n`)

  let ok = 0, fail = 0
  for (const tenant of DEMO_TENANTS) {
    console.log(`════ ${tenant.nombre} ════`)
    const { data: prods, error } = await supabase.from('products').select('id, name').eq('tenant_id', tenant.id)
    if (error) { console.warn(`  error leyendo products: ${error.message}`); continue }
    let matchesTenant = 0

    for (const prod of prods ?? []) {
      const clave = normalizar(prod.name)
      const grupo = fotos[clave]
      if (!grupo) continue
      matchesTenant++

      const { data: imgs } = await supabase.from('product_images').select('id, url, sort_order').eq('product_id', prod.id).order('sort_order')
      if (!imgs?.length) { console.warn(`  ? "${prod.name}" no tiene imágenes en DB`); continue }

      for (let i = 0; i < Math.min(imgs.length, grupo.length); i++) {
        const storagePath = pathDeUrl(imgs[i].url)
        if (!storagePath) { console.warn(`  ? URL rara: ${imgs[i].url}`); fail++; continue }

        const extDestino = storagePath.split('.').pop().toLowerCase()
        let buf = fs.readFileSync(path.join(FOTOS_DIR, grupo[i].archivo))

        // Si el formato local difiere del destino, convertir para no romper el content-type
        if (sharp && !RAW) {
          const conv = sharp(buf).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
          if (extDestino === 'png') buf = await conv.png({ compressionLevel: 9 }).toBuffer()
          else if (extDestino === 'webp') buf = await conv.webp({ quality: 90 }).toBuffer()
          else buf = await conv.jpeg({ quality: 90, mozjpeg: true }).toBuffer()
        } else {
          buf = await comprimirSuave(buf, extDestino)
        }

        console.log(`  ${APPLY ? '✔' : '→'} "${prod.name}" [${i}] ← ${grupo[i].archivo} → ${storagePath} (${(buf.length / 1024).toFixed(0)} KB)`)

        if (APPLY) {
          const contentType = extDestino === 'png' ? 'image/png' : extDestino === 'webp' ? 'image/webp' : 'image/jpeg'
          const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, buf, { upsert: true, contentType, cacheControl: '31536000' })
          if (upErr) { console.warn(`  ✗ ${storagePath}: ${upErr.message}`); fail++; continue }
        }
        ok++
      }
    }

    // Diagnóstico: si no matcheó nada, mostrar qué productos tiene este tenant
    if (matchesTenant === 0) {
      const nombres = (prods ?? []).map(p => p.name)
      if (nombres.length === 0) console.log('  (este tenant no tiene productos)')
      else console.log(`  (sin matches — productos de este tenant: ${nombres.slice(0, 15).join(' | ')}${nombres.length > 15 ? ' …' : ''})`)
    }
  }
  console.log(`\nTotal: ${ok} imágenes ${APPLY ? 'restauradas' : 'a restaurar'}, ${fail} problemas.`)
  console.log('Después de aplicar: Ctrl+F5 en las tiendas (la URL no cambia, es cache del browser).')
}

main().catch(e => { console.error(e); process.exit(1) })

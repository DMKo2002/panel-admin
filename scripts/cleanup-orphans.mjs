// Borra en lote los archivos huérfanos de Storage (product-images y
// store-assets) que ya no está referenciando NINGUNA fila de la base:
// ni product_images.url, ni store_assets.url, ni store_config.hero_image_url
// / logo_url / favicon_url, ni order_items.product_image_url (para no tocar
// imágenes de pedidos históricos).
//
// La lista completa (650 archivos, ~86MB) está en orphan_files.json, generada
// el 2026-08-20 comparando storage.objects contra esas columnas.
//
// Usa el SDK de Supabase (@supabase/supabase-js) -> storage.remove(), que es
// la Storage API real: borra la fila en storage.objects Y el blob real en el
// mismo paso. A propósito NO se usa SQL directo (DELETE FROM storage.objects
// puede dejar el blob huérfano en el backend, es un problema conocido).
//
// CÓMO CORRERLO:
//   1) npm install @supabase/supabase-js   (una sola vez, en esta carpeta)
//   2) Definir las dos variables de entorno (las mismas que usa Panel Admin
//      en Vercel -> Settings -> Environment Variables):
//        export NEXT_PUBLIC_SUPABASE_URL="https://xvhqiwypejurjdqioyuq.supabase.co"
//        export SUPABASE_SERVICE_ROLE_KEY="..."   (la service_role, no la anon)
//   3) Primero en modo dry-run, solo para ver qué haría (no borra nada):
//        node cleanup-orphans.mjs --dry-run
//   4) Si la cuenta de archivos/tamaño coincide con lo esperado, correr en serio:
//        node cleanup-orphans.mjs
//
// Es seguro re-correrlo si se corta a mitad de camino: lo que ya se borró
// simplemente no aparece más y no da error, sigue con el resto.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dryRun = process.argv.includes('--dry-run')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const data = JSON.parse(readFileSync(join(__dirname, 'orphan_files.json'), 'utf-8'))

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function cleanBucket(bucket, paths) {
  console.log(`\n--- ${bucket}: ${paths.length} archivos ---`)
  if (dryRun) {
    console.log('(dry-run, no se borra nada)')
    return { deleted: 0, errors: 0 }
  }

  let deleted = 0
  let errors = 0
  for (const batch of chunk(paths, 100)) {
    const { data: removed, error } = await supabase.storage.from(bucket).remove(batch)
    if (error) {
      console.error(`  error en lote de ${batch.length}:`, error.message)
      errors += batch.length
      continue
    }
    deleted += removed?.length ?? 0
    console.log(`  borrados ${removed?.length ?? 0}/${batch.length} de este lote`)
  }
  return { deleted, errors }
}

const totalFiles = Object.values(data).reduce((n, arr) => n + arr.length, 0)
console.log(`Total a procesar: ${totalFiles} archivos${dryRun ? ' (DRY RUN)' : ''}`)

let totalDeleted = 0
let totalErrors = 0
for (const [bucket, paths] of Object.entries(data)) {
  const { deleted, errors } = await cleanBucket(bucket, paths)
  totalDeleted += deleted
  totalErrors += errors
}

console.log(`\nListo. Borrados: ${totalDeleted}. Errores: ${totalErrors}.`)

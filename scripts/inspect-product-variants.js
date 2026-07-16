#!/usr/bin/env node
/**
 * Solo lectura — muestra todas las variantes (talle, color, color_hex,
 * stock, precios) de un producto puntual, tal como están AHORA en la base.
 * Útil para diagnosticar productos con colores/precios que quedaron mal
 * después de una edición.
 *
 * Uso:
 *   node scripts/inspect-product-variants.js "nombre o parte del nombre"
 *   node scripts/inspect-product-variants.js --slug mi-producto-slug
 *   node scripts/inspect-product-variants.js --id <uuid-del-producto>
 */

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) {
    console.error(`No encontré ${envPath}`)
    process.exit(1)
  }
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}
loadEnvLocal()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

async function main() {
  const args = process.argv.slice(2)
  let products = []

  const idIdx = args.indexOf('--id')
  const slugIdx = args.indexOf('--slug')

  if (idIdx !== -1) {
    const { data } = await supabase.from('products').select('id, name, slug').eq('id', args[idIdx + 1])
    products = data ?? []
  } else if (slugIdx !== -1) {
    const { data } = await supabase.from('products').select('id, name, slug').eq('slug', args[slugIdx + 1])
    products = data ?? []
  } else {
    const query = args.filter(a => !a.startsWith('--')).join(' ')
    if (!query) {
      console.error('Uso: node scripts/inspect-product-variants.js "nombre del producto"')
      process.exit(1)
    }
    const { data } = await supabase.from('products').select('id, name, slug').ilike('name', `%${query}%`)
    products = data ?? []
  }

  if (products.length === 0) {
    console.log('No encontré ningún producto con ese criterio.')
    return
  }

  for (const product of products) {
    console.log(`\n=== ${product.name} (slug: ${product.slug}, id: ${product.id}) ===`)

    const { data: variants, error } = await supabase
      .from('variants')
      .select('id, size, color, color_hex, stock, price_rules(type, price, compare_at_price, min_qty, active)')
      .eq('product_id', product.id)
      .order('color')
      .order('size')

    if (error) {
      console.error('  Error consultando variantes:', error.message)
      continue
    }

    for (const v of variants ?? []) {
      const retail = v.price_rules?.find(p => p.type === 'retail')
      const wholesale = v.price_rules?.find(p => p.type === 'wholesale')
      console.log(
        `  [${v.id.slice(0, 8)}…] talle="${v.size ?? ''}" color="${v.color ?? ''}" hex=${v.color_hex ?? '(sin hex)'} stock=${v.stock}` +
        ` | minorista=${retail?.price ?? '-'} | mayorista=${wholesale?.price ?? '-'} (min ${wholesale?.min_qty ?? '-'})`
      )
    }
  }
}

main()

#!/usr/bin/env node
/**
 * Borra las variantes "zombie" de un color puntual de un producto: filas
 * que quedaron sin precio y sin stock (ej: el "Marrón Silla" que quedó
 * huérfano después de renombrarlo a "Marrón" desde una pestaña vieja).
 *
 * Por seguridad SOLO borra si, para cada variante encontrada:
 *   - stock = 0
 *   - no tiene price_rules activas (ni minorista ni mayorista)
 *   - no aparece en ningún order_items (nunca se vendió)
 * Si alguna de estas condiciones no se cumple, no borra nada y avisa.
 *
 * Uso (dry run por default):
 *   node scripts/delete-zombie-color.js "nombre o slug del producto" "Nombre del color"
 *   node scripts/delete-zombie-color.js "nombre o slug del producto" "Nombre del color" --apply
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
const APPLY = process.argv.includes('--apply')

async function main() {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
  const [productQuery, colorName] = args
  if (!productQuery || !colorName) {
    console.error('Uso: node scripts/delete-zombie-color.js "producto" "Color" [--apply]')
    process.exit(1)
  }

  console.log(APPLY
    ? 'Modo APLICAR — esto va a borrar filas de la base.\n'
    : 'Modo DRY RUN — no se borra nada, solo se muestra el plan. Correr con --apply para aplicar de verdad.\n')

  const { data: products } = await supabase
    .from('products')
    .select('id, name, slug')
    .or(`slug.eq.${productQuery},name.ilike.%${productQuery}%`)

  if (!products || products.length === 0) {
    console.log('No encontré ningún producto con ese criterio.')
    return
  }
  if (products.length > 1) {
    console.log('Encontré más de un producto, sé más específico:')
    for (const p of products) console.log(`  - ${p.name} (slug: ${p.slug})`)
    return
  }
  const product = products[0]
  console.log(`Producto: ${product.name} (${product.id})\n`)

  const { data: variants, error } = await supabase
    .from('variants')
    .select('id, size, color, stock, price_rules(id, type, price, active)')
    .eq('product_id', product.id)
    .eq('color', colorName)

  if (error) {
    console.error('Error consultando variantes:', error.message)
    process.exit(1)
  }
  if (!variants || variants.length === 0) {
    console.log(`No hay variantes con color "${colorName}" en este producto.`)
    return
  }

  const variantIds = variants.map(v => v.id)
  const { data: orderItems } = await supabase
    .from('order_items')
    .select('id, variant_id')
    .in('variant_id', variantIds)

  let blocked = false
  for (const v of variants) {
    const hasPricing = (v.price_rules ?? []).some(r => r.active)
    const hasStock = (v.stock ?? 0) > 0
    const hasOrders = (orderItems ?? []).some(oi => oi.variant_id === v.id)
    const safe = !hasPricing && !hasStock && !hasOrders
    console.log(
      `  [${v.id}] talle="${v.size ?? ''}" stock=${v.stock} precios=${(v.price_rules ?? []).length} pedidos=${hasOrders ? 'SÍ' : 'no'}` +
      `  ${safe ? '-> se puede borrar' : '-> NO SE TOCA (tiene precio, stock o pedidos)'}`
    )
    if (!safe) blocked = true
  }

  if (blocked) {
    console.log('\nAlguna variante de este color tiene precio, stock o pedidos asociados — no se borra nada por seguridad.')
    console.log('Revisá manualmente o ajustá el filtro.')
    return
  }

  if (!APPLY) {
    console.log(`\n${variants.length} variantes se borrarían. Para aplicar de verdad:`)
    console.log(`  node scripts/delete-zombie-color.js "${productQuery}" "${colorName}" --apply`)
    return
  }

  console.log(`\nBorrando ${variants.length} variantes...`)
  for (const v of variants) {
    await supabase.from('price_rules').delete().eq('variant_id', v.id)
    const { error: delErr } = await supabase.from('variants').delete().eq('id', v.id)
    if (delErr) console.error(`  ERROR borrando ${v.id}: ${delErr.message}`)
    else console.log(`  borrada ${v.id}`)
  }
  console.log('\nListo.')
}

main()

#!/usr/bin/env node
/**
 * Repara el daño que dejó una corrida anterior de fix-legacy-color-names.js
 * (versión con bug): productos donde el mismo color terminó separado en
 * variantes con nombres distintos ("Gris Oscuro", "Gris Oscuro 2", "Gris
 * Oscuro 3"...) por talle, en vez de compartir un solo nombre.
 *
 * IMPORTANTE: color_hex nunca se tocó, así que no se perdió información —
 * este script solo vuelve a unificar el campo "color" (nombre) agrupando
 * por (producto, color_hex) y usando un único nombre por grupo.
 *
 * Por default corre en modo DRY RUN. Para aplicar de verdad:
 *
 *   node scripts/repair-duplicate-color-names.js --apply
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

// "Gris Oscuro 2" -> "Gris Oscuro". Si el nombre no tiene sufijo numérico,
// queda igual.
function stripSuffix(name) {
  return (name ?? '').replace(/ \d+$/, '').trim()
}

async function main() {
  console.log(APPLY
    ? 'Modo APLICAR — esto va a escribir cambios en la base.\n'
    : 'Modo DRY RUN — no se escribe nada, solo se muestra el plan. Correr con --apply para aplicar de verdad.\n')

  const { data: variants, error } = await supabase
    .from('variants')
    .select('id, product_id, color, color_hex')
    .not('color_hex', 'is', null)

  if (error) {
    console.error('Error consultando variants:', error.message)
    process.exit(1)
  }

  // Agrupar por (producto, hex real) — el hex nunca se tocó, así que es la
  // forma confiable de saber qué filas son "el mismo color" de verdad.
  const groups = new Map() // `${product_id}::${color_hex}` -> variantes[]
  for (const v of variants ?? []) {
    const key = `${v.product_id}::${v.color_hex}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(v)
  }

  const updates = []
  for (const rows of groups.values()) {
    const distinctNames = [...new Set(rows.map(r => r.color))]
    if (distinctNames.length <= 1) continue // este grupo está bien, no lo tocamos

    // ¿Es el patrón "Base" / "Base 2" / "Base 3"? Elegimos como base el
    // nombre que NO tiene sufijo numérico; si todos lo tienen (mala suerte),
    // usamos el más corto sin el sufijo.
    const withoutSuffix = distinctNames.filter(n => stripSuffix(n) === n)
    const base = withoutSuffix[0] ?? stripSuffix(distinctNames.slice().sort((a, b) => a.length - b.length)[0])

    for (const row of rows) {
      if (row.color !== base) {
        updates.push({ id: row.id, oldColor: row.color, newColor: base })
      }
    }
  }

  if (updates.length === 0) {
    console.log('No encontré grupos duplicados para reparar. Todo está consistente.')
    return
  }

  console.log(`Encontré ${updates.length} variantes para unificar:\n`)
  for (const u of updates) {
    console.log(`  variante ${u.id.slice(0, 8)}…  "${u.oldColor}"  ->  "${u.newColor}"`)
  }

  if (!APPLY) {
    console.log(`\nPara aplicar de verdad:`)
    console.log('  node scripts/repair-duplicate-color-names.js --apply')
    return
  }

  console.log(`\nAplicando ${updates.length} cambios...`)
  let ok = 0, failed = 0
  for (const u of updates) {
    const { error: updErr } = await supabase.from('variants').update({ color: u.newColor }).eq('id', u.id)
    if (updErr) {
      failed++
      console.error(`  ERROR en variante ${u.id}: ${updErr.message}`)
    } else {
      ok++
    }
  }
  console.log(`\nListo. ${ok} actualizadas, ${failed} con error.`)
}

main()

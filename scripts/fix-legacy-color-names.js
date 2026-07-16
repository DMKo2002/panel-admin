#!/usr/bin/env node
/**
 * Arregla en bloque las variantes cuyo nombre de color quedó guardado como
 * código hex (bug legacy de antes de separar nombre/hex en Panel Admin).
 * Reemplaza el nombre por el color HTML/CSS más cercano (ej: "#CD5C5C" ->
 * "Indian Red"), sin tocar color_hex (que ya tiene el hex real guardado
 * desde la migración add_variants_color_hex.sql).
 *
 * Corre contra TODOS los tenants de la plataforma (es una corrección de
 * datos, no algo específico de una tienda).
 *
 * Por default corre en modo DRY RUN (solo muestra qué haría, no escribe
 * nada). Para aplicar los cambios de verdad:
 *
 *   node scripts/fix-legacy-color-names.js --apply
 *
 * Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en
 * Panel Admin/.env.local (los mismos que ya usa la app).
 */

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

// ── Cargar .env.local a mano (sin agregar dependencia de dotenv) ───────────
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

// ── Paleta HTML/CSS estándar (misma lista que VariantMatrix.tsx) ───────────
const CSS_NAMED_COLORS = [
  ['Azul Alicia', '#F0F8FF'], ['Blanco Antiguo', '#FAEBD7'], ['Aqua', '#00FFFF'], ['Aguamarina', '#7FFFD4'],
  ['Azur', '#F0FFFF'], ['Beige', '#F5F5DC'], ['Bizcocho', '#FFE4C4'], ['Negro', '#000000'],
  ['Almendra', '#FFEBCD'], ['Azul', '#0000FF'], ['Azul Violeta', '#8A2BE2'], ['Marrón', '#A52A2A'],
  ['Madera', '#DEB887'], ['Azul Cadete', '#5F9EA0'], ['Verde Chartreuse', '#7FFF00'], ['Chocolate', '#D2691E'],
  ['Coral', '#FF7F50'], ['Azul Aciano', '#6495ED'], ['Seda de Maíz', '#FFF8DC'], ['Carmesí', '#DC143C'],
  ['Cian', '#00FFFF'], ['Azul Oscuro', '#00008B'], ['Cian Oscuro', '#008B8B'], ['Dorado Oscuro', '#B8860B'],
  ['Gris Oscuro', '#A9A9A9'], ['Verde Oscuro', '#006400'], ['Caqui Oscuro', '#BDB76B'], ['Magenta Oscuro', '#8B008B'],
  ['Verde Oliva Oscuro', '#556B2F'], ['Naranja Oscuro', '#FF8C00'], ['Orquídea Oscuro', '#9932CC'], ['Rojo Oscuro', '#8B0000'],
  ['Salmón Oscuro', '#E9967A'], ['Verde Mar Oscuro', '#8FBC8F'], ['Azul Pizarra Oscuro', '#483D8B'], ['Gris Pizarra Oscuro', '#2F4F4F'],
  ['Turquesa Oscuro', '#00CED1'], ['Violeta Oscuro', '#9400D3'], ['Rosa Intenso', '#FF1493'], ['Celeste Intenso', '#00BFFF'],
  ['Gris Tenue', '#696969'], ['Azul Dodger', '#1E90FF'], ['Ladrillo', '#B22222'], ['Blanco Floral', '#FFFAF0'],
  ['Verde Bosque', '#228B22'], ['Fucsia', '#FF00FF'], ['Gris Perla', '#DCDCDC'], ['Blanco Fantasma', '#F8F8FF'],
  ['Dorado', '#FFD700'], ['Vara de Oro', '#DAA520'], ['Gris', '#808080'], ['Verde', '#008000'],
  ['Verde Amarillento', '#ADFF2F'], ['Verde Melón', '#F0FFF0'], ['Rosa Fuerte', '#FF69B4'], ['Rojo Indio', '#CD5C5C'],
  ['Índigo', '#4B0082'], ['Marfil', '#FFFFF0'], ['Caqui', '#F0E68C'], ['Lavanda', '#E6E6FA'],
  ['Rosa Lavanda', '#FFF0F5'], ['Verde Césped', '#7CFC00'], ['Amarillo Limón', '#FFFACD'], ['Celeste', '#ADD8E6'],
  ['Coral Claro', '#F08080'], ['Cian Claro', '#E0FFFF'], ['Amarillo Dorado Claro', '#FAFAD2'], ['Gris Claro', '#D3D3D3'],
  ['Verde Claro', '#90EE90'], ['Rosa Claro', '#FFB6C1'], ['Salmón Claro', '#FFA07A'], ['Verde Mar Claro', '#20B2AA'],
  ['Celeste Cielo Claro', '#87CEFA'], ['Gris Pizarra Claro', '#778899'], ['Azul Acero Claro', '#B0C4DE'], ['Amarillo Claro', '#FFFFE0'],
  ['Lima', '#00FF00'], ['Verde Lima', '#32CD32'], ['Lino', '#FAF0E6'], ['Magenta', '#FF00FF'],
  ['Granate', '#800000'], ['Aguamarina Medio', '#66CDAA'], ['Azul Medio', '#0000CD'], ['Orquídea Medio', '#BA55D3'],
  ['Púrpura Medio', '#9370DB'], ['Verde Mar Medio', '#3CB371'], ['Azul Pizarra Medio', '#7B68EE'], ['Verde Primavera Medio', '#00FA9A'],
  ['Turquesa Medio', '#48D1CC'], ['Rojo Violeta Medio', '#C71585'], ['Azul Medianoche', '#191970'], ['Crema de Menta', '#F5FFFA'],
  ['Rosa Neblina', '#FFE4E1'], ['Mocasín', '#FFE4B5'], ['Blanco Navajo', '#FFDEAD'], ['Azul Marino', '#000080'],
  ['Encaje Antiguo', '#FDF5E6'], ['Oliva', '#808000'], ['Verde Oliva', '#6B8E23'], ['Naranja', '#FFA500'],
  ['Rojo Anaranjado', '#FF4500'], ['Orquídea', '#DA70D6'], ['Dorado Pálido', '#EEE8AA'], ['Verde Pálido', '#98FB98'],
  ['Turquesa Pálido', '#AFEEEE'], ['Rojo Violeta Pálido', '#DB7093'], ['Papaya', '#FFEFD5'], ['Durazno', '#FFDAB9'],
  ['Perú', '#CD853F'], ['Rosa', '#FFC0CB'], ['Ciruela', '#DDA0DD'], ['Azul Polvo', '#B0E0E6'],
  ['Púrpura', '#800080'], ['Púrpura Rebecca', '#663399'], ['Rojo', '#FF0000'], ['Marrón Rosado', '#BC8F8F'],
  ['Azul Real', '#4169E1'], ['Marrón Silla', '#8B4513'], ['Salmón', '#FA8072'], ['Marrón Arena', '#F4A460'],
  ['Verde Mar', '#2E8B57'], ['Concha de Mar', '#FFF5EE'], ['Siena', '#A0522D'], ['Plateado', '#C0C0C0'],
  ['Celeste Cielo', '#87CEEB'], ['Azul Pizarra', '#6A5ACD'], ['Gris Pizarra', '#708090'], ['Blanco Nieve', '#FFFAFA'],
  ['Verde Primavera', '#00FF7F'], ['Azul Acero', '#4682B4'], ['Bronceado', '#D2B48C'], ['Verde Azulado', '#008080'],
  ['Cardo', '#D8BFD8'], ['Tomate', '#FF6347'], ['Turquesa', '#40E0D0'], ['Violeta', '#EE82EE'],
  ['Trigo', '#F5DEB3'], ['Blanco', '#FFFFFF'], ['Humo Blanco', '#F5F5F5'], ['Amarillo', '#FFFF00'],
  ['Verde Amarillo', '#9ACD32'],
]

function hexToRgb(hex) {
  const clean = hex.replace('#', '').trim()
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean
  if (!/^[0-9A-Fa-f]{6}$/.test(full)) return null
  return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16) }
}

function nearestColorName(hex) {
  const target = hexToRgb(hex)
  if (!target) return ''
  let best = ''
  let bestDist = Infinity
  for (const [label, h] of CSS_NAMED_COLORS) {
    const rgb = hexToRgb(h)
    if (!rgb) continue
    const dist = (rgb.r - target.r) ** 2 + (rgb.g - target.g) ** 2 + (rgb.b - target.b) ** 2
    if (dist < bestDist) { bestDist = dist; best = label }
  }
  return best
}

function isHexLikeName(name) {
  return /^#[0-9A-Fa-f]{3,8}$/.test((name ?? '').trim())
}

async function main() {
  console.log(APPLY
    ? 'Modo APLICAR — esto va a escribir cambios en la base.\n'
    : 'Modo DRY RUN — no se escribe nada, solo se muestra el plan. Correr con --apply para aplicar de verdad.\n')

  const { data: variants, error } = await supabase
    .from('variants')
    .select('id, product_id, color, color_hex')
    .not('color', 'is', null)

  if (error) {
    console.error('Error consultando variants:', error.message)
    process.exit(1)
  }

  const hexNamed = (variants ?? []).filter(v => isHexLikeName(v.color))
  if (hexNamed.length === 0) {
    console.log('No hay variantes con nombre de color guardado como hex. Nada para hacer.')
    return
  }

  console.log(`Encontré ${hexNamed.length} variantes con nombre de color = hex.\n`)

  // Evitar colisiones: si dos hex distintos del MISMO producto caen en el
  // mismo nombre sugerido, se les agrega un sufijo para no fusionarlos en
  // una sola columna de color en el editor.
  const usedNamesByProduct = new Map() // product_id -> Set<string>
  const updates = []

  for (const v of hexNamed) {
    const sourceHex = v.color_hex || v.color
    const suggested = nearestColorName(sourceHex) || v.color
    let usedNames = usedNamesByProduct.get(v.product_id)
    if (!usedNames) { usedNames = new Set(); usedNamesByProduct.set(v.product_id, usedNames) }
    let name = suggested
    let n = 2
    while (usedNames.has(name)) { name = `${suggested} ${n++}` }
    usedNames.add(name)
    updates.push({ id: v.id, oldColor: v.color, newColor: name })
  }

  for (const u of updates) {
    console.log(`  variante ${u.id.slice(0, 8)}…  "${u.oldColor}"  ->  "${u.newColor}"`)
  }

  if (!APPLY) {
    console.log(`\n${updates.length} variantes se actualizarían. Para aplicar de verdad:`)
    console.log('  node scripts/fix-legacy-color-names.js --apply')
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

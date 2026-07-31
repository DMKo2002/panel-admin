#!/usr/bin/env node
/**
 * Sube a Supabase Storage las fotos de los 13 productos de cosmética
 * coreana elegidos para poblar el catálogo demo de glow, y genera
 * productos-glow-cosmeticos.csv listo para subir desde Panel Admin >
 * Productos > Importar.
 *
 * Las fotos son reales, tomadas de las fichas públicas de producto de
 * stylekorean.com (marcas/productos reales). Se suben al bucket
 * product-images del tenant de glow para no depender de un CDN externo
 * (mismo patrón que los productos que ya están cargados a mano).
 *
 * Uso:
 *   node scripts/upload-glow-cosmeticos-images.js
 *
 * Requiere .env.local con NEXT_PUBLIC_SUPABASE_URL y
 * SUPABASE_SERVICE_ROLE_KEY (los mismos que ya usa Panel Admin).
 * Requiere Node 18+ (usa fetch nativo).
 */

const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')
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

// Tenant de glow (visto en las URLs de imágenes ya cargadas del propio sitio).
const GLOW_TENANT_ID = '00000000-0000-0000-0000-000000000007'

// ─────────────────────────────────────────────────────────────────────────
// 13 productos reales de cosmética coreana (nombre, marca, foto real de
// stylekorean.com, categorías múltiples, precios de referencia en ARS).
// "categorias" usa ";" para separar varios paths — cada path usa ">" para
// jerarquía (ej: "Skin Care > Facial > Tonico"). La primera categoría de
// la lista también queda como categoría principal del producto.
// ─────────────────────────────────────────────────────────────────────────
const PRODUCTS = [
  {
    nombre: 'Aestura Atobarrier 365 Cream 80ml',
    descripcion: 'Crema reparadora de barrera cutánea con ceramidas encapsuladas de liberación prolongada. Hasta 120 horas de hidratación continua, ideal para pieles secas y sensibles.',
    imagen: 'https://d2c3d01lcpw2ui.cloudfront.net/gl/data/item/1706575903/tb11782113566346f827ab1e5458.png',
    categorias: ['Marca > Aestura', 'Skin Care > Facial > Cremas y Emulsion', 'Tipo de piel > Seca'],
    precioMinorista: 54990, precioMayorista: 47990,
  },
  {
    nombre: 'Anua Heartleaf 77% Soothing Toner 250ml',
    descripcion: 'Tónico calmante con 77% de extracto de Heartleaf (Houttuynia Cordata) que equilibra el pH y reduce enrojecimiento. Apto para piel sensible y con tendencia acneica.',
    imagen: 'https://d2c3d01lcpw2ui.cloudfront.net/gl/data/item/1685500315/anuatonerfreegift.png',
    categorias: ['Marca > Anua', 'Skin Care > Facial > Tonico', 'Tipo de piel > Sensible'],
    precioMinorista: 36990, precioMayorista: 31990,
  },
  {
    nombre: 'Beauty of Joseon Relief Sun: Rice + Probiotics SPF50+ 50ml',
    descripcion: 'Protector solar coreano con 30% de extracto de arroz y probióticos fermentados. Terminación húmeda sin marcas blancas, no reseca ni deja sensación pegajosa.',
    imagen: 'https://d2c3d01lcpw2ui.cloudfront.net/gl/data/item/1635737523/images6178393257976920d87fa235ae.jpg',
    categorias: ['Marca > Beauty of Joseon', 'Skin Care > Facial > Protector solar', 'Tipo de piel > Normal'],
    precioMinorista: 31990, precioMayorista: 27990,
  },
  {
    nombre: "Dr.Jart+ Cicapair Tiger Grass Color Correcting Treatment 50ml",
    descripcion: 'Crema correctora de tono verde-a-beige con Centella Asiática (Tiger Grass) que neutraliza el enrojecimiento al instante y calma la piel irritada.',
    imagen: 'https://d2c3d01lcpw2ui.cloudfront.net/gl/data/item/1661403671/Dr.JartCicapairTigerGrassColorCorrectingTreatment50ml.png',
    categorias: ['Marca > Dr Jart', 'Skin Care > Facial > Tratamiento', 'Tipo de piel > Sensible'],
    precioMinorista: 77990, precioMayorista: 69990,
  },
  {
    nombre: "d'Alba White Truffle First Spray Serum 100ml",
    descripcion: 'Sérum en spray multiuso con extracto de trufa blanca italiana. Hidratación instantánea con un solo espray, efecto "glass skin" — funciona como tónico, sérum o fijador de maquillaje.',
    imagen: 'https://d2c3d01lcpw2ui.cloudfront.net/gl/data/item/1733366687/44WH44WH.png',
    categorias: ['Marca > D Alba', 'Skin Care > Facial > Serum y Ampolla', 'Tipo de piel > Seca', 'Promo'],
    precioMinorista: 46990, precioMinoristaTachado: 52990, precioMayorista: 41990,
  },
  {
    nombre: 'Medicube Zero Pore Pad 2.0 (70 unidades)',
    descripcion: 'Almohadillas exfoliantes de doble cara con AHA y BHA que desobstruyen poros y afinan la textura de la piel. Ideales para piel oleosa y mixta con tendencia a puntos negros.',
    imagen: 'https://d2c3d01lcpw2ui.cloudfront.net/gl/data/item/1718073988/MECUS08TP111783499870057ea1d433c8a91.png',
    categorias: ['Marca > Medicube', 'Skin Care > Facial > Limpiador', 'Tipo de piel > Oleoso', 'Tipo de piel > Mixto'],
    precioMinorista: 40990, precioMayorista: 35990,
  },
  {
    nombre: 'Cosrx Advanced Snail Peptide Eye Cream 25ml',
    descripcion: 'Crema de ojos con mucina de caracol y 5 péptidos que nutre, firma y aclara el contorno de ojos. Aplicador airless higiénico, textura ligera que no tira la piel.',
    imagen: 'https://d2c3d01lcpw2ui.cloudfront.net/gl/data/item/1572831016/10b3fc0ffe224d4099214e86103d12531765953432017666ddc1a1982.webp',
    categorias: ['Marca > Cosrx', 'Skin Care > Facial > Contorno de Ojo', 'Tipo de piel > Sensible'],
    precioMinorista: 48990, precioMayorista: 43990,
  },
  {
    nombre: 'Illiyoon Ceramide Ato Lotion 350ml',
    descripcion: 'Loción corporal de rápida absorción con Ceramide Skin Complex™ que fortalece la barrera cutánea y brinda hidratación de larga duración. Apta para piel seca y sensible.',
    imagen: 'https://d2c3d01lcpw2ui.cloudfront.net/gl/data/item/1750902785/illiS01Er17509033268758048ef51bfe7.png',
    categorias: ['Skin Care > Facial > Locion y Humectante', 'Tipo de piel > Seca'],
    precioMinorista: 33990, precioMayorista: 28990,
  },
  {
    nombre: 'Illiyoon Ceramide Ato Concentrate Cream 230ml',
    descripcion: 'Crema corporal rica en ceramidas para 100 horas de hidratación. Fortalece la barrera cutánea un 91% en 3 días, apta incluso para piel de bebé.',
    imagen: 'https://d2c3d01lcpw2ui.cloudfront.net/gl/data/item/1741571847/illiS01Cr1782104537634ae080c340c41.jpg',
    categorias: ['Skin Care > Corporal > Crema y Emulsion', 'Tipo de piel > Seca'],
    precioMinorista: 38990, precioMayorista: 33990,
  },
  {
    nombre: 'Nature Republic Aloe Vera 92% Soothing Gel 300ml',
    descripcion: 'Gel multiuso con 92% de aloe vera orgánico certificado. Hidratación refrescante para rostro, cuerpo, cabello y uñas — absorción rápida sin sensación pegajosa.',
    imagen: 'https://d2c3d01lcpw2ui.cloudfront.net/gl/data/item/1606805284/IMG_5801.jpg',
    categorias: ['Skin Care > Corporal > Gel y Oleo', 'Skin Care > Corporal > Tratamiento corporal', 'Tipo de piel > Normal'],
    precioMinorista: 17990, precioMayorista: 14990,
  },
  {
    nombre: 'Medicube Collagen Milk Toning Wrapping Mask 75ml',
    descripcion: 'Mascarilla envolvente con colágeno de bajo peso molecular que hidrata y da luminosidad en 20 minutos. Efecto "glazed skin" para uso matutino o como tratamiento intensivo nocturno.',
    imagen: 'https://d2c3d01lcpw2ui.cloudfront.net/gl/data/item/1761638590/MECUP10PKM17840992992519fde790e7323.webp',
    categorias: ['Marca > Medicube', 'Skin Care > Facial > Mascarilla', 'Tipo de piel > Normal'],
    precioMinorista: 44990, precioMayorista: 39990,
  },
  {
    nombre: 'Mise en Scene Perfect Original Serum Shampoo 680ml',
    descripcion: 'Shampoo nutritivo con 7 aceites dorados (argán, jojoba, oliva, marula) que repara el cabello dañado y deja hebras suaves de raíz a puntas.',
    imagen: 'https://d2c3d01lcpw2ui.cloudfront.net/gl/data/item/1669108963/44WB44WH.jpg',
    categorias: ['Capilar > Acondicionador y Shampoo'],
    precioMinorista: 25990, precioMayorista: 21990,
  },
  {
    nombre: 'Mise en Scene Perfect Original Serum Conditioner 680ml',
    descripcion: 'Acondicionador nutritivo con 7 aceites dorados que repara profundamente el cabello reseco y quebradizo, dejándolo suave y con brillo.',
    imagen: 'https://d2c3d01lcpw2ui.cloudfront.net/gl/data/item/1663213807/7KCc66qp7JeG7J2M1.jpg',
    categorias: ['Capilar > Tratamiento y Mascarilla'],
    precioMinorista: 25990, precioMayorista: 21990,
  },
]

function extFromUrl(url) {
  const clean = url.split('?')[0]
  const m = clean.match(/\.([a-zA-Z0-9]+)$/)
  return (m ? m[1] : 'jpg').toLowerCase()
}

function contentTypeFromExt(ext) {
  return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[ext] || 'application/octet-stream'
}

function csvField(value) {
  const s = value === null || value === undefined ? '' : String(value)
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

async function uploadImage(product, index) {
  const ext = extFromUrl(product.imagen)
  const res = await fetch(product.imagen, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`No se pudo descargar la imagen (HTTP ${res.status})`)
  const buffer = Buffer.from(await res.arrayBuffer())

  const storagePath = `${GLOW_TENANT_ID}/${randomUUID()}/${Date.now()}-${index}.${ext}`
  const { error } = await supabase.storage.from('product-images').upload(storagePath, buffer, {
    contentType: contentTypeFromExt(ext),
    upsert: false,
  })
  if (error) throw new Error(`Error subiendo a Storage: ${error.message}`)

  const { data } = supabase.storage.from('product-images').getPublicUrl(storagePath)
  return data.publicUrl
}

async function main() {
  console.log(`Subiendo ${PRODUCTS.length} imágenes a Supabase Storage (bucket product-images)...\n`)

  const rows = [[
    'producto_id', 'variante_id', 'categoria', 'nombre', 'descripcion', 'imagenes', 'sku',
    'talle', 'color', 'color_hex', 'stock', 'stock_alerta_baja',
    'precio_minorista', 'precio_minorista_tachado',
    'precio_mayorista', 'precio_mayorista_min_qty',
    'producto_activo', 'variante_activa', 'categorias',
  ]]

  let ok = 0
  for (let i = 0; i < PRODUCTS.length; i++) {
    const p = PRODUCTS[i]
    process.stdout.write(`[${i + 1}/${PRODUCTS.length}] ${p.nombre} ... `)
    try {
      const publicUrl = await uploadImage(p, i)
      console.log('OK')
      ok++
      rows.push([
        '', '', p.categorias[0], p.nombre, p.descripcion, publicUrl, '',
        '', '', '', 25, 5,
        p.precioMinorista, p.precioMinoristaTachado ?? '',
        p.precioMayorista, 1,
        '1', '1', p.categorias.join(';'),
      ])
    } catch (err) {
      console.log(`FALLÓ: ${err.message}`)
    }
  }

  const BOM = '﻿'
  const csv = BOM + rows.map(row => row.map(csvField).join(',')).join('\r\n')
  const outPath = path.join(__dirname, '..', '..', 'productos-glow-cosmeticos.csv')
  fs.writeFileSync(outPath, csv, 'utf8')

  console.log(`\n${ok}/${PRODUCTS.length} imágenes subidas correctamente.`)
  console.log(`CSV generado en: ${outPath}`)
  console.log('\nPróximo paso: Panel Admin > Productos > Importar, subí ese CSV.')
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})

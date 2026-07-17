const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

function loadEnvLocal() {
  const envPath = path.join('/sessions/exciting-stoic-lamport/mnt/Plataforma CreArt/Panel Admin', '.env.local')
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

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

async function main() {
  const { data: tenants } = await supabase.from('tenants').select('id, name, slug, domain')
  console.log('=== TENANTS ===')
  for (const t of tenants ?? []) console.log(t.id, t.name, t.slug, t.domain)

  const connors = (tenants ?? []).filter(t => /conors|connors/i.test(t.name + ' ' + (t.slug||'') + ' ' + (t.domain||'')))
  const mykonos = (tenants ?? []).filter(t => /mykonos/i.test(t.name + ' ' + (t.slug||'') + ' ' + (t.domain||'')))
  console.log('\nConnors tenant match:', connors.map(t=>t.name))
  console.log('Mykonos tenant match:', mykonos.map(t=>t.name))

  for (const t of [...connors, ...mykonos]) {
    console.log(`\n=== Productos con colores "gris" duplicados — tenant ${t.name} ===`)
    const { data: products } = await supabase.from('products').select('id, name').eq('tenant_id', t.id)
    for (const p of products ?? []) {
      const { data: variants } = await supabase.from('variants').select('id, color, color_hex, size, stock').eq('product_id', p.id)
      const byColor = {}
      for (const v of variants ?? []) {
        const c = (v.color ?? '').toLowerCase()
        if (!c) continue
        byColor[c] = byColor[c] || []
        byColor[c].push(v)
      }
      const grisColors = Object.keys(byColor).filter(c => c.includes('gris'))
      if (grisColors.length > 1) {
        console.log(`  Producto: ${p.name} (${p.id})`)
        for (const c of grisColors) {
          console.log(`    color="${c}" -> ${byColor[c].length} variantes:`, byColor[c].map(v => `talle=${v.size} hex=${v.color_hex} stock=${v.stock} id=${v.id.slice(0,8)}`).join(' | '))
        }
      }
    }
  }
}
main()

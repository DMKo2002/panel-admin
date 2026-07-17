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
console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
console.log('KEY len:', (process.env.SUPABASE_SERVICE_ROLE_KEY||'').length)
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
supabase.from('tenants').select('id,name', { count: 'exact' }).then(r => console.log('result', JSON.stringify(r).slice(0,1000)))

// GET /api/referidos/mi-codigo — código y link de invitación del tenant
// logueado (2026-09, programa de referidos). Lo genera la primera vez que
// alguien abre "Invitar personas" (ver ReferidosCard.tsx) — no existe un
// paso de alta que lo cree antes, así que tenants viejos también lo
// consiguen la primera vez que entran a esta pantalla.
//
// Devuelve también el saldo de meses gratis disponibles (meses_gratis_disponibles)
// y un texto ya armado para compartir por WhatsApp — ver plan de promoción
// acordado con David (mensaje corto, 20% off + 7 días gratis + 0% comisión).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const GOUNURI_URL = 'https://www.gounuri.com'
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sin O/0/I/1, se confunden al dictarlo por WhatsApp

function randomCode(length = 6): string {
  let out = ''
  for (let i = 0; i < length; i++) out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  return out
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const service = createServiceClient()
  const { data: userRows } = await service.from('users').select('tenant_id').eq('id', user.id).limit(1)
  const tenantId = userRows?.[0]?.tenant_id
  if (!tenantId) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

  const { data: tenantRows } = await service
    .from('tenants')
    .select('name, referral_code, meses_gratis_disponibles')
    .eq('id', tenantId)
    .limit(1)
  const tenant = tenantRows?.[0]
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

  let code = tenant.referral_code
  if (!code) {
    // Reintenta ante colisión (índice único parcial en tenants.referral_code
    // — ver migración referidos_migration.sql). 5 intentos alcanza de sobra
    // con un espacio de ~1000 millones de códigos posibles.
    for (let attempt = 0; attempt < 5 && !code; attempt++) {
      const candidate = randomCode()
      const { error } = await service.from('tenants').update({ referral_code: candidate }).eq('id', tenantId)
      if (!error) { code = candidate; break }
      if (error.code !== '23505') {
        console.error('[referidos/mi-codigo] error generando código', error)
        return NextResponse.json({ error: 'No se pudo generar tu código. Probá de nuevo.' }, { status: 500 })
      }
      // 23505 = colisión de código, se reintenta con otro random
    }
    if (!code) return NextResponse.json({ error: 'No se pudo generar tu código. Probá de nuevo.' }, { status: 500 })
  }

  const link = `${GOUNURI_URL}/registro?ref=${code}`
  const waMessage = `Hola! ${tenant.name} te invita a Gounuri 👋 Armá tu tienda online con 20% de descuento tus primeros 2 meses. Podés probarla gratis 7 días, sin tarjeta, y vender con 0% de comisión, siempre. Mirá: ${link} Cualquier duda, contame!`

  return NextResponse.json({
    code,
    link,
    mesesGratisDisponibles: tenant.meses_gratis_disponibles ?? 0,
    waShareUrl: `https://wa.me/?text=${encodeURIComponent(waMessage)}`,
  })
}

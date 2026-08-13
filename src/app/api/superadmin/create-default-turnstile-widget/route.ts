// POST — crea el widget "default" de Cloudflare Turnstile que cubre
// *.gounuri.com (Turnstile incluye subdominios automáticamente al registrar
// solo el dominio base — no hace falta poner "*.gounuri.com" literal).
//
// Este widget es DISTINTO del pool en turnstile_widgets (ese es solo para
// dominios PROPIOS verificados de cada tenant, ver lib/turnstile.ts). Este es
// el que cubre gounuri.com y el fallback {slug}.gounuri.com de cualquier
// tenant sin dominio propio — el código en gounuri-web/src/app/registro/
// page.tsx, tienda-core RegistroForm.tsx y tienda-core/src/api/registro.ts
// ya estaba preparado para leerlo vía NEXT_PUBLIC_TURNSTILE_SITE_KEY /
// TURNSTILE_SECRET_KEY — nunca se había creado el widget en sí, por eso
// siempre caía al site key de test de Cloudflare ("For testing only").
//
// No se persiste en la base — las claves se devuelven UNA vez en la
// respuesta para pegar a mano en Vercel (Panel Admin no las necesita, las
// usan gounuri-web y cada tienda-*).

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/superadmin'

const CF_API = 'https://api.cloudflare.com/client/v4'

export async function POST() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isSuperAdmin(user.email)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const token = process.env.CF_API_TOKEN
  const accountId = process.env.CF_ACCOUNT_ID
  if (!token || !accountId) {
    return NextResponse.json({ error: 'Falta CF_API_TOKEN o CF_ACCOUNT_ID en las env vars de Panel Admin' }, { status: 500 })
  }

  try {
    const res = await fetch(`${CF_API}/accounts/${accountId}/challenges/widgets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `gounuri-default-${Date.now()}`,
        mode: 'managed',
        domains: ['gounuri.com'],
      }),
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      throw new Error(json?.errors?.[0]?.message || `Error creando el widget de Turnstile (HTTP ${res.status})`)
    }
    return NextResponse.json({
      ok: true,
      siteKey: json.result.sitekey,
      secretKey: json.result.secret,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

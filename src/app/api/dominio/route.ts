// Alta/verificación/baja del dominio propio del tenant.
//
// POST   { domain } — agrega el dominio al proyecto de Vercel del template
//                      del tenant, guarda domain_status='pending' y devuelve
//                      los registros DNS que hay que cargar.
// GET    — re-chequea el estado contra Vercel. Si ya está verified y todavía
//          no lo estaba, recién ahí asigna el widget de Turnstile del pool.
// DELETE — saca el dominio de Vercel y del pool de Turnstile, vuelve el
//          tenant a slug.gounuri.com.
//
// Toca APIs externas (Vercel + Cloudflare) y usa el service client — por eso
// es un API route y no una escritura directa desde el client component,
// a diferencia del resto de las páginas de Configuración (ver CLAUDE.md).

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { addDomainToProject, getDomainStatus, verifyDomain, removeDomainFromProject, normalizeDomain } from '@/lib/vercel'
import { assignDomainToWidgetPool, removeDomainFromWidgetPool } from '@/lib/turnstile'

async function getTenant() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) } as const

  const service = createServiceClient()
  const { data: _userRows } = await service.from('users').select('tenant_id, role').eq('id', user.id).limit(1)
  const userRow = _userRows?.[0]
  if (!userRow?.tenant_id) return { error: NextResponse.json({ error: 'No se encontró el tenant' }, { status: 404 }) } as const
  if (userRow.role === 'staff') return { error: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) } as const

  const { data: _tenants } = await service
    .from('tenants')
    .select('id, template, domain, domain_status')
    .eq('id', userRow.tenant_id)
    .limit(1)
  const tenant = _tenants?.[0]
  if (!tenant) return { error: NextResponse.json({ error: 'No se encontró el tenant' }, { status: 404 }) } as const

  return { service, tenant } as const
}

export async function POST(req: Request) {
  const result = await getTenant()
  if ('error' in result) return result.error
  const { service, tenant } = result

  const { domain: rawDomain } = await req.json().catch(() => ({}))
  const normalized = normalizeDomain(rawDomain ?? '')
  // OJO: "normalized.ok === false" (no "!normalized.ok") a propósito. Con
  // strict:false en tsconfig, TS no angosta bien el union discriminado con
  // el operador "!" sobre un booleano literal — sí lo hace con "=== false".
  // Confirmado con un repro aislado (ver incidente 2026-08-04).
  if (normalized.ok === false) return NextResponse.json({ error: normalized.error }, { status: 400 })
  const domain = normalized.domain

  try {
    const status = await addDomainToProject(tenant.template, domain)

    await service
      .from('tenants')
      .update({ domain, domain_status: status.verified ? 'verified' : 'pending' })
      .eq('id', tenant.id)

    if (status.verified) {
      const { widgetId, siteKey } = await assignDomainToWidgetPool(domain)
      await service
        .from('store_config')
        .update({ turnstile_widget_id: widgetId, turnstile_site_key: siteKey })
        .eq('tenant_id', tenant.id)
    }

    return NextResponse.json({ ok: true, domain, verified: status.verified, verification: status.verification })
  } catch (e) {
    await service.from('tenants').update({ domain_status: 'error' }).eq('id', tenant.id)
    const message = e instanceof Error ? e.message : 'Error agregando el dominio'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET() {
  const result = await getTenant()
  if ('error' in result) return result.error
  const { service, tenant } = result

  if (!tenant.domain) {
    return NextResponse.json({ domain: null, status: 'none', verification: null })
  }

  try {
    const status = await verifyDomain(tenant.template, tenant.domain)
    const wasVerified = tenant.domain_status === 'verified'

    await service
      .from('tenants')
      .update({ domain_status: status.verified ? 'verified' : 'pending' })
      .eq('id', tenant.id)

    if (status.verified && !wasVerified) {
      const { widgetId, siteKey } = await assignDomainToWidgetPool(tenant.domain)
      await service
        .from('store_config')
        .update({ turnstile_widget_id: widgetId, turnstile_site_key: siteKey })
        .eq('tenant_id', tenant.id)
    }

    return NextResponse.json({
      domain: tenant.domain,
      status: status.verified ? 'verified' : 'pending',
      verification: status.verification,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Error consultando el dominio'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE() {
  const result = await getTenant()
  if ('error' in result) return result.error
  const { service, tenant } = result

  if (!tenant.domain) return NextResponse.json({ ok: true })

  try {
    await removeDomainFromProject(tenant.template, tenant.domain)

    const { data: _configs } = await service
      .from('store_config')
      .select('turnstile_widget_id')
      .eq('tenant_id', tenant.id)
      .limit(1)
    const widgetId = _configs?.[0]?.turnstile_widget_id
    if (widgetId) {
      // OJO: sacar la referencia ANTES de tocar turnstile_widgets, no después.
      // store_config.turnstile_widget_id -> turnstile_widgets(id) es un FK sin
      // ON DELETE CASCADE (a propósito). Si este era el último dominio del
      // widget, removeDomainFromWidgetPool borra esa fila — y mientras
      // store_config siga apuntando a ella, Postgres rechaza el DELETE con
      // una violación de FK. Eso corta la función a la mitad: el widget ya
      // se borró en Cloudflare pero la fila local queda huérfana con el
      // dominio viejo, y el próximo alta de dominio pisa un widget que ya
      // no existe del lado de Cloudflare ("Trying to access a deleted
      // widget"). Bug real, visto el 2026-08-04 con base153.com.
      await service.from('store_config').update({ turnstile_widget_id: null, turnstile_site_key: null }).eq('tenant_id', tenant.id)
      await removeDomainFromWidgetPool(widgetId, tenant.domain)
    }

    await service.from('tenants').update({ domain: null, domain_status: 'none' }).eq('id', tenant.id)

    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Error quitando el dominio'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Asignación de dominios propios al pool de widgets de Cloudflare Turnstile.
// Contexto completo en turnstile_widgets_migration.sql — resumen: el plan
// free de Turnstile permite 10 hostnames por widget y 20 widgets por cuenta,
// así que en vez de un site key fijo repartimos los dominios de los tenants
// entre varios widgets y guardamos la asignación en turnstile_widgets.
//
// Requiere en Vercel > Panel Admin > Settings > Environment Variables:
//   CF_API_TOKEN  — API Token de Cloudflare con permiso Account:Turnstile:Edit
//   CF_ACCOUNT_ID — Account ID de Cloudflare (dashboard > barra derecha)

import { createServiceClient } from './supabase/service'

const CF_API = 'https://api.cloudflare.com/client/v4'

// Techo real del plan free (ver turnstile_widgets_migration.sql). Si en algún
// momento se pasa a Enterprise, esto sube a 200 — un solo número para cambiar.
const MAX_DOMAINS_PER_WIDGET = 10

function cfHeaders(): Record<string, string> {
  const token = process.env.CF_API_TOKEN
  if (!token) throw new Error('[turnstile] Falta CF_API_TOKEN en Vercel > Panel Admin > Settings > Environment Variables')
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

function accountId(): string {
  const id = process.env.CF_ACCOUNT_ID
  if (!id) throw new Error('[turnstile] Falta CF_ACCOUNT_ID en Vercel > Panel Admin > Settings > Environment Variables')
  return id
}

interface TurnstileWidgetRow {
  id: string
  cf_widget_id: string
  site_key: string
  domains: string[]
  domain_count: number
}

async function createCloudflareWidget(domain: string): Promise<{ cfWidgetId: string; siteKey: string; secretKey: string }> {
  const res = await fetch(`${CF_API}/accounts/${accountId()}/challenges/widgets`, {
    method: 'POST',
    headers: cfHeaders(),
    body: JSON.stringify({
      name: `gounuri-pool-${Date.now()}`,
      mode: 'managed',
      domains: [domain],
    }),
  })
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.errors?.[0]?.message || `Error creando el widget de Turnstile (HTTP ${res.status})`)
  }
  // Turnstile identifica al widget por su propio sitekey — no hay un id separado.
  return { cfWidgetId: json.result.sitekey, siteKey: json.result.sitekey, secretKey: json.result.secret }
}

async function updateCloudflareWidgetDomains(cfWidgetId: string, domains: string[]): Promise<void> {
  const res = await fetch(`${CF_API}/accounts/${accountId()}/challenges/widgets/${cfWidgetId}`, {
    method: 'PUT',
    headers: cfHeaders(),
    body: JSON.stringify({ domains }),
  })
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.errors?.[0]?.message || `Error actualizando los dominios del widget de Turnstile (HTTP ${res.status})`)
  }
}

async function deleteCloudflareWidget(cfWidgetId: string): Promise<void> {
  const res = await fetch(`${CF_API}/accounts/${accountId()}/challenges/widgets/${cfWidgetId}`, {
    method: 'DELETE',
    headers: cfHeaders(),
  })
  if (!res.ok && res.status !== 404) {
    const json = await res.json().catch(() => ({}))
    throw new Error(json?.errors?.[0]?.message || `Error borrando el widget de Turnstile (HTTP ${res.status})`)
  }
}

// Asigna `domain` a un widget del pool: reutiliza uno con lugar libre
// (el más lleno que todavía tenga espacio, para no desparramar tenants
// innecesariamente entre widgets) o crea uno nuevo si todos están llenos.
// Devuelve el site_key público para guardar en store_config.
export async function assignDomainToWidgetPool(domain: string): Promise<{ widgetId: string; siteKey: string }> {
  const supabase = createServiceClient()

  const { data: candidates, error: selectError } = await supabase
    .from('turnstile_widgets')
    .select('id, cf_widget_id, site_key, domains, domain_count')
    .lt('domain_count', MAX_DOMAINS_PER_WIDGET)
    .order('domain_count', { ascending: false })
    .limit(1)

  if (selectError) throw new Error(selectError.message)

  const widget = candidates?.[0] as TurnstileWidgetRow | undefined

  if (widget) {
    if (widget.domains.includes(domain)) {
      return { widgetId: widget.id, siteKey: widget.site_key }
    }
    const newDomains = [...widget.domains, domain]
    await updateCloudflareWidgetDomains(widget.cf_widget_id, newDomains)
    const { error: updateError } = await supabase
      .from('turnstile_widgets')
      .update({ domains: newDomains, domain_count: newDomains.length })
      .eq('id', widget.id)
    if (updateError) throw new Error(updateError.message)
    return { widgetId: widget.id, siteKey: widget.site_key }
  }

  // Ningún widget con lugar — crear uno nuevo (hasta el tope de 20/cuenta free).
  const created = await createCloudflareWidget(domain)
  const { data: inserted, error: insertError } = await supabase
    .from('turnstile_widgets')
    .insert({
      cf_widget_id: created.cfWidgetId,
      site_key: created.siteKey,
      secret_key: created.secretKey,
      domains: [domain],
      domain_count: 1,
    })
    .select('id, site_key')
    .single()

  if (insertError || !inserted) throw new Error(insertError?.message || 'No se pudo guardar el widget nuevo en la base.')
  return { widgetId: inserted.id, siteKey: inserted.site_key }
}

// Saca `domain` del widget al que estaba asignado (cambio de dominio propio,
// o baja). Si era el último dominio de ese widget, lo borra de Cloudflare y
// de la base entera para no dejar huérfanos en el pool.
export async function removeDomainFromWidgetPool(widgetId: string, domain: string): Promise<void> {
  const supabase = createServiceClient()

  const { data } = await supabase
    .from('turnstile_widgets')
    .select('id, cf_widget_id, domains')
    .eq('id', widgetId)
    .limit(1)

  const widget = data?.[0]
  if (!widget) return

  const remaining = (widget.domains as string[]).filter(d => d !== domain)

  if (remaining.length === 0) {
    await deleteCloudflareWidget(widget.cf_widget_id)
    await supabase.from('turnstile_widgets').delete().eq('id', widget.id)
    return
  }

  await updateCloudflareWidgetDomains(widget.cf_widget_id, remaining)
  await supabase
    .from('turnstile_widgets')
    .update({ domains: remaining, domain_count: remaining.length })
    .eq('id', widget.id)
}

// Helper para automatizar el alta de dominios propios de tenants en Vercel.
//
// Cada template (tienda-mono, tienda-atelier, etc.) es UN proyecto de Vercel
// compartido por muchos tenants — agregar el dominio de un tenant a su
// proyecto es lo que hace que Vercel le empiece a servir tráfico y emita el
// certificado SSL. Los IDs de proyecto no son secretos (son públicos en el
// dashboard de Vercel), así que van hardcodeados acá; lo único que hace
// falta como env var es el token de API.
//
// Requiere en Vercel > Panel Admin > Settings > Environment Variables:
//   VERCEL_TOKEN   — token con permiso sobre estos proyectos (Settings > Tokens)
//   VERCEL_TEAM_ID — team_iXqWFN1rtfa5rHbCYtOIDHH9 (dmko2002's projects)

const VERCEL_API = 'https://api.vercel.com'

export const TEMPLATE_PROJECT_IDS: Record<string, string> = {
  minimalista: 'prj_oFrOvv350PGVvze23LEzthdgEJ7C',
  mono: 'prj_VEJBBp29Kaetf9kPrkGHjfQaLAtm',
  atelier: 'prj_Nn1TWSkkRzpvWascAkLn0TyCrsGR',
  axis: 'prj_kc2k00wA0zW738nTLynxtERZvFgG',
  glow: 'prj_eZ4GW1Ntepw9ffwy3WB8PVsC7RYk',
  bazaar: 'prj_dW7DmOnprm7ue304lhl3VMfqfyn8',
}

export function projectIdForTemplate(template: string): string {
  const id = TEMPLATE_PROJECT_IDS[template]
  if (!id) throw new Error(`[vercel] Template desconocido o sin proyecto de Vercel mapeado: "${template}"`)
  return id
}

function vercelHeaders(): Record<string, string> {
  const token = process.env.VERCEL_TOKEN
  if (!token) throw new Error('[vercel] Falta VERCEL_TOKEN en Vercel > Panel Admin > Settings > Environment Variables')
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

function teamQuery(): string {
  const teamId = process.env.VERCEL_TEAM_ID
  return teamId ? `?teamId=${teamId}` : ''
}

export interface VercelDnsRecord {
  type: string
  domain: string
  value: string
  reason: string
}

export interface VercelDomainStatus {
  verified: boolean
  verification: VercelDnsRecord[] | null
  /** true si Vercel devolvió "ya está agregado" en vez de un error real (reintentos) */
  alreadyAdded?: boolean
}

export interface DnsInstruction {
  type: 'A' | 'CNAME'
  name: string
  value: string
}

// ── Detección de dominio raíz (apex) ────────────────────────────────────────
// 2026-08-24: bug real encontrado con creai.com.ar — la heurística vieja
// ("labels.length <= 2 es raíz") asume que el TLD siempre es un solo label
// (.com, .ar). Pero en TLDs compuestos como .com.ar (Argentina), .co.uk,
// .com.br, etc. el TLD real son DOS labels, así que "creai.com.ar" tiene 3
// labels y la heurística vieja lo trataba como si "creai" fuera un
// SUBDOMINIO de "com.ar" — le decía al tenant que cargara un CNAME llamado
// "creai" en su propio DNS, algo que no tiene sentido dentro de la zona de
// creai.com.ar (ahí "creai" es el apex, no un label hijo) y que Vercel
// jamás iba a poder verificar. Con esto, "creai.com.ar" ahora se detecta
// bien como apex y pide el registro A en '@' que realmente hace falta.
//
// Lista no exhaustiva pero cubre los casos reales de la plataforma (dominios
// argentinos + los TLDs compuestos más comunes de la región/inglés). Si en
// el futuro hace falta cubrir más casos raros, la solución robusta es una
// public suffix list completa (paquete `tldts`), pero eso es dependencia
// nueva — esta lista alcanza para lo que la plataforma ve en la práctica.
const COMPOUND_SLDS = new Set([
  'com.ar', 'net.ar', 'org.ar', 'gov.ar', 'edu.ar', 'int.ar', 'mil.ar', 'tur.ar',
  'co.uk', 'org.uk', 'me.uk', 'ltd.uk', 'plc.uk',
  'com.br', 'com.mx', 'com.co', 'com.pe', 'com.uy', 'com.cl', 'com.bo', 'com.py', 'com.ec',
  'co.nz', 'com.au', 'co.za',
])

export function isApexDomain(domain: string): boolean {
  const labels = domain.split('.')
  if (labels.length < 2) return true
  const lastTwo = labels.slice(-2).join('.')
  const requiredLabels = COMPOUND_SLDS.has(lastTwo) ? 3 : 2
  return labels.length <= requiredLabels
}

// El nombre del label a usar en el CNAME cuando NO es apex — por ejemplo
// "shop.creai.com.ar" (apex real "creai.com.ar", TLD compuesto) debe pedir
// un CNAME llamado "shop", no "shop.creai" ni solo el primer label a ciegas
// (que rompía con TLDs compuestos de 3 labels).
function subLabel(domain: string): string {
  const labels = domain.split('.')
  const lastTwo = labels.slice(-2).join('.')
  const requiredLabels = COMPOUND_SLDS.has(lastTwo) ? 3 : 2
  return labels.slice(0, labels.length - requiredLabels).join('.')
}

// ── Alias www ────────────────────────────────────────────────────────────────
// 2026-08-24: aparte del bug de arriba, había un gap: aunque las instrucciones
// de DNS siempre sugieren cargar el CNAME de "www" (por si el tenant escribe
// de memoria www.mitienda.com), ese "www.mitienda.com" NUNCA se daba de alta
// como dominio en el proyecto de Vercel — solo se agregaba el que el tenant
// tipeó. Resultado: el DNS podía estar perfecto y aun así www.mitienda.com no
// cargaba nada (Vercel no lo tenía asociado a ningún proyecto). Ahora, si el
// tenant conecta un apex (mitienda.com) o un www explícito (www.mitienda.com),
// se da de alta automáticamente también la otra variante con redirect 308 a
// la que el tenant eligió como principal — así las dos siempre resuelven.
// Subdominios que no son ni apex ni "www.<apex>" (ej. "shop.mitienda.com") no
// generan alias: no hay una variante obvia que agregar sola.
export function wwwAliasFor(domain: string): string | null {
  if (domain.startsWith('www.')) {
    const bare = domain.slice(4)
    return isApexDomain(bare) ? bare : null
  }
  return isApexDomain(domain) ? `www.${domain}` : null
}

// `verification` (arriba) son los TXT de desafío de ownership que Vercel pide
// en casos borde (dominio ya usado en otra cuenta, etc.) — la mayoría de las
// veces viene vacío y ahí es donde el tenant se quedaba sin saber qué poner
// en su proveedor de DNS. Esto es lo que realmente hace falta siempre: el
// registro A (dominio raíz) o CNAME (subdominio) que apunta a Vercel, leído
// en vivo de /v6/domains/{domain}/config en vez de hardcodear los valores
// fijos (Vercel los puede cambiar).
export async function getDnsInstructions(template: string, domain: string): Promise<DnsInstruction[]> {
  const projectId = projectIdForTemplate(template)
  const res = await fetch(
    `${VERCEL_API}/v6/domains/${domain}/config?projectIdOrName=${projectId}${teamQuery() ? '&' + teamQuery().slice(1) : ''}`,
    { headers: vercelHeaders() }
  )
  const json = await res.json()
  if (!res.ok) {
    console.error(`[vercel] getDnsInstructions falló para ${domain} (HTTP ${res.status}):`, JSON.stringify(json))
    return []
  }

  const ip = json.recommendedIPv4?.[0]?.value?.[0] ?? '76.76.21.21'
  const cname = json.recommendedCNAME?.[0]?.value ?? 'cname.vercel-dns.com'
  const instructions: DnsInstruction[] = []

  if (isApexDomain(domain)) {
    // Dominio raíz: A en '@' para que funcione mitienda.com (o creai.com.ar),
    // más CNAME en 'www' — la mayoría de la gente escribe www.mitienda.com
    // de memoria, y ahora esa variante se da de alta sola (ver wwwAliasFor).
    instructions.push({ type: 'A', name: '@', value: ip })
    instructions.push({ type: 'CNAME', name: 'www', value: cname })
  } else {
    // Ya es un subdominio (ej. "shop.mitienda.com" o "shop.creai.com.ar") —
    // el A del dominio raíz no aplica acá, solo el CNAME de ESE label.
    instructions.push({ type: 'CNAME', name: subLabel(domain), value: cname })
  }

  return instructions
}

// 2026-08-24: gap encontrado en vivo con creai.com.ar — `verified` (que es lo
// único que se chequeaba hasta ahora, ver addDomainToProject/getDomainStatus/
// verifyDomain) es solo la PROPIEDAD del dominio (¿sos vos el dueño?, casi
// siempre true de entrada si nadie más lo tiene cargado en otra cuenta de
// Vercel) — es un concepto DISTINTO de si el DNS ya apunta bien a Vercel.
// Un dominio puede estar "verified" y al mismo tiempo el panel de Vercel
// mostrarlo en rojo "Invalid Configuration" porque el A/CNAME real todavía
// no resuelve. Antes de esto, el Panel Admin marcaba domain_status='verified'
// (y le decía al tenant "tu tienda ya está en vivo") con solo `verified`,
// sin chequear esto — falso positivo. Ahora se combina con `misconfigured`
// de acá, leído del mismo endpoint que ya usa getDnsInstructions.
export async function isDomainMisconfigured(domain: string): Promise<boolean> {
  const res = await fetch(`${VERCEL_API}/v6/domains/${domain}/config${teamQuery()}`, { headers: vercelHeaders() })
  const json = await res.json()
  if (!res.ok) {
    console.error(`[vercel] isDomainMisconfigured falló para ${domain} (HTTP ${res.status}):`, JSON.stringify(json))
    // No pudimos confirmar que el DNS esté bien — no afirmar que está en vivo.
    return true
  }
  return !!json.misconfigured
}

// POST — agrega el dominio al proyecto. Si ya estaba agregado (reintento
// desde el panel, o el tenant lo había cargado antes), no falla: Vercel
// devuelve 409 con el dominio existente y lo tratamos como éxito.
//
// 2026-08-24: además, si el dominio es apex o "www.<apex>", da de alta
// también la otra variante con redirect 308 hacia la que el tenant eligió
// (ver wwwAliasFor) — así las dos direcciones siempre resuelven, no solo la
// que se tipeó. Es best-effort: si el alias falla, no aborta el alta del
// dominio principal (que es el que de verdad importa), solo lo logea.
export async function addDomainToProject(template: string, domain: string): Promise<VercelDomainStatus> {
  const projectId = projectIdForTemplate(template)
  const res = await fetch(`${VERCEL_API}/v10/projects/${projectId}/domains${teamQuery()}`, {
    method: 'POST',
    headers: vercelHeaders(),
    body: JSON.stringify({ name: domain }),
  })
  const json = await res.json()

  if (!res.ok) {
    if (json?.error?.code === 'domain_already_in_use' && json?.error?.projectId === projectId) {
      // Ya está en ESTE proyecto — no es un error, seguir con el estado actual.
      const status = await getDomainStatus(template, domain)
      await addWwwAlias(projectId, domain)
      return status
    }
    throw new Error(json?.error?.message || `Error agregando el dominio en Vercel (HTTP ${res.status})`)
  }

  await addWwwAlias(projectId, domain)

  return { verified: !!json.verified, verification: json.verification ?? null }
}

async function addWwwAlias(projectId: string, canonicalDomain: string): Promise<void> {
  const alias = wwwAliasFor(canonicalDomain)
  if (!alias) return
  try {
    const res = await fetch(`${VERCEL_API}/v10/projects/${projectId}/domains${teamQuery()}`, {
      method: 'POST',
      headers: vercelHeaders(),
      body: JSON.stringify({ name: alias, redirect: canonicalDomain, redirectStatusCode: 308 }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      // 409 domain_already_in_use en ESTE proyecto = ya estaba, no es error.
      if (json?.error?.code === 'domain_already_in_use' && json?.error?.projectId === projectId) return
      console.error(`[vercel] no se pudo dar de alta el alias ${alias} -> ${canonicalDomain}:`, JSON.stringify(json))
    }
  } catch (e) {
    console.error(`[vercel] error de red dando de alta el alias ${alias} -> ${canonicalDomain}:`, e)
  }
}

// GET — estado actual sin forzar un nuevo intento de verificación.
export async function getDomainStatus(template: string, domain: string): Promise<VercelDomainStatus> {
  const projectId = projectIdForTemplate(template)
  const res = await fetch(`${VERCEL_API}/v9/projects/${projectId}/domains/${domain}${teamQuery()}`, {
    headers: vercelHeaders(),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error?.message || `Error consultando el dominio en Vercel (HTTP ${res.status})`)
  return { verified: !!json.verified, verification: json.verification ?? null }
}

// POST /verify — le pide a Vercel que vuelva a chequear el DNS ahora mismo
// (lo que llama el botón "Ya lo configuré" del panel).
export async function verifyDomain(template: string, domain: string): Promise<VercelDomainStatus> {
  const projectId = projectIdForTemplate(template)
  const res = await fetch(`${VERCEL_API}/v9/projects/${projectId}/domains/${domain}/verify${teamQuery()}`, {
    method: 'POST',
    headers: vercelHeaders(),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error?.message || `Error verificando el dominio en Vercel (HTTP ${res.status})`)
  return { verified: !!json.verified, verification: json.verification ?? null }
}

// DELETE — desasocia el dominio del proyecto (ej. el tenant lo da de baja o
// lo cambia por otro). No borra el dominio de la cuenta de Vercel entera,
// solo la asociación a este proyecto — suficiente para dejar de servir ahí.
//
// 2026-08-24: también quita el alias www (o el apex, según cuál se haya
// dado de alta automáticamente en addDomainToProject) — sin esto quedaba un
// dominio huérfano en el proyecto de Vercel apuntando a un redirect roto.
//
// OJO CON EL ORDEN: el alias tiene `redirect: <domain>` apuntándole a este
// dominio — Vercel se niega a borrar `domain` mientras ese redirect siga
// existiendo ("Cannot remove X until existing redirects to X are removed").
// Bug real visto el 24/8 con creai.com.ar: la primera versión de esta
// función borraba el dominio principal PRIMERO, así que siempre fallaba acá
// (el tenant se quedaba con domain_status='error' y el dominio nunca se
// desconectaba). El alias tiene que borrarse ANTES que el dominio principal.
// El alias es best-effort (si falla igual seguimos con el principal, que es
// el que de verdad importa); el principal si falla sí se propaga como error.
export async function removeDomainFromProject(template: string, domain: string): Promise<void> {
  const projectId = projectIdForTemplate(template)

  const alias = wwwAliasFor(domain)
  if (alias) {
    try {
      const aliasRes = await fetch(`${VERCEL_API}/v9/projects/${projectId}/domains/${alias}${teamQuery()}`, {
        method: 'DELETE',
        headers: vercelHeaders(),
      })
      if (!aliasRes.ok && aliasRes.status !== 404) {
        console.error(`[vercel] no se pudo quitar el alias ${alias}:`, await aliasRes.text())
      }
    } catch (e) {
      console.error(`[vercel] error de red quitando el alias ${alias}:`, e)
    }
  }

  const res = await fetch(`${VERCEL_API}/v9/projects/${projectId}/domains/${domain}${teamQuery()}`, {
    method: 'DELETE',
    headers: vercelHeaders(),
  })
  if (!res.ok && res.status !== 404) {
    const json = await res.json().catch(() => ({}))
    throw new Error(json?.error?.message || `Error quitando el dominio en Vercel (HTTP ${res.status})`)
  }
}

// Validación básica antes de mandar cualquier cosa a la API de Vercel —
// rechaza esquemas, puertos y paths (mismos formatos inválidos que rechaza
// Turnstile para hostnames, conviene cortar acá antes en vez de que falle
// más abajo con un error menos claro).
export function normalizeDomain(raw: string): { ok: true; domain: string } | { ok: false; error: string } {
  const value = raw.trim().toLowerCase()
  if (!value) return { ok: false, error: 'Ingresá un dominio.' }
  if (/^https?:\/\//.test(value)) return { ok: false, error: 'No incluyas "http://" ni "https://", solo el dominio.' }
  if (value.includes('/')) return { ok: false, error: 'No incluyas rutas, solo el dominio (ej: mitienda.com).' }
  if (value.includes(':')) return { ok: false, error: 'No incluyas el puerto.' }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(value)) {
    return { ok: false, error: 'El dominio no tiene un formato válido (ej: mitienda.com).' }
  }
  return { ok: true, domain: value }
}

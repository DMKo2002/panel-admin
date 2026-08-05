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

  // Heurística: dominio con un solo nivel antes del TLD (ej. "mitienda.com")
  // es raíz. No cubre TLDs compuestos (.co.uk y similares) pero cubre bien
  // los casos reales de la plataforma (.com/.ar).
  const labels = domain.split('.')
  const isApex = labels.length <= 2
  const ip = json.recommendedIPv4?.[0]?.value?.[0] ?? '76.76.21.21'
  const cname = json.recommendedCNAME?.[0]?.value ?? 'cname.vercel-dns.com'
  const instructions: DnsInstruction[] = []

  if (isApex) {
    // Dominio raíz: A en '@' para que funcione mitienda.com, más CNAME en
    // 'www' — la mayoría de la gente escribe www.mitienda.com de memoria,
    // sin este segundo registro esa versión no carga.
    instructions.push({ type: 'A', name: '@', value: ip })
    instructions.push({ type: 'CNAME', name: 'www', value: cname })
  } else {
    // Ya es un subdominio (ej. "shop.mitienda.com") — el A del dominio raíz
    // no aplica acá, solo el CNAME de ESE label.
    instructions.push({ type: 'CNAME', name: labels[0], value: cname })
  }

  return instructions
}

// POST — agrega el dominio al proyecto. Si ya estaba agregado (reintento
// desde el panel, o el tenant lo había cargado antes), no falla: Vercel
// devuelve 409 con el dominio existente y lo tratamos como éxito.
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
      return getDomainStatus(template, domain)
    }
    throw new Error(json?.error?.message || `Error agregando el dominio en Vercel (HTTP ${res.status})`)
  }

  return { verified: !!json.verified, verification: json.verification ?? null }
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
export async function removeDomainFromProject(template: string, domain: string): Promise<void> {
  const projectId = projectIdForTemplate(template)
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

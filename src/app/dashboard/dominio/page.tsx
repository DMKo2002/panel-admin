'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Globe, Loader2, CheckCircle2, ExternalLink, Trash2 } from 'lucide-react'
import { useTutorial, type TutorialStep } from '@/components/tutorial/TutorialProvider'
import TutorialHint from '@/components/tutorial/TutorialHint'
import PageTutorialButton from '@/components/tutorial/PageTutorialButton'

type DomainStatus = 'none' | 'pending' | 'verified' | 'error'

// Un solo array fuente de verdad: lo usa tanto el tour completo de la página
// (Instrucciones de uso, en el header) como los botones (?) individuales.
// "dominio-connect" apunta al mismo data-tutorial en los 3 bloques
// mutuamente excluyentes (sin dominio / pendiente / verificado) — solo uno
// existe en el DOM en cada momento, así que el selector siempre encuentra
// el correcto sin importar en qué estado esté el tenant.
const DOMINIO_STEPS: TutorialStep[] = [
  {
    id: 'dominio-default',
    target: '[data-tutorial="dominio-default"]',
    title: 'Tu dirección en gounuri',
    content: 'Esta dirección (tuslug.gounuri.com) siempre funciona, tengas o no un dominio propio conectado — es tu respaldo, nunca se cae.',
  },
  {
    id: 'dominio-connect',
    target: '[data-tutorial="dominio-connect"]',
    title: 'Conectar tu dominio propio',
    content: 'Si ya compraste un dominio (ej. mitienda.com), cargalo acá. Te mostramos los registros DNS exactos para copiar y pegar en tu proveedor (Cloudflare, Whois, etc.). Puede tardar minutos u horas en propagar — tocá "Ya lo configuré, verificar" una vez que lo hayas cargado.',
  },
]

interface DnsRecord {
  type: string
  domain: string
  value: string
  reason: string
}

interface DnsInstruction {
  type: string
  name: string
  value: string
}

function CopyableRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-zinc-400 flex-shrink-0">{label}:</span>
      <button
        type="button"
        onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
        className="flex-1 text-right break-all hover:text-primary-700 transition-colors"
        title="Copiar"
      >
        {copied ? 'Copiado ✓' : value}
      </button>
    </div>
  )
}

export default function DominioPage() {
  const supabase = createClient()
  const { registerSteps } = useTutorial()
  const [slug, setSlug] = useState('')
  const [domain, setDomain] = useState<string | null>(null)
  const [status, setStatus] = useState<DomainStatus>('none')
  const [verification, setVerification] = useState<DnsRecord[] | null>(null)
  const [dns, setDns] = useState<DnsInstruction[]>([])

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    registerSteps('dominio', DOMINIO_STEPS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: _userRows } = await supabase.from('users').select('tenant_id').eq('id', user.id).limit(1)
      const tenantId = _userRows?.[0]?.tenant_id
      if (!tenantId) { setLoading(false); return }
      const { data: _tenants } = await supabase.from('tenants').select('slug, domain, domain_status').eq('id', tenantId).limit(1)
      const tenant = _tenants?.[0]
      if (tenant) {
        setSlug(tenant.slug)
        setDomain(tenant.domain)
        const domainStatus = (tenant.domain_status as DomainStatus) ?? 'none'
        setStatus(domainStatus)
        // Si ya había tipeado un dominio en el onboarding pero nunca se llegó
        // a conectar (domain_status sigue 'none'), precargarlo acá para que
        // no tenga que volver a escribirlo.
        if (domainStatus === 'none' && tenant.domain) {
          setInput(tenant.domain)
        }
        // Pendiente/error: los registros DNS no se guardan en la base (se
        // piden en vivo a Vercel) — sin esto, al refrescar la página el
        // tenant se quedaba sin verlos hasta tocar "Verificar" a mano.
        if ((domainStatus === 'pending' || domainStatus === 'error') && tenant.domain) {
          fetch('/api/dominio').then(r => r.json()).then(json => setDns(json.dns ?? [])).catch(() => {})
        }
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/dominio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: input }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? 'No se pudo agregar el dominio.')
      setDomain(json.domain)
      setStatus(json.verified ? 'verified' : 'pending')
      setVerification(json.verification)
      setDns(json.dns ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo agregar el dominio.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCheck() {
    setChecking(true)
    setError(null)
    try {
      const res = await fetch('/api/dominio')
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? 'No se pudo verificar el dominio.')
      setStatus(json.status)
      setVerification(json.verification)
      setDns(json.dns ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo verificar el dominio.')
    } finally {
      setChecking(false)
    }
  }

  async function handleRemove() {
    if (!confirm(`¿Quitar ${domain}? Tu tienda vuelve a estar solo en ${slug}.gounuri.com.`)) return
    setRemoving(true)
    setError(null)
    try {
      const res = await fetch('/api/dominio', { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? 'No se pudo quitar el dominio.')
      setDomain(null)
      setStatus('none')
      setVerification(null)
      setInput('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo quitar el dominio.')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div>
      <div className="sticky top-0 z-10 px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Dominio</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Usá tu propio dominio en vez de {slug || 'tu-tienda'}.gounuri.com</p>
          <PageTutorialButton pageKey="dominio" />
        </div>
      </div>

      <div className="px-8 py-6 max-w-2xl space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 size={15} className="animate-spin" /> Cargando...
          </div>
        ) : (
          <>
            {/* Dominio por defecto — siempre activo */}
            <div data-tutorial="dominio-default" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-2">
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-semibold text-zinc-700">Tu dirección en gounuri</h2>
                <TutorialHint pageKey="dominio" step={DOMINIO_STEPS[0]} />
              </div>
              <div className="flex items-center gap-2 text-sm text-zinc-600">
                <Globe size={14} className="text-zinc-400" />
                <span>{slug || 'tu-tienda'}.gounuri.com</span>
                <a href={`https://${slug}.gounuri.com`} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-zinc-900">
                  <ExternalLink size={13} />
                </a>
              </div>
              <p className="text-xs text-zinc-400">Siempre funciona, tengas o no un dominio propio configurado.</p>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}

            {/* Sin dominio propio todavía */}
            {status === 'none' && (
              <form data-tutorial="dominio-connect" onSubmit={handleAdd} className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-sm font-semibold text-zinc-700">Dominio propio</h2>
                    <TutorialHint pageKey="dominio" step={DOMINIO_STEPS[1]} />
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">Si ya tenés un dominio comprado (ej: mitienda.com), lo conectamos acá.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Dominio</label>
                  <input
                    className="input text-sm"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="mitienda.com"
                    required
                  />
                </div>
                <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
                  {saving && <Loader2 size={14} className="animate-spin inline mr-1.5" />}
                  {saving ? 'Agregando...' : 'Conectar dominio'}
                </button>
              </form>
            )}

            {/* Pendiente de DNS (o quedó en error en un intento anterior — mismo
                bloque, con "Verificar" el usuario reintenta sin tener que
                volver a escribir el dominio) */}
            {(status === 'pending' || status === 'error') && domain && (
              <div data-tutorial="dominio-connect" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-sm font-semibold text-zinc-700">{domain}</h2>
                    <TutorialHint pageKey="dominio" step={DOMINIO_STEPS[1]} />
                  </div>
                  {status === 'error' ? (
                    <p className="text-xs text-red-600 mt-0.5">Hubo un error conectando el dominio. Probá "Verificar" para reintentar.</p>
                  ) : (
                    <p className="text-xs text-amber-600 mt-0.5">Falta configurar el DNS — todavía no está en vivo.</p>
                  )}
                </div>

                {dns.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-zinc-500">
                      Entrá a donde compraste el dominio (o donde manejás el DNS) y cargá este registro — tocá el valor para copiarlo:
                    </p>
                    {dns.map((rec, i) => (
                      <div key={i} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs font-mono space-y-1.5">
                        <CopyableRow label="Tipo" value={rec.type} />
                        <CopyableRow label="Nombre" value={rec.name} />
                        <CopyableRow label="Valor" value={rec.value} />
                      </div>
                    ))}
                  </div>
                )}

                {/* Caso borde: Vercel pide probar que el dominio es tuyo (ya
                    está usado en otra cuenta, etc.) — casi nunca aparece. */}
                {verification && verification.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-600">
                      Vercel además pide verificar la propiedad del dominio con este registro:
                    </p>
                    {verification.map((rec, i) => (
                      <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-mono space-y-1.5">
                        <CopyableRow label="Tipo" value={rec.type} />
                        <CopyableRow label="Nombre" value={rec.domain} />
                        <CopyableRow label="Valor" value={rec.value} />
                      </div>
                    ))}
                  </div>
                )}

                {dns.length === 0 && (!verification || verification.length === 0) && (
                  <p className="text-xs text-zinc-500">
                    Apuntá el dominio a Vercel (CNAME a <code className="bg-zinc-100 px-1 rounded">cname.vercel-dns.com</code> si es un subdominio, o los registros que te haya indicado tu proveedor para el dominio raíz).
                  </p>
                )}

                <p className="text-xs text-zinc-400">El DNS puede tardar desde minutos hasta 24-48hs en propagar.</p>

                <div className="flex gap-3">
                  <button onClick={handleCheck} disabled={checking} className="btn-primary disabled:opacity-60">
                    {checking && <Loader2 size={14} className="animate-spin inline mr-1.5" />}
                    {checking ? 'Verificando...' : 'Ya lo configuré, verificar'}
                  </button>
                  <button onClick={handleRemove} disabled={removing} className="btn-secondary disabled:opacity-60 flex items-center gap-1.5">
                    <Trash2 size={14} /> Quitar
                  </button>
                </div>
              </div>
            )}

            {/* Verificado y en vivo */}
            {status === 'verified' && domain && (
              <div data-tutorial="dominio-connect" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-green-600" />
                  <h2 className="text-sm font-semibold text-zinc-700">{domain}</h2>
                  <TutorialHint pageKey="dominio" step={DOMINIO_STEPS[1]} />
                </div>
                <p className="text-xs text-zinc-500">Tu tienda ya está en vivo en tu dominio propio.</p>
                <div className="flex gap-3">
                  <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex items-center gap-1.5">
                    Ver tienda <ExternalLink size={13} />
                  </a>
                  <button onClick={handleRemove} disabled={removing} className="btn-secondary disabled:opacity-60 flex items-center gap-1.5">
                    {removing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Quitar
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

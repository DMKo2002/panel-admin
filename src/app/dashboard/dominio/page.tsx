'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Globe, Loader2, CheckCircle2, ExternalLink, Trash2 } from 'lucide-react'

type DomainStatus = 'none' | 'pending' | 'verified'

interface DnsRecord {
  type: string
  domain: string
  value: string
  reason: string
}

export default function DominioPage() {
  const supabase = createClient()
  const [slug, setSlug] = useState('')
  const [domain, setDomain] = useState<string | null>(null)
  const [status, setStatus] = useState<DomainStatus>('none')
  const [verification, setVerification] = useState<DnsRecord[] | null>(null)

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        setStatus((tenant.domain_status as DomainStatus) ?? 'none')
        // Si ya había tipeado un dominio en el onboarding pero nunca se llegó
        // a conectar (domain_status sigue 'none'), precargarlo acá para que
        // no tenga que volver a escribirlo.
        if ((tenant.domain_status ?? 'none') === 'none' && tenant.domain) {
          setInput(tenant.domain)
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
            <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-2">
              <h2 className="text-sm font-semibold text-zinc-700">Tu dirección en gounuri</h2>
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
              <form onSubmit={handleAdd} className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-700">Dominio propio</h2>
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

            {/* Pendiente de DNS */}
            {status === 'pending' && domain && (
              <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-700">{domain}</h2>
                  <p className="text-xs text-amber-600 mt-0.5">Falta configurar el DNS — todavía no está en vivo.</p>
                </div>

                {verification && verification.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-zinc-500">
                      Entrá a donde compraste el dominio (o donde manejás el DNS) y agregá este registro:
                    </p>
                    {verification.map((rec, i) => (
                      <div key={i} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs font-mono space-y-1">
                        <p><span className="text-zinc-400">Tipo:</span> {rec.type}</p>
                        <p><span className="text-zinc-400">Nombre:</span> {rec.domain}</p>
                        <p className="break-all"><span className="text-zinc-400">Valor:</span> {rec.value}</p>
                      </div>
                    ))}
                  </div>
                ) : (
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
              <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-green-600" />
                  <h2 className="text-sm font-semibold text-zinc-700">{domain}</h2>
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

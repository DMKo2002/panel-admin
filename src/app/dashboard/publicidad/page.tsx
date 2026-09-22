'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTutorial, type TutorialStep } from '@/components/tutorial/TutorialProvider'
import TutorialHint from '@/components/tutorial/TutorialHint'
import PageTutorialButton from '@/components/tutorial/PageTutorialButton'
import { Trash2 } from 'lucide-react'
import type { AdInvestment, AdPlatform } from '@/lib/types'

const PLATFORM_LABELS: Record<AdPlatform, string> = {
  meta: 'Meta (Facebook/Instagram)',
  google: 'Google Ads',
  tiktok: 'TikTok Ads',
  otro: 'Otra plataforma',
}

const PLATFORM_MEDIUM: Record<AdPlatform, string> = {
  meta: 'paid_social',
  google: 'cpc',
  tiktok: 'paid_social',
  otro: 'ad',
}

const PLATFORMS = Object.keys(PLATFORM_LABELS) as AdPlatform[]

const PUBLICIDAD_STEPS: TutorialStep[] = [
  {
    id: 'publicidad-link',
    target: '[data-tutorial="publicidad-link"]',
    title: 'Link para tu anuncio',
    content: 'Usá este link como destino de tu anuncio (no el link normal de tu tienda) para que podamos saber qué ventas vinieron de ahí.',
  },
  {
    id: 'publicidad-inversion',
    target: '[data-tutorial="publicidad-inversion"]',
    title: 'Cuánto invertiste',
    content: 'Cargá acá cuánto gastaste en el período que quieras medir. Es información que solo vos cargás — no la sacamos de ninguna cuenta de ads.',
  },
  {
    id: 'publicidad-resultado',
    target: '[data-tutorial="publicidad-resultado"]',
    title: 'Resultado',
    content: 'Comparamos lo que cargaste contra las ventas de gente que entró por ese link, en el mismo período.',
  },
]

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
function firstOfMonthISO() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

function CopyableUrl({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 min-w-0 truncate rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-mono text-zinc-700">
        {value}
      </code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        className="btn-primary text-xs px-3 py-2 flex-shrink-0"
      >
        {copied ? '✓ Copiado' : 'Copiar'}
      </button>
    </div>
  )
}

function money(n: number): string {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
}

export default function PublicidadPage() {
  const supabase = createClient()
  const { registerSteps } = useTutorial()

  useEffect(() => {
    registerSteps('publicidad', PUBLICIDAD_STEPS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [tenantId, setTenantId] = useState<string | null>(null)
  const [domain, setDomain] = useState<string | null>(null)

  // Generador de link con UTM para pegar en el anuncio
  const [linkPlatform, setLinkPlatform] = useState<AdPlatform>('meta')
  const [linkCampaign, setLinkCampaign] = useState('')

  // Carga manual de inversión
  const [investments, setInvestments] = useState<AdInvestment[]>([])
  const [loadingInvestments, setLoadingInvestments] = useState(true)
  const [newAmount, setNewAmount] = useState('')
  const [newFrom, setNewFrom] = useState(firstOfMonthISO())
  const [newTo, setNewTo] = useState(todayISO())
  const [newPlatform, setNewPlatform] = useState<AdPlatform>('meta')
  const [newLabel, setNewLabel] = useState('')
  const [savingInvestment, setSavingInvestment] = useState(false)
  const [investmentError, setInvestmentError] = useState<string | null>(null)

  // Resultado del período
  const [resultFrom, setResultFrom] = useState(firstOfMonthISO())
  const [resultTo, setResultTo] = useState(todayISO())
  const [resultLoading, setResultLoading] = useState(false)
  const [attributedOrders, setAttributedOrders] = useState(0)
  const [attributedTotal, setAttributedTotal] = useState(0)

  const loadInvestments = useCallback(async (tid: string) => {
    setLoadingInvestments(true)
    const { data } = await supabase
      .from('ad_investments')
      .select('id, tenant_id, amount, period_start, period_end, platform, campaign_label, notes, created_at, created_by')
      .eq('tenant_id', tid)
      .order('period_start', { ascending: false })
    setInvestments((data as AdInvestment[]) ?? [])
    setLoadingInvestments(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userRows } = await supabase.from('users').select('tenant_id').eq('id', user.id).limit(1)
      const userRow = userRows?.[0]
      if (!userRow) return
      setTenantId(userRow.tenant_id)

      const { data: tenant } = await supabase.from('tenants').select('domain').eq('id', userRow.tenant_id).single()
      if (tenant?.domain) setDomain(tenant.domain)

      loadInvestments(userRow.tenant_id)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadResults = useCallback(async () => {
    if (!tenantId) return
    setResultLoading(true)
    const { data, error } = await supabase
      .from('orders')
      .select('total')
      .eq('tenant_id', tenantId)
      .not('utm_source', 'is', null)
      .neq('status', 'cancelled')
      .gte('created_at', `${resultFrom}T00:00:00`)
      .lte('created_at', `${resultTo}T23:59:59`)
    if (!error && data) {
      setAttributedOrders(data.length)
      setAttributedTotal(data.reduce((acc: number, o: any) => acc + Number(o.total || 0), 0))
    }
    setResultLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, resultFrom, resultTo])

  useEffect(() => {
    if (tenantId) loadResults()
  }, [tenantId, resultFrom, resultTo, loadResults])

  const investedInRange = investments
    .filter(inv => inv.period_start <= resultTo && inv.period_end >= resultFrom)
    .reduce((acc, inv) => acc + Number(inv.amount), 0)

  async function handleAddInvestment() {
    if (!tenantId) return
    const amount = Number(newAmount)
    if (!amount || amount <= 0) {
      setInvestmentError('Ingresá un monto válido.')
      return
    }
    if (newTo < newFrom) {
      setInvestmentError('La fecha "hasta" no puede ser anterior a "desde".')
      return
    }
    setSavingInvestment(true)
    setInvestmentError(null)
    const { error } = await supabase.from('ad_investments').insert({
      tenant_id: tenantId,
      amount,
      period_start: newFrom,
      period_end: newTo,
      platform: newPlatform,
      campaign_label: newLabel.trim() || null,
    })
    setSavingInvestment(false)
    if (error) {
      setInvestmentError(error.message || 'No se pudo guardar. Reintentá o contactá a soporte.')
      return
    }
    setNewAmount('')
    setNewLabel('')
    loadInvestments(tenantId)
  }

  async function handleDeleteInvestment(id: string) {
    if (!tenantId) return
    await supabase.from('ad_investments').delete().eq('id', id)
    loadInvestments(tenantId)
  }

  const linkUrl = domain
    ? `https://${domain}/?utm_source=${linkPlatform}&utm_medium=${PLATFORM_MEDIUM[linkPlatform]}${linkCampaign.trim() ? `&utm_campaign=${encodeURIComponent(linkCampaign.trim())}` : ''}`
    : null

  const ratio = investedInRange > 0 ? attributedTotal / investedInRange : null

  return (
    <div>
      <div className="sticky top-0 z-10 px-8 py-6 border-b border-zinc-200 bg-white">
        <h1 className="text-xl font-semibold text-zinc-900">Resultados de tus anuncios</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Cuánto invertiste en publicidad y qué ventas te generó — sin letra chica.</p>
        <PageTutorialButton pageKey="publicidad" />
      </div>

      <div className="px-8 py-6 max-w-2xl space-y-5">

        {/* Link con UTM para el anuncio */}
        <div data-tutorial="publicidad-link" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold text-zinc-700">Link para tus anuncios</h2>
            <TutorialHint pageKey="publicidad" step={PUBLICIDAD_STEPS[0]} />
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Para que podamos saber qué ventas vienen de un anuncio, el anuncio tiene que apuntar a este link (no al link
            normal de tu tienda). Armalo acá y pegalo como "sitio web" o "destino" cuando crees el anuncio en Meta,
            Google o TikTok.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Plataforma</label>
              <select className="input text-sm" value={linkPlatform} onChange={e => setLinkPlatform(e.target.value as AdPlatform)}>
                {PLATFORMS.map(p => (
                  <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Nombre de la campaña (opcional)</label>
              <input className="input text-sm" value={linkCampaign} onChange={e => setLinkCampaign(e.target.value)} placeholder="ej: dia-de-la-madre" />
            </div>
          </div>
          {domain && linkUrl ? (
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Tu link</label>
              <CopyableUrl value={linkUrl} />
            </div>
          ) : (
            <p className="text-xs text-zinc-400">Configurá primero un dominio para tu tienda en Dominio.</p>
          )}
        </div>

        {/* Carga manual de inversión */}
        <div data-tutorial="publicidad-inversion" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold text-zinc-700">Cuánto invertiste</h2>
            <TutorialHint pageKey="publicidad" step={PUBLICIDAD_STEPS[1]} />
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Cargalo vos a mano — no hace falta conectar ninguna cuenta de anuncios.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Desde</label>
              <input type="date" className="input text-sm" value={newFrom} onChange={e => setNewFrom(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Hasta</label>
              <input type="date" className="input text-sm" value={newTo} onChange={e => setNewTo(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Monto invertido</label>
              <input type="number" min="0" step="1" className="input text-sm" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="50000" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Plataforma</label>
              <select className="input text-sm" value={newPlatform} onChange={e => setNewPlatform(e.target.value as AdPlatform)}>
                {PLATFORMS.map(p => (
                  <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">Campaña (opcional)</label>
            <input className="input text-sm" value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="ej: dia-de-la-madre" />
          </div>

          {investmentError && <p className="text-xs text-red-600">{investmentError}</p>}

          <button onClick={handleAddInvestment} disabled={savingInvestment} className="btn-primary text-xs px-3 py-2 disabled:opacity-60">
            {savingInvestment ? 'Guardando...' : 'Agregar'}
          </button>

          {!loadingInvestments && investments.length > 0 && (
            <div className="pt-2 border-t border-zinc-100 space-y-1.5">
              {investments.map(inv => (
                <div key={inv.id} className="flex items-center justify-between text-xs text-zinc-600 py-1">
                  <span>
                    {money(Number(inv.amount))} — {PLATFORM_LABELS[(inv.platform ?? 'otro') as AdPlatform]}
                    {inv.campaign_label ? ` (${inv.campaign_label})` : ''}
                    {' · '}{inv.period_start} a {inv.period_end}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteInvestment(inv.id)}
                    className="text-zinc-400 hover:text-red-600 flex-shrink-0 ml-2"
                    aria-label="Borrar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Resultado */}
        <div data-tutorial="publicidad-resultado" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold text-zinc-700">Resultado</h2>
            <TutorialHint pageKey="publicidad" step={PUBLICIDAD_STEPS[2]} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Desde</label>
              <input type="date" className="input text-sm" value={resultFrom} onChange={e => setResultFrom(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Hasta</label>
              <input type="date" className="input text-sm" value={resultTo} onChange={e => setResultTo(e.target.value)} />
            </div>
          </div>

          {resultLoading ? (
            <p className="text-xs text-zinc-400">Calculando...</p>
          ) : (
            <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-4 space-y-2">
              {investedInRange > 0 ? (
                <p className="text-sm text-zinc-700">Invertiste <strong>{money(investedInRange)}</strong> en este período.</p>
              ) : (
                <p className="text-sm text-zinc-500">Todavía no cargaste cuánto invertiste en este período.</p>
              )}

              {attributedOrders > 0 ? (
                <p className="text-sm text-zinc-700">
                  <strong>{attributedOrders}</strong> {attributedOrders === 1 ? 'persona compró' : 'personas compraron'} después
                  de entrar por tu link de anuncio, por un total de <strong>{money(attributedTotal)}</strong>.
                </p>
              ) : (
                <p className="text-sm text-zinc-500">
                  Todavía no se registró ninguna venta desde tu link de anuncio en este período. Revisá que estés usando
                  el link de arriba (no el link normal de tu tienda) como destino del anuncio.
                </p>
              )}

              {ratio !== null && attributedOrders > 0 && (
                <p className="text-xs text-zinc-500 pt-1">
                  Por cada $1 que invertiste, generaste {ratio.toLocaleString('es-AR', { maximumFractionDigits: 2 })} en ventas.
                </p>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

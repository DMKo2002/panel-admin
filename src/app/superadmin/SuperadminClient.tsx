'use client'

import { useState } from 'react'
import { ExternalLink, LogIn, Pencil, Check, X, Copy, Globe, LogOut, Trash2, AlertTriangle, Eye, ShoppingBag, BarChart3, Wrench, Info, HandCoins, HardDrive, Shirt } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PLANS, formatStorage, getPlanForTenant, priceForTerm, TERM_DISCOUNTS, isBillingTerm, type BillingTerm } from '@/lib/plans'

export type TenantRow = {
  id: string
  name: string
  slug: string
  domain: string | null
  template: string
  status: string
  plan: string
  // null = legacy/sin trial (tenants de antes del modelo 2026-07-31).
  // 'trial' | 'active' | 'past_due' | 'canceled' — ver billing_migration.sql.
  planStatus: string | null
  debe: boolean
  ownerEmail: string | null
  // Datos personales del dueño — vienen de gounuri_accounts (ver
  // 2026-08-13: unificamos acá en vez de tener una pantalla aparte
  // "Clientes Gounuri" con la misma gente, para no tener que ir y venir
  // entre dos tablas para cruzar tienda ↔ persona). null si el tenant es
  // de antes de este flujo (no tiene fila en gounuri_accounts todavía).
  ownerNombre: string | null
  ownerApellido: string | null
  ownerDni: string | null
  ownerCelular: string | null
  frontendUrl: string | null
  // Vista agregada de superadmin — ver visitas/pedidos/GA4 de TODOS los
  // tenants acá nunca depende del plan de cada uno (a diferencia de
  // /dashboard/uso y /dashboard/google-analytics, que sí lo respetan).
  visitCount: number
  orderCount: number
  ga4Linked: boolean
  // Uso real vs. límite del plan (2026-08-18) — mismo parámetro que antes
  // cada tenant veía solo en su propio "Plan y uso", ahora consolidado acá
  // para poder calibrar mejor los límites de cada plan. Ver
  // superadmin/page.tsx para de dónde sale cada número.
  productCount: number
  productLimit: number
  storageMB: number
  storageLimitMB: number
  storageAvailable: boolean
  manualPaymentNote: string | null
  manualPaymentAt: string | null
  manualPaymentBy: string | null
  // Plazo pagado (2026-08-19) — 1/6/12 meses con descuento (ver
  // TERM_DISCOUNTS/priceForTerm en lib/plans.ts, mismos que el checkout de
  // MP). manualPaidUntil es lo que usa /api/cron/enforce para saber cuándo
  // vencer un pago manual — ver PAID_TERM_GRACE_DAYS en lib/usage.ts.
  manualPaymentTerm: number | null
  manualPaymentAmount: number | null
  manualPaidUntil: string | null
  // Fin del trial (2026-08-20) — junto con manualPaidUntil de arriba,
  // alimenta el contador de "días para renovar" del badge de plan_status.
  trialEndsAt: string | null
}

const TEMPLATE_LABELS: Record<string, string> = {
  default:  'Minimalista',
  mono:     'Mono',
  atelier:  'Atelier',
  axis:     'Axis',
}

const TEMPLATE_COLORS: Record<string, string> = {
  default:  'bg-zinc-700 text-zinc-200',
  mono:     'bg-stone-700 text-stone-200',
  atelier:  'bg-neutral-800 text-amber-300',
  axis:     'bg-zinc-800 text-zinc-100',
}

const STATUS_COLORS: Record<string, string> = {
  active:   'bg-emerald-900 text-emerald-300',
  pending:  'bg-amber-900 text-amber-300',
  inactive: 'bg-zinc-800 text-zinc-400',
}

const PLAN_LABELS: Record<string, string> = {
  free:     'Gratis',
  mini:     'Mini',
  standard: 'Business',
  premium:  'Premium',
  basic:    'Business', // legacy
}

const PLAN_COLORS: Record<string, string> = {
  free:     'bg-zinc-800 text-zinc-400',
  mini:     'bg-sky-900 text-sky-300',
  standard: 'bg-violet-900 text-violet-300',
  premium:  'bg-amber-900 text-amber-300',
  basic:    'bg-violet-900 text-violet-300', // legacy → mismo color que standard
}

const PANEL_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://panel.gounuri.com'

// Estado del plan (2026-08-18) — independiente del badge "Deuda" de arriba,
// que es específico de MP (past_due/payment_failed). Acá mostramos el
// plan_status crudo para poder distinguir de un vistazo quién sigue en
// trial (puede ser una tienda de Avellaneda todavía sin marcar como pagada)
// de quién ya está activo.
const PLAN_STATUS_LABELS: Record<string, string> = {
  trial:     'Trial',
  active:    'Activo',
  past_due:  'Pago pendiente',
  canceled:  'Cancelado',
}
const PLAN_STATUS_COLORS: Record<string, string> = {
  trial:     'bg-amber-950 text-amber-400',
  active:    'bg-emerald-950 text-emerald-400',
  past_due:  'bg-red-950 text-red-400',
  canceled:  'bg-zinc-800 text-zinc-500',
}

// "Días para renovar" (2026-08-20) — cuenta regresiva visible en la fila,
// no solo al pasar el mouse, para poder ver de un vistazo a quién hay que
// escribirle pronto. Cubre trial (trialEndsAt) y pago manual
// (manualPaidUntil) con el mismo criterio: negativo = ya venció (en gracia,
// el cron todavía no lo suspendió).
function diasRestantes(fechaIso: string): number {
  return Math.ceil((new Date(fechaIso).getTime() - Date.now()) / 86_400_000)
}
function textoDiasRestantes(fechaIso: string): string {
  const dias = diasRestantes(fechaIso)
  if (dias > 1) return `vence en ${dias} días`
  if (dias === 1) return 'vence mañana'
  if (dias === 0) return 'vence hoy'
  return `venció hace ${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'día' : 'días'}`
}
function colorDiasRestantes(fechaIso: string): string {
  const dias = diasRestantes(fechaIso)
  if (dias < 0) return 'text-red-400'
  if (dias <= 2) return 'text-amber-400'
  return 'text-zinc-500'
}

// Mismos umbrales que src/lib/usage.ts (overLimit/nearLimit) — >=100% rojo,
// >=80% ámbar, si no zinc.
function usageColor(pct: number): string {
  if (pct >= 100) return 'text-red-400'
  if (pct >= 80) return 'text-amber-400'
  return 'text-zinc-400'
}

// Solo para la preview del modal ("vence el ...") — el vencimiento real lo
// calcula el server (addMonths en mark-plan-paid/route.ts) al confirmar; acá
// alcanza con una fecha aproximada para mostrar antes de guardar.
function addMonthsLabel(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return d.toLocaleDateString('es-AR')
}

export default function SuperadminClient({ initialTenants }: { initialTenants: TenantRow[] }) {
  const [tenants, setTenants] = useState(initialTenants)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TenantRow | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [savingTemplateId, setSavingTemplateId] = useState<string | null>(null)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillResult, setBackfillResult] = useState<string | null>(null)
  const [creatingWidget, setCreatingWidget] = useState(false)
  const [widgetResult, setWidgetResult] = useState<{ siteKey: string; secretKey: string } | string | null>(null)
  // Modal "Marcar pagado" (pilot Avellaneda, transferencia — ver
  // /api/superadmin/mark-plan-paid)
  const [payTarget, setPayTarget] = useState<TenantRow | null>(null)
  const [payPlan, setPayPlan] = useState<string>('standard')
  const [payTerm, setPayTerm] = useState<BillingTerm>(1)
  const [payNote, setPayNote] = useState('')
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)

  // No necesitamos BroadcastChannel — guardamos tokens antes de navegar

  async function handleRename(tenant: TenantRow) {
    if (!editName.trim() || editName.trim() === tenant.name) {
      setEditingId(null)
      return
    }
    setSavingId(tenant.id)
    const res = await fetch('/api/superadmin/update-tenant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: tenant.id, name: editName.trim() }),
    })
    if (res.ok) {
      setTenants(prev => prev.map(t => t.id === tenant.id ? { ...t, name: editName.trim() } : t))
    }
    setSavingId(null)
    setEditingId(null)
  }

  async function handleImpersonate(tenant: TenantRow) {
    if (!tenant.ownerEmail) return
    setImpersonatingId(tenant.id)

    // Guardar tokens del superadmin ANTES de navegar (en la misma tab)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      sessionStorage.setItem('superadmin_tokens', JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }))
    }

    const res = await fetch('/api/superadmin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantOwnerEmail: tenant.ownerEmail }),
    })
    const data = await res.json()
    setImpersonatingId(null)
    if (data.url) {
      // Navegar en la MISMA tab — sin BroadcastChannel, sin race condition
      window.location.href = data.url
    } else {
      sessionStorage.removeItem('superadmin_tokens')
      alert('Error: ' + (data.error ?? 'No se pudo generar el link'))
    }
  }

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  function openPayModal(tenant: TenantRow) {
    setPayTarget(tenant)
    setPayPlan(tenant.plan in PLANS ? tenant.plan : 'standard')
    setPayTerm(isBillingTerm(tenant.manualPaymentTerm) ? tenant.manualPaymentTerm : 1)
    setPayNote('')
    setPayError(null)
  }

  async function handleMarkPaid() {
    if (!payTarget) return
    setPaying(true)
    setPayError(null)
    const res = await fetch('/api/superadmin/mark-plan-paid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: payTarget.id, plan: payPlan, term: payTerm, note: payNote.trim() || null }),
    })
    const data = await res.json()
    if (!res.ok || data.error) {
      setPayError(data.error ?? 'No se pudo marcar como pagado')
      setPaying(false)
      return
    }
    setTenants(prev => prev.map(t => t.id === payTarget.id
      ? {
          ...t,
          plan: payPlan,
          planStatus: 'active',
          status: 'active',
          debe: false,
          manualPaymentNote: payNote.trim() || null,
          manualPaymentTerm: payTerm,
          manualPaymentAmount: data.amount ?? null,
          manualPaidUntil: data.paidUntil ?? null,
        }
      : t
    ))
    setPaying(false)
    setPayTarget(null)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeletingId(deleteTarget.id)
    const res = await fetch('/api/superadmin/delete-tenant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: deleteTarget.id }),
    })
    if (res.ok) {
      setTenants(prev => prev.filter(t => t.id !== deleteTarget.id))
    } else {
      const data = await res.json()
      alert('Error: ' + (data.error ?? 'No se pudo borrar'))
    }
    setDeletingId(null)
    setDeleteTarget(null)
    setDeleteConfirmText('')
  }

  async function handleBackfillDomains() {
    setBackfilling(true)
    setBackfillResult(null)
    try {
      const res = await fetch('/api/superadmin/backfill-slug-domains', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido')
      const fallidosMsg = data.fallidos.length
        ? ` (${data.fallidos.length} fallaron: ${data.fallidos.map((f: { tenant: string }) => f.tenant).join(', ')})`
        : ''
      setBackfillResult(`${data.exitosos}/${data.total} dominios .gounuri.com dados de alta.${fallidosMsg}`)
    } catch (e) {
      setBackfillResult('Error: ' + (e instanceof Error ? e.message : 'no se pudo correr el backfill'))
    }
    setBackfilling(false)
  }

  async function handleCreateDefaultWidget() {
    setCreatingWidget(true)
    setWidgetResult(null)
    try {
      const res = await fetch('/api/superadmin/create-default-turnstile-widget', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido')
      setWidgetResult({ siteKey: data.siteKey, secretKey: data.secretKey })
    } catch (e) {
      setWidgetResult('Error: ' + (e instanceof Error ? e.message : 'no se pudo crear el widget'))
    }
    setCreatingWidget(false)
  }

  const totalVisits = tenants.reduce((sum, t) => sum + t.visitCount, 0)
  const totalOrders = tenants.reduce((sum, t) => sum + t.orderCount, 0)
  const ga4LinkedCount = tenants.filter(t => t.ga4Linked).length

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Tenants</h1>
          <p className="text-sm text-zinc-400 mt-1">{tenants.length} tiendas registradas</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleBackfillDomains}
            disabled={backfilling}
            title="Da de alta {slug}.gounuri.com en Vercel para los tenants que se crearon antes del fix del 2026-08-12"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 text-xs transition-colors disabled:opacity-50"
          >
            <Wrench size={13} />
            {backfilling ? 'Reparando...' : 'Reparar dominios .gounuri.com'}
          </button>
          <button
            type="button"
            onClick={handleCreateDefaultWidget}
            disabled={creatingWidget}
            title="Crea el widget de Turnstile que cubre *.gounuri.com (fallback para tenants sin dominio propio) — solo hace falta correrlo una vez"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 text-xs transition-colors disabled:opacity-50"
          >
            <Wrench size={13} />
            {creatingWidget ? 'Creando...' : 'Crear widget Turnstile default'}
          </button>
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 text-xs transition-colors"
            >
              <LogOut size={13} />
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>

      {backfillResult && (
        <div className="mb-6 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-xs text-zinc-300">
          {backfillResult}
        </div>
      )}

      {widgetResult && (
        <div className="mb-6 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-xs text-zinc-300 space-y-2">
          {typeof widgetResult === 'string' ? (
            widgetResult
          ) : (
            <>
              <p className="text-zinc-400">
                Widget creado. Pegá esto en Vercel → gounuri-web y en cada tienda-* (Settings → Environment Variables):
              </p>
              <p className="font-mono break-all">NEXT_PUBLIC_TURNSTILE_SITE_KEY={widgetResult.siteKey}</p>
              <p className="font-mono break-all">TURNSTILE_SECRET_KEY={widgetResult.secretKey}</p>
            </>
          )}
        </div>
      )}

      {/* Resumen agregado — todos los tenants, sin importar su plan */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500">Tiendas activas</p>
          <p className="text-xl font-semibold text-zinc-100 mt-1">
            {tenants.filter(t => t.status === 'active').length}
            <span className="text-sm font-normal text-zinc-500"> / {tenants.length}</span>
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500 flex items-center gap-1"><Eye size={11} /> Visitas este mes</p>
          <p className="text-xl font-semibold text-zinc-100 mt-1">{totalVisits.toLocaleString('es-AR')}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500 flex items-center gap-1"><ShoppingBag size={11} /> Pedidos este mes</p>
          <p className="text-xl font-semibold text-zinc-100 mt-1">{totalOrders.toLocaleString('es-AR')}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500 flex items-center gap-1"><BarChart3 size={11} /> Con Google Analytics</p>
          <p className="text-xl font-semibold text-zinc-100 mt-1">
            {ga4LinkedCount}
            <span className="text-sm font-normal text-zinc-500"> / {tenants.length}</span>
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900">
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Tienda</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Template</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Estado</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Plan</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Deuda</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Dominio / URL</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Owner</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Visitas / Pedidos</th>
              {/* Uso real vs. límite del plan (2026-08-18) — ver comentario en
                  superadmin/page.tsx. Antes esto solo lo veía cada tenant en
                  su propio "Plan y uso"; ahora vive acá para poder calibrar
                  los límites de los planes con datos de todos juntos. */}
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Uso (storage / productos)</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Google Analytics</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {tenants.map(tenant => (
              <tr key={tenant.id} className="bg-zinc-950 hover:bg-zinc-900 transition-colors">

                {/* Nombre editable */}
                <td className="px-5 py-4">
                  {editingId === tenant.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRename(tenant)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        className="bg-zinc-800 border border-zinc-600 rounded-lg px-2 py-1 text-sm text-zinc-100 w-36 focus:outline-none focus:border-primary-500"
                      />
                      <button
                        onClick={() => handleRename(tenant)}
                        disabled={!!savingId}
                        className="text-emerald-400 hover:text-emerald-300"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-zinc-500 hover:text-zinc-300"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group">
                      <span className="font-medium text-zinc-100">{tenant.name}</span>
                      <button
                        onClick={() => { setEditingId(tenant.id); setEditName(tenant.name) }}
                        className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 transition-opacity"
                      >
                        <Pencil size={12} />
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-zinc-500 mt-0.5 font-mono">{tenant.slug}</p>
                </td>

                {/* Template */}
                <td className="px-5 py-4">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TEMPLATE_COLORS[tenant.template] ?? 'bg-zinc-800 text-zinc-300'}`}>
                    {TEMPLATE_LABELS[tenant.template] ?? tenant.template}
                  </span>
                </td>

                {/* Estado */}
                <td className="px-5 py-4">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[tenant.status] ?? 'bg-zinc-800 text-zinc-400'}`}>
                    {tenant.status}
                  </span>
                </td>

                {/* Plan + estado (trial/activo/etc.) — el estado es el que
                    define si el cron de enforce puede llegar a suspender la
                    tienda; el badge de Plan solo dice qué plan tiene. */}
                <td className="px-5 py-4">
                  <div className="flex flex-col gap-1 items-start">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PLAN_COLORS[tenant.plan] ?? 'bg-zinc-800 text-zinc-400'}`}>
                      {PLAN_LABELS[tenant.plan] ?? tenant.plan}
                    </span>
                    {tenant.planStatus && (
                      <span
                        title={tenant.manualPaidUntil
                          ? [
                              tenant.manualPaymentNote ? `Pago manual: ${tenant.manualPaymentNote}` : 'Pago manual',
                              tenant.manualPaymentTerm ? `${tenant.manualPaymentTerm} ${tenant.manualPaymentTerm === 1 ? 'mes' : 'meses'}` : null,
                              `vence ${new Date(tenant.manualPaidUntil).toLocaleDateString('es-AR')}`,
                              tenant.manualPaymentBy ? `marcado por ${tenant.manualPaymentBy}` : null,
                            ].filter(Boolean).join(' · ')
                          : undefined}
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PLAN_STATUS_COLORS[tenant.planStatus] ?? 'bg-zinc-800 text-zinc-500'} ${tenant.manualPaidUntil ? 'cursor-help' : ''}`}
                      >
                        {PLAN_STATUS_LABELS[tenant.planStatus] ?? tenant.planStatus}
                      </span>
                    )}
                    {/* Días para renovar — trial o pago manual, lo que aplique */}
                    {tenant.planStatus === 'trial' && tenant.trialEndsAt && (
                      <span className={`text-[10px] ${colorDiasRestantes(tenant.trialEndsAt)}`}>
                        {textoDiasRestantes(tenant.trialEndsAt)}
                      </span>
                    )}
                    {tenant.planStatus === 'active' && tenant.manualPaidUntil && (
                      <span className={`text-[10px] ${colorDiasRestantes(tenant.manualPaidUntil)}`}>
                        {textoDiasRestantes(tenant.manualPaidUntil)}
                      </span>
                    )}
                  </div>
                </td>

                {/* Deuda */}
                <td className="px-5 py-4">
                  {tenant.debe ? (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-950 text-red-400">
                      Debe
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-600">—</span>
                  )}
                </td>

                {/* Dominio */}
                <td className="px-5 py-4">
                  {tenant.domain ? (
                    <div className="flex items-center gap-1.5">
                      <Globe size={12} className="text-zinc-500 flex-shrink-0" />
                      <span className="text-zinc-300 text-xs font-mono">{tenant.domain}</span>
                    </div>
                  ) : tenant.frontendUrl ? (
                    <span className="text-zinc-500 text-xs font-mono">{tenant.frontendUrl.replace('https://', '')}</span>
                  ) : (
                    <span className="text-zinc-600 text-xs">Sin configurar</span>
                  )}
                </td>

                {/* Owner — nombre + email; DNI/celular en el tooltip del ícono
                    para no ensanchar la tabla con columnas sueltas. */}
                <td className="px-5 py-4">
                  {tenant.ownerNombre ? (
                    <div className="flex items-center gap-1.5">
                      <div>
                        <p className="text-zinc-200 text-xs font-medium">
                          {tenant.ownerNombre} {tenant.ownerApellido}
                        </p>
                        <p className="text-zinc-500 text-xs">{tenant.ownerEmail}</p>
                      </div>
                      {(tenant.ownerDni || tenant.ownerCelular) && (
                        <span
                          title={[
                            tenant.ownerDni ? `DNI: ${tenant.ownerDni}` : null,
                            tenant.ownerCelular ? `Cel: ${tenant.ownerCelular}` : null,
                          ].filter(Boolean).join(' · ')}
                          className="shrink-0 text-zinc-600 hover:text-zinc-300 cursor-help"
                        >
                          <Info size={13} />
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-zinc-400 text-xs">{tenant.ownerEmail ?? '—'}</span>
                  )}
                </td>

                {/* Visitas / Pedidos — mismos números que "Plan y uso" del tenant,
                    acá visibles sin importar el plan que tenga contratado */}
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3 text-xs text-zinc-400">
                    <span className="flex items-center gap-1" title="Visitas este mes">
                      <Eye size={12} className="text-zinc-500" />
                      {tenant.visitCount.toLocaleString('es-AR')}
                    </span>
                    <span className="flex items-center gap-1" title="Pedidos este mes">
                      <ShoppingBag size={12} className="text-zinc-500" />
                      {tenant.orderCount.toLocaleString('es-AR')}
                    </span>
                  </div>
                </td>

                {/* Uso vs. límite del plan (2026-08-18) — ver comentario del
                    header. pct >= 100 en rojo, >= 80 en ámbar, igual que
                    src/lib/usage.ts para que el criterio sea el mismo que ya
                    usa cada tenant (cuando lo veía en su propio panel). */}
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1" title={`Almacenamiento: ${formatStorage(tenant.storageMB)} / ${formatStorage(tenant.storageLimitMB)}`}>
                      <HardDrive size={12} className="text-zinc-500" />
                      {tenant.storageAvailable ? (
                        <span className={usageColor((tenant.storageMB / tenant.storageLimitMB) * 100)}>
                          {formatStorage(tenant.storageMB)}
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </span>
                    <span className="flex items-center gap-1" title={`Productos: ${tenant.productCount} / ${tenant.productLimit}`}>
                      <Shirt size={12} className="text-zinc-500" />
                      <span className={usageColor((tenant.productCount / tenant.productLimit) * 100)}>
                        {tenant.productCount}/{tenant.productLimit}
                      </span>
                    </span>
                  </div>
                </td>

                {/* Google Analytics — vinculado o no, independiente de si el
                    plan del tenant le da acceso a esta sección en su panel */}
                <td className="px-5 py-4">
                  {tenant.ga4Linked ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-300">
                      <BarChart3 size={11} /> Vinculado
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-600">Sin vincular</span>
                  )}
                </td>

                {/* Acciones */}
                <td className="px-5 py-4">
                  <div className="flex items-center justify-end gap-2">
                    {/* Ver tienda */}
                    {(tenant.domain || tenant.frontendUrl) && (
                      <a
                        href={tenant.domain ? `https://${tenant.domain}` : tenant.frontendUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Ver tienda"
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}

                    {/* Copiar link Panel Admin */}
                    <button
                      onClick={() => copyToClipboard(PANEL_URL, tenant.id + '-panel')}
                      title="Copiar link Panel Admin"
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                    >
                      {copiedId === tenant.id + '-panel'
                        ? <Check size={14} className="text-emerald-400" />
                        : <Copy size={14} />
                      }
                    </button>

                    {/* Acceder como */}
                    {tenant.ownerEmail && (
                      <button
                        onClick={() => handleImpersonate(tenant)}
                        disabled={impersonatingId === tenant.id}
                        title={`Acceder como ${tenant.ownerEmail}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        <LogIn size={13} />
                        {impersonatingId === tenant.id ? 'Generando...' : 'Acceder'}
                      </button>
                    )}

                    {/* Marcar pagado — pilot Avellaneda (transferencia, sin
                        Mercado Pago), ver /api/superadmin/mark-plan-paid */}
                    <button
                      onClick={() => openPayModal(tenant)}
                      title="Marcar como pagado (transferencia)"
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-emerald-400 hover:bg-emerald-950 transition-colors"
                    >
                      <HandCoins size={14} />
                    </button>

                    {/* Borrar tenant */}
                    <button
                      onClick={() => { setDeleteTarget(tenant); setDeleteConfirmText('') }}
                      title="Borrar tienda"
                      className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-950 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {tenants.length === 0 && (
          <div className="text-center py-16 text-zinc-500 text-sm">
            No hay tenants registrados
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-zinc-600">
        "Acceder" navega al Panel Admin logueado como el owner del tenant.
        Usa el botón "Volver al Superadmin" del sidebar para regresar a tu sesión.
      </p>

      {/* Modal confirmación borrar */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-950 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={18} className="text-red-400" />
              </div>
              <div>
                <h2 className="text-zinc-100 font-semibold text-base">Borrar tienda</h2>
                <p className="text-zinc-400 text-sm">Esta acción es irreversible</p>
              </div>
            </div>

            <p className="text-zinc-300 text-sm mb-2">
              Se van a eliminar permanentemente todos los datos de{' '}
              <span className="font-semibold text-white">{deleteTarget.name}</span>:
              productos, pedidos, clientes, imágenes y configuración.
            </p>

            <p className="text-zinc-400 text-xs mb-4">
              Para confirmar, escribí el slug de la tienda:{' '}
              <span className="font-mono text-red-400">{deleteTarget.slug}</span>
            </p>

            <input
              type="text"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder={deleteTarget.slug}
              className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-red-500 mb-4"
            />

            <div className="flex gap-3">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteConfirmText('') }}
                className="flex-1 px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 text-sm transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteConfirmText !== deleteTarget.slug || !!deletingId}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deletingId ? 'Borrando...' : 'Borrar para siempre'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal "Marcar pagado" — pilot Avellaneda: transferencia por fuera de
          Mercado Pago, así que nunca pasa por billing/webhook. Confirmar acá
          hace lo mismo que ese webhook cuando MP autoriza un pago (ver
          /api/superadmin/mark-plan-paid). */}
      {payTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-emerald-950 flex items-center justify-center flex-shrink-0">
                <HandCoins size={18} className="text-emerald-400" />
              </div>
              <div>
                <h2 className="text-zinc-100 font-semibold text-base">Marcar como pagado</h2>
                <p className="text-zinc-400 text-sm">{payTarget.name}</p>
              </div>
            </div>

            <p className="text-zinc-400 text-xs mb-4">
              Saca a la tienda del trial/gracia (plan_status pasa a "active") y la reactiva
              si estaba suspendida por eso. Usalo después de confirmar la transferencia.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Plan</label>
                <select
                  value={payPlan}
                  onChange={e => setPayPlan(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500"
                >
                  {Object.values(PLANS).filter(p => p.id !== 'free').map(p => (
                    <option key={p.id} value={p.id}>{p.nombre} (${p.precioARS.toLocaleString('es-AR')}/mes)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Plazo</label>
                <select
                  value={payTerm}
                  onChange={e => setPayTerm(Number(e.target.value) as BillingTerm)}
                  className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500"
                >
                  {([1, 6, 12] as BillingTerm[]).map(months => (
                    <option key={months} value={months}>
                      {months === 1 ? '1 mes' : `${months} meses`}
                      {TERM_DISCOUNTS[months] > 0 ? ` (-${TERM_DISCOUNTS[months] * 100}%)` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Precio del plazo elegido, mismo cálculo que el checkout de MP
                (priceForTerm) — así el número que ve David acá es el mismo
                que le cobraría a un tenant que paga self-serve. */}
            <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-xs text-zinc-400">
              Total del plazo: <span className="text-zinc-100 font-semibold">
                ${priceForTerm(getPlanForTenant(payPlan), payTerm).toLocaleString('es-AR')}
              </span>
              {TERM_DISCOUNTS[payTerm] > 0 && (
                <span className="text-emerald-400"> (incluye {TERM_DISCOUNTS[payTerm] * 100}% off)</span>
              )}
              <span className="text-zinc-600"> · vence el {addMonthsLabel(payTerm)}</span>
            </div>

            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Nota <span className="text-zinc-600 font-normal">(opcional — para no perder el rastro de quién pagó qué)</span>
            </label>
            <textarea
              value={payNote}
              onChange={e => setPayNote(e.target.value)}
              placeholder="Ej: Transferencia por WhatsApp - Nequén - 19/8/2026"
              rows={2}
              className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 mb-4 resize-none"
            />

            {payError && (
              <div className="mb-4 rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-400">
                {payError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setPayTarget(null)}
                disabled={paying}
                className="flex-1 px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 text-sm transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleMarkPaid}
                disabled={paying}
                className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {paying ? 'Guardando...' : 'Confirmar pago'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { UploadCloud, FileText, Loader2, PlayCircle, CheckCircle2, XCircle } from 'lucide-react'

export interface TenantOption { id: string; name: string; slug: string; template: string | null }
export interface ImportJobRow {
  id: string
  tenantId: string
  tenantName: string
  status: string
  imageQuality: string
  stockMode: string
  totalProducts: number
  processedProducts: number
  productsCreated: number
  productsSkipped: number
  imagesUploaded: number
  imagesFailed: number
  createdAt: string
  csvFilename: string | null
}

interface LogLine { id?: number; level: 'info' | 'warn' | 'error'; message: string; created_at?: string }

interface JobState {
  id: string
  status: string
  total_products: number
  processed_products: number
  products_created: number
  products_skipped: number
  variants_created: number
  images_uploaded: number
  images_failed: number
  error: string | null
}

const QUALITY_OPTIONS: { value: 'alta' | 'estandar' | 'baja'; label: string; hint: string }[] = [
  { value: 'alta', label: 'Alta', hint: 'más nítida, pesa más' },
  { value: 'estandar', label: 'Estándar', hint: 'recomendada' },
  { value: 'baja', label: 'Baja', hint: 'más liviana' },
]

function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)) }

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    queued: 'bg-zinc-100 text-zinc-600',
    processing: 'bg-amber-50 text-amber-700',
    done: 'bg-emerald-50 text-emerald-700',
    failed: 'bg-red-50 text-red-700',
    cancelled: 'bg-zinc-100 text-zinc-500',
  }
  const label: Record<string, string> = {
    queued: 'En cola', processing: 'Importando', done: 'Completo', failed: 'Error', cancelled: 'Cancelado',
  }
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${map[status] ?? 'bg-zinc-100 text-zinc-600'}`}>{label[status] ?? status}</span>
}

export default function ImportadorClient({ tenants, recentJobs }: { tenants: TenantOption[]; recentJobs: ImportJobRow[] }) {
  const [tenantId, setTenantId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [imageQuality, setImageQuality] = useState<'alta' | 'estandar' | 'baja'>('estandar')
  const [stockZero, setStockZero] = useState(false)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [jobState, setJobState] = useState<JobState | null>(null)
  const [logs, setLogs] = useState<LogLine[]>([])
  const [running, setRunning] = useState(false)
  const runTokenRef = useRef(0)
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'end' })
  }, [logs])

  const runLoop = useCallback(async (jobId: string) => {
    const myToken = ++runTokenRef.current
    setRunning(true)
    for (;;) {
      if (runTokenRef.current !== myToken) return // se arrancó otro job en el medio
      let res: Response
      try {
        res = await fetch(`/api/superadmin/importador/${jobId}/step`, { method: 'POST' })
      } catch (e: any) {
        setLogs(prev => [...prev, { level: 'error', message: `Error de red: ${e?.message ?? e} — reintentando en 3s` }])
        await sleep(3000)
        continue
      }
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.job) {
        setLogs(prev => [...prev, { level: 'error', message: data?.error ?? `Error del servidor (${res.status})` }])
        setRunning(false)
        return
      }
      setJobState(data.job)
      if (data.new_logs?.length) setLogs(prev => [...prev, ...data.new_logs])
      if (['done', 'failed', 'cancelled'].includes(data.job.status)) {
        setRunning(false)
        return
      }
      await sleep(600)
    }
  }, [])

  async function handleStart() {
    if (!file || !tenantId) return
    setStarting(true)
    setStartError(null)
    setLogs([])
    setJobState(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('tenant_id', tenantId)
      form.append('image_quality', imageQuality)
      form.append('stock_mode', stockZero ? 'zero' : 'csv')
      const res = await fetch('/api/superadmin/importador/start', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) { setStartError(data.error ?? 'No se pudo iniciar la importación'); return }
      setActiveJobId(data.job_id)
      runLoop(data.job_id)
    } catch (e: any) {
      setStartError('Error de red: ' + e.message)
    } finally {
      setStarting(false)
    }
  }

  function handleContinue(jobId: string) {
    setActiveJobId(jobId)
    setLogs([])
    setJobState(null)
    runLoop(jobId)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const dropped = e.dataTransfer.files?.[0]
    if (dropped && (dropped.name.endsWith('.csv') || dropped.type.includes('csv'))) setFile(dropped)
  }

  const progressPct = jobState && jobState.total_products > 0
    ? Math.round((jobState.processed_products / jobState.total_products) * 100)
    : 0

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold text-zinc-100 mb-1">Importador CSV</h1>
      <p className="text-sm text-zinc-400 mb-6">
        Subí un CSV exportado de WooCommerce (mismas columnas que ya migramos a mano — Nombre, Tipo, SKU, Categorías,
        Imágenes, atributos de color/talle) y elegí a qué tienda va. Las imágenes se descargan, se procesan con la
        calidad elegida y se re-alojan en el storage propio — nunca quedan apuntando al hosting viejo.
      </p>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-8">
        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Tienda destino</label>
            <select
              value={tenantId}
              onChange={e => setTenantId(e.target.value)}
              disabled={running}
              className="w-full text-sm px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100"
            >
              <option value="">Elegir tienda...</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.slug}{t.template ? ` — ${t.template}` : ''})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Calidad de imagen</label>
            <div className="flex gap-2">
              {QUALITY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={running}
                  onClick={() => setImageQuality(opt.value)}
                  title={opt.hint}
                  className={`flex-1 text-xs px-2 py-2 rounded-lg border transition-colors ${
                    imageQuality === opt.value
                      ? 'bg-primary-600 border-primary-600 text-white'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2 mb-4 text-sm text-zinc-300 cursor-pointer">
          <input type="checkbox" checked={stockZero} disabled={running} onChange={e => setStockZero(e.target.checked)} className="rounded" />
          Normalizar todo el stock a 0 (en vez de usar el stock que trae el CSV)
        </label>

        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={`rounded-xl border-2 border-dashed px-5 py-8 text-center transition-colors mb-4 ${
            isDragging ? 'border-primary-500 bg-primary-500/5' : 'border-zinc-700'
          }`}
        >
          {file ? (
            <div className="flex items-center justify-center gap-2 text-sm text-zinc-200">
              <FileText size={16} className="text-primary-400" />
              {file.name}
              <button onClick={() => setFile(null)} disabled={running} className="text-zinc-500 hover:text-zinc-300 text-xs ml-2 underline">
                quitar
              </button>
            </div>
          ) : (
            <>
              <UploadCloud className="mx-auto mb-2 text-zinc-500" size={28} />
              <p className="text-sm text-zinc-400">
                Arrastrá el CSV acá, o{' '}
                <label className="text-primary-400 hover:text-primary-300 underline cursor-pointer">
                  elegilo
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
                </label>
              </p>
            </>
          )}
        </div>

        {startError && (
          <div className="mb-4 text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">{startError}</div>
        )}

        <button
          onClick={handleStart}
          disabled={!file || !tenantId || starting || running}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {starting ? <Loader2 size={15} className="animate-spin" /> : <PlayCircle size={15} />}
          Iniciar importación
        </button>
      </div>

      {(activeJobId || logs.length > 0) && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm text-zinc-200">
              {jobState?.status === 'done' && <CheckCircle2 size={16} className="text-emerald-400" />}
              {jobState?.status === 'failed' && <XCircle size={16} className="text-red-400" />}
              {running && <Loader2 size={15} className="animate-spin text-amber-400" />}
              <span>
                {jobState ? `${jobState.processed_products} / ${jobState.total_products} productos` : 'Iniciando...'}
              </span>
            </div>
            {jobState && <StatusBadge status={jobState.status} />}
          </div>

          <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden mb-4">
            <div className="h-full bg-primary-600 transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>

          {jobState && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-xs">
              <div className="bg-zinc-950 rounded-lg px-3 py-2">
                <p className="text-zinc-500">Creados</p>
                <p className="text-zinc-100 font-semibold">{jobState.products_created}</p>
              </div>
              <div className="bg-zinc-950 rounded-lg px-3 py-2">
                <p className="text-zinc-500">Ya existían</p>
                <p className="text-zinc-100 font-semibold">{jobState.products_skipped}</p>
              </div>
              <div className="bg-zinc-950 rounded-lg px-3 py-2">
                <p className="text-zinc-500">Imágenes OK</p>
                <p className="text-zinc-100 font-semibold">{jobState.images_uploaded}</p>
              </div>
              <div className="bg-zinc-950 rounded-lg px-3 py-2">
                <p className="text-zinc-500">Imágenes falladas</p>
                <p className={jobState.images_failed > 0 ? 'text-amber-400 font-semibold' : 'text-zinc-100 font-semibold'}>{jobState.images_failed}</p>
              </div>
            </div>
          )}

          {/* Mini terminal: log crudo línea por línea, así se ve en vivo cuándo se está subiendo cada imagen */}
          <div className="bg-black rounded-lg border border-zinc-800 px-3 py-2 h-64 overflow-y-auto font-mono text-[11px] leading-relaxed">
            {logs.map((l, i) => (
              <div key={l.id ?? i} className={l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-amber-400' : 'text-zinc-400'}>
                <span className="text-zinc-600">$ </span>{l.message}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      <h2 className="text-sm font-semibold text-zinc-300 mb-2">Importaciones recientes</h2>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500">
              <th className="text-left px-3 py-2 font-medium">Tienda</th>
              <th className="text-left px-3 py-2 font-medium">Archivo</th>
              <th className="text-left px-3 py-2 font-medium">Estado</th>
              <th className="text-left px-3 py-2 font-medium">Progreso</th>
              <th className="text-left px-3 py-2 font-medium">Fecha</th>
              <th className="text-left px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {recentJobs.map(j => (
              <tr key={j.id} className="border-b border-zinc-850 border-zinc-800/60">
                <td className="px-3 py-2 text-zinc-200">{j.tenantName}</td>
                <td className="px-3 py-2 text-zinc-400">{j.csvFilename ?? '—'}</td>
                <td className="px-3 py-2"><StatusBadge status={j.status} /></td>
                <td className="px-3 py-2 text-zinc-400">{j.processedProducts}/{j.totalProducts}</td>
                <td className="px-3 py-2 text-zinc-500">{new Date(j.createdAt).toLocaleString('es-AR')}</td>
                <td className="px-3 py-2">
                  {(j.status === 'queued' || j.status === 'processing') && j.id !== activeJobId && (
                    <button onClick={() => handleContinue(j.id)} className="text-primary-400 hover:text-primary-300 text-xs underline">
                      Continuar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {recentJobs.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-zinc-500">Todavía no hay importaciones.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

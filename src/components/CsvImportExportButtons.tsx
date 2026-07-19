'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Upload, Loader2 } from 'lucide-react'

interface ImportResult {
  ok?: boolean
  error?: string
  errors?: string[]
  [key: string]: any
}

interface Props {
  exportUrl: string
  importUrl: string
  /** Ej: "productos", "clientes" — solo para textos/labels. */
  entityLabel: string
}

export default function CsvImportExportButtons({ exportUrl, importUrl, entityLabel }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setImporting(true)
    setResult(null)
    try {
      const text = await file.text()
      const res = await fetch(importUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv; charset=utf-8' },
        body: text,
      })
      const data = await res.json()
      if (!res.ok) {
        setResult({ error: data.error ?? 'No se pudo importar el CSV' })
        return
      }
      setResult(data)
      router.refresh()
    } catch (err: any) {
      setResult({ error: err.message ?? 'Error de red' })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <a
        href={exportUrl}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-xs text-zinc-600 hover:border-zinc-400 transition-colors"
      >
        <Download size={13} /> Exportar CSV
      </a>

      <button
        onClick={() => fileRef.current?.click()}
        disabled={importing}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-xs text-zinc-600 hover:border-zinc-400 transition-colors disabled:opacity-50"
      >
        {importing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
        {importing ? 'Importando...' : 'Importar CSV'}
      </button>
      <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileSelected} />

      {result && (
        <div className="absolute mt-24 right-8 z-20 w-96 bg-white border border-zinc-200 rounded-xl shadow-lg p-4 text-xs">
          {result.error ? (
            <p className="text-red-600">{result.error}</p>
          ) : (
            <div className="space-y-1.5">
              <p className="text-emerald-600 font-medium">Importación de {entityLabel} completa</p>
              <ul className="text-zinc-600 space-y-0.5">
                {Object.entries(result)
                  .filter(([k]) => !['ok', 'errors', 'error'].includes(k))
                  .map(([k, v]) => (
                    <li key={k}>{k}: <span className="font-medium text-zinc-800">{String(v)}</span></li>
                  ))}
              </ul>
              {result.errors && result.errors.length > 0 && (
                <div className="pt-2 border-t border-zinc-100 mt-2">
                  <p className="text-amber-600 font-medium mb-1">{result.errors.length} filas con problemas:</p>
                  <ul className="text-zinc-500 max-h-32 overflow-y-auto space-y-0.5">
                    {result.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
              <button onClick={() => setResult(null)} className="text-zinc-400 hover:text-zinc-600 mt-2">Cerrar</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

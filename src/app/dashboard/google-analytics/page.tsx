'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTutorial, type TutorialStep } from '@/components/tutorial/TutorialProvider'
import TutorialHint from '@/components/tutorial/TutorialHint'
import PageTutorialButton from '@/components/tutorial/PageTutorialButton'
import { ExternalLink } from 'lucide-react'

const MEASUREMENT_ID_RE = /^G-[A-Z0-9]+$/

const GA_STEPS: TutorialStep[] = [
  {
    id: 'ga-link',
    target: '[data-tutorial="ga-link"]',
    title: 'Vincular Google Analytics',
    content: 'Pegá acá el Measurement ID (empieza con "G-") de tu propia cuenta de Google Analytics 4. Así activás el seguimiento real de visitas en tu tienda pública.',
  },
  {
    id: 'ga-why-diff',
    target: '[data-tutorial="ga-why-diff"]',
    title: 'Diferencias con "Plan y uso"',
    content: 'Es normal y esperable que los números de Google Analytics no coincidan con "Visitas" de Plan y uso — miden cosas distintas.',
  },
]

export default function GoogleAnalyticsPage() {
  const supabase = createClient()
  const { registerSteps } = useTutorial()

  useEffect(() => {
    registerSteps('google-analytics', GA_STEPS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [configId, setConfigId] = useState<string | null>(null)
  const [measurementId, setMeasurementId] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: _userRows } = await supabase.from('users').select('tenant_id').eq('id', user.id).limit(1)
      const userRow = _userRows?.[0]
      if (!userRow) return

      const { data: config } = await supabase
        .from('store_config')
        .select('id, ga4_measurement_id')
        .eq('tenant_id', userRow.tenant_id)
        .single()

      if (config) {
        setConfigId(config.id)
        setMeasurementId((config as any).ga4_measurement_id ?? '')
      }
    }
    load()
  }, [])

  async function handleSave() {
    if (!configId) return
    const trimmed = measurementId.trim()
    if (trimmed && !MEASUREMENT_ID_RE.test(trimmed)) {
      setErrorGeneral('El Measurement ID no tiene un formato válido. Tiene que empezar con "G-" (ejemplo: G-ABC1234XYZ).')
      return
    }
    setSaving(true)
    setErrorGeneral(null)
    const { error } = await supabase.from('store_config').update({
      ga4_measurement_id: trimmed || null,
    }).eq('id', configId)
    setSaving(false)
    if (error) {
      console.error('Error guardando Google Analytics:', error)
      setErrorGeneral(error.message || 'No se pudo guardar. Reintentá o contactá a soporte.')
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <div className="sticky top-0 z-10 px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Google Analytics</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Conectá tu tienda con tu propia cuenta de Google Analytics 4</p>
          <PageTutorialButton pageKey="google-analytics" />
        </div>
        <div className="flex flex-col items-end gap-1">
          <button onClick={handleSave} disabled={saving || !configId} className="btn-primary disabled:opacity-60">
            {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
          {errorGeneral && <p className="text-xs text-red-600 max-w-xs text-right">{errorGeneral}</p>}
        </div>
      </div>

      <div className="px-8 py-6 max-w-2xl space-y-5">

        {/* Vincular */}
        <div data-tutorial="ga-link" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold text-zinc-700">Measurement ID</h2>
            <TutorialHint pageKey="google-analytics" step={GA_STEPS[0]} />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">Measurement ID (G-XXXXXXXXXX)</label>
            <input
              className="input text-sm font-mono"
              value={measurementId}
              onChange={e => setMeasurementId(e.target.value)}
              placeholder="G-ABC1234XYZ"
            />
            <p className="text-xs text-zinc-400 mt-1">
              Dejalo vacío para desactivar el seguimiento en tu tienda pública.
            </p>
          </div>

          <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-4 space-y-2">
            <p className="text-xs font-medium text-zinc-600">Cómo conseguirlo</p>
            <ol className="text-xs text-zinc-500 space-y-1.5 list-decimal list-inside">
              <li>
                Entrá a{' '}
                <a
                  href="https://analytics.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline inline-flex items-center gap-0.5"
                >
                  analytics.google.com <ExternalLink className="h-3 w-3" />
                </a>{' '}
                con tu propia cuenta de Gmail (no la de Gounuri) — así los datos de tu tienda quedan siempre de tu propiedad.
              </li>
              <li>Creá una propiedad GA4 nueva con el nombre de tu tienda.</li>
              <li>En Administración → Flujos de datos, agregá un flujo web con la URL de tu tienda.</li>
              <li>Copiá el "ID de medición" (empieza con "G-") y pegalo arriba.</li>
            </ol>
          </div>
        </div>

        {/* Por qué difieren las estadísticas */}
        <div data-tutorial="ga-why-diff" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-2">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold text-zinc-700">¿Por qué mis números no van a coincidir con "Plan y uso"?</h2>
            <TutorialHint pageKey="google-analytics" step={GA_STEPS[1]} />
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Es normal ver números distintos entre "Visitas" (en Plan y uso) y Google Analytics — miden cosas distintas, ninguna de las dos está "mal":
          </p>
          <ul className="text-xs text-zinc-500 space-y-1.5 list-disc list-inside">
            <li>
              <strong className="text-zinc-600">Visitas (Plan y uso)</strong> cuenta cada pedido al servidor: páginas, imágenes, hojas de estilo,
              y también bots, buscadores y rastreadores. Es un número de infraestructura, no de personas reales.
            </li>
            <li>
              <strong className="text-zinc-600">Google Analytics</strong> solo cuenta cuando el navegador de una persona real ejecuta el script
              de seguimiento — filtra bots automáticamente y te da sesiones, origen del tráfico y comportamiento de compra.
            </li>
          </ul>
          <p className="text-xs text-zinc-500 leading-relaxed pt-1">
            Para decisiones de marketing y conversión, guiate por Google Analytics. "Visitas" en Plan y uso queda como referencia de consumo de tu plan.
          </p>
        </div>

      </div>
    </div>
  )
}

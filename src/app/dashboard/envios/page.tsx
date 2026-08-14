'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2 } from 'lucide-react'
import { useTutorial, type TutorialStep } from '@/components/tutorial/TutorialProvider'
import TutorialHint from '@/components/tutorial/TutorialHint'
import PageTutorialButton from '@/components/tutorial/PageTutorialButton'

// Es una sola sección dinámica (lista de métodos), no varios bloques fijos
// como en General/Pagos — un solo paso que cubre todo el feature.
const ENVIOS_STEPS: TutorialStep[] = [
  {
    id: 'envios-methods',
    target: '[data-tutorial="envios-methods"]',
    title: 'Métodos de envío',
    content: 'Agregá los métodos que tu cliente puede elegir al finalizar la compra (retiro en local, correo, moto, etc.): nombre, precio y si está activo — los inactivos no se muestran en el checkout. Marcá "A convenir" si no tenés un precio fijo (el cliente lo ve así y coordinás el costo aparte). El campo de "Transportes" es opcional, pensado para envíos tipo Expreso/Contrareembolso: cargá las empresas separadas por coma y el cliente va a poder elegir una (o escribir la suya).',
  },
]

export default function EnviosPage() {
  const supabase = createClient()
  const { registerSteps } = useTutorial()
  const [configId, setConfigId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [customShipping, setCustomShipping] = useState<{name:string;price:number;active:boolean;priceOnRequest?:boolean;carriers?:string[]}[]>([])
  const [carriersText, setCarriersText] = useState<Record<number, string>>({})

  useEffect(() => {
    registerSteps('envios', ENVIOS_STEPS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: _userRows } = await supabase.from('users').select('tenant_id').eq('id', user.id).limit(1)
      const userRow = _userRows?.[0]
      if (!userRow) return
      // Columnas explícitas, no select('*') — store_config tiene permisos
      // por columna, un select('*') devuelve 403 y esta página se queda sin
      // datos en silencio. Ver CLAUDE.md, sección de permisos de store_config.
      const { data, error } = await supabase
        .from('store_config')
        .select('id, custom_shipping')
        .eq('tenant_id', userRow.tenant_id)
        .single()
      if (error) {
        console.error('Error cargando métodos de envío:', error)
        setErrorGeneral('No se pudo cargar la configuración. Recargá la página o contactá a soporte.')
        return
      }
      setConfigId(data?.id ?? null)
      const cs = (data as any)?.custom_shipping
      setCustomShipping(cs?.length ? cs : [
        { name: 'Retiro en local', price: 0, active: true },
        { name: 'OCA', price: 0, active: true },
        { name: 'Andreani', price: 0, active: true },
        { name: 'Moto mensajería', price: 0, active: true },
        {
          name: 'Expreso / Contrareembolso', price: 0, active: true,
          carriers: ['Vía Cargo', 'Servillanita', 'Sawer', 'Pacman', 'Demonte', 'Cruz del Sur', 'Bull', 'Losa', 'Alex', 'Mostto'],
        },
      ])
    }
    load()
  }, [])

  async function handleSave() {
    if (!configId) return
    setSaving(true)
    setErrorGeneral(null)
    const { error } = await supabase.from('store_config').update({
      custom_shipping: customShipping,
    }).eq('id', configId)
    setSaving(false)
    if (error) {
      console.error('Error guardando métodos de envío:', error)
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
          <h1 className="text-xl font-semibold text-zinc-900">Envíos</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Métodos que ve el cliente al finalizar la compra</p>
          <PageTutorialButton pageKey="envios" />
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-60">
          {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        {errorGeneral && <p className="text-xs text-red-600 mt-1.5">{errorGeneral}</p>}
      </div>

      <div className="px-8 py-6 max-w-2xl space-y-5">
        <div data-tutorial="envios-methods" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-semibold text-zinc-700">Métodos de envío</h2>
                <TutorialHint pageKey="envios" step={ENVIOS_STEPS[0]} />
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">Los clientes eligen uno al finalizar la compra</p>
            </div>
            <button onClick={() => setCustomShipping(s => [...s, { name: '', price: 0, active: true }])} className="text-xs px-2.5 py-1.5 rounded-lg border border-zinc-200 text-zinc-600 hover:border-zinc-400 transition-colors flex items-center gap-1">
              <Plus size={12} /> Agregar
            </button>
          </div>
          {customShipping.length === 0 && <p className="text-xs text-zinc-400 italic">No hay métodos configurados.</p>}
          <div className="space-y-3">
            {customShipping.map((method, i) => (
              <div key={i} className="border border-zinc-100 rounded-lg p-2.5 space-y-2">
                <div className="flex items-center gap-2">
                  <input className="input text-sm flex-1" placeholder="Nombre (ej: OCA, Andreani...)" value={method.name} onChange={e => setCustomShipping(s => s.map((m, j) => j === i ? { ...m, name: e.target.value } : m))} />
                  {method.priceOnRequest ? (
                    <span className="input text-sm w-28 flex items-center justify-center text-zinc-400 italic select-none">A convenir</span>
                  ) : (
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">$</span>
                      <input type="number" min={0} className="input text-sm pl-6 w-28" placeholder="Precio" value={method.price || ''} onChange={e => setCustomShipping(s => s.map((m, j) => j === i ? { ...m, price: Number(e.target.value) } : m))} />
                    </div>
                  )}
                  <button
                    onClick={() => setCustomShipping(s => s.map((m, j) => j === i ? { ...m, priceOnRequest: !m.priceOnRequest } : m))}
                    title="El cliente no ve un precio fijo — se coordina aparte"
                    className={`text-xs px-2 py-1 rounded border transition-colors flex-shrink-0 ${method.priceOnRequest ? 'border-primary-300 text-primary-700 bg-primary-50' : 'border-zinc-200 text-zinc-400'}`}
                  >
                    A convenir
                  </button>
                  <button onClick={() => setCustomShipping(s => s.map((m, j) => j === i ? { ...m, active: !m.active } : m))} className={`text-xs px-2 py-1 rounded border transition-colors flex-shrink-0 ${method.active ? 'border-green-300 text-green-700 bg-green-50' : 'border-zinc-200 text-zinc-400'}`}>
                    {method.active ? 'Activo' : 'Inactivo'}
                  </button>
                  <button onClick={() => setCustomShipping(s => s.filter((_, j) => j !== i))} className="text-zinc-300 hover:text-red-400 flex-shrink-0"><Trash2 size={15} /></button>
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 mb-1">
                    Transportes para elegir (opcional, separados por coma — ej: para "Expreso / Contrareembolso")
                  </label>
                  <input
                    className="input text-xs w-full"
                    placeholder="Vía Cargo, Cruz del Sur, ..."
                    value={carriersText[i] ?? (method.carriers ?? []).join(', ')}
                    onChange={e => {
                      const raw = e.target.value
                      setCarriersText(t => ({ ...t, [i]: raw }))
                      const list = raw.split(',').map(c => c.trim()).filter(Boolean)
                      setCustomShipping(s => s.map((m, j) => j === i ? { ...m, carriers: list } : m))
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-400">Precio $0 para métodos gratuitos, o marcá "A convenir" si no tenés un precio fijo (el cliente lo va a ver así en el checkout y se coordina aparte). Si cargás transportes, el cliente va a poder elegir uno (o "Otro" y escribir el suyo) al seleccionar ese método. Guardá arriba para aplicar.</p>
        </div>
      </div>
    </div>
  )
}

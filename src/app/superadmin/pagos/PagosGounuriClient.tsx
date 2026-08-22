'use client'

import { useState } from 'react'
import Toggle from '@/components/Toggle'

interface Settings {
  manual_transfer_enabled: boolean
  mercadopago_enabled: boolean
  transfer_cbu: string | null
  transfer_alias: string | null
  whatsapp_number: string | null
  contact_email: string
}

const DEFAULTS: Settings = {
  manual_transfer_enabled: true,
  mercadopago_enabled: false,
  transfer_cbu: '',
  transfer_alias: '',
  whatsapp_number: '',
  contact_email: 'info@gounuri.com',
}

export default function PagosGounuriClient({ initial }: { initial: Settings | null }) {
  const [config, setConfig] = useState<Settings>(initial ?? DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof Settings>(field: K, value: Settings[K]) {
    setConfig(c => ({ ...c, [field]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/superadmin/update-billing-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl space-y-5">
      {!config.manual_transfer_enabled && !config.mercadopago_enabled && (
        <div className="rounded-lg border border-amber-800 bg-amber-950/40 px-4 py-3 text-xs text-amber-300">
          Ningún método está habilitado — en gounuri.com/perfil/plan nadie va a poder elegir un plan pago hasta que actives al menos uno.
        </div>
      )}

      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-200">Transferencia bancaria</h2>
        <ToggleRow
          label="Habilitar transferencia"
          desc="La tienda transfiere y vos confirmás el pago a mano (mismo flujo que 'Marcar como pagado')"
          checked={config.manual_transfer_enabled}
          onChange={v => update('manual_transfer_enabled', v)}
        />
        {config.manual_transfer_enabled && (
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-zinc-800">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">CBU</label>
              <input
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
                value={config.transfer_cbu ?? ''}
                onChange={e => update('transfer_cbu', e.target.value)}
                placeholder="0000000000000000000000"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Alias</label>
              <input
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
                value={config.transfer_alias ?? ''}
                onChange={e => update('transfer_alias', e.target.value)}
                placeholder="gounuri.pagos"
              />
            </div>
          </div>
        )}
      </div>

      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-200">Mercado Pago</h2>
        <ToggleRow
          label="Habilitar débito automático"
          desc="Checkout automático de Mercado Pago (Preapproval) en gounuri.com/perfil/plan"
          checked={config.mercadopago_enabled}
          onChange={v => update('mercadopago_enabled', v)}
        />
        <p className="text-xs text-zinc-500">
          Usa las credenciales de <code className="text-zinc-400">GOUNURI_MP_ACCESS_TOKEN</code> ya configuradas en Vercel — no hay nada más que cargar acá.
        </p>
      </div>

      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-200">Contacto para coordinar el pago</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">WhatsApp (con código de país, sin +)</label>
            <input
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
              value={config.whatsapp_number ?? ''}
              onChange={e => update('whatsapp_number', e.target.value.replace(/\D/g, ''))}
              placeholder="541131351972"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Email</label>
            <input
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
              value={config.contact_email}
              onChange={e => update('contact_email', e.target.value)}
              placeholder="info@gounuri.com"
            />
          </div>
        </div>
        <p className="text-xs text-zinc-500">
          Se muestran en gounuri.com/perfil/plan cuando alguien elige pagar por transferencia.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60 transition-colors"
        >
          {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  )
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-zinc-200">{label}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{desc}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

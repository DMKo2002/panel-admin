'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Toggle from '@/components/Toggle'
import type { StoreConfig } from '@/lib/types'
import { CheckCircle, XCircle } from 'lucide-react'

export default function TiendaPage() {
  const supabase = createClient()
  const [config, setConfig] = useState<StoreConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [mpToken, setMpToken] = useState('')
  const [savingMp, setSavingMp] = useState(false)
  const [savedMp, setSavedMp] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      if (!userRow) return
      const { data } = await supabase.from('store_config').select('*').eq('tenant_id', userRow.tenant_id).single()
      setConfig(data)
      if ((data as any)?.mp_access_token) setMpToken((data as any).mp_access_token)
    }
    load()
  }, [])

  function update(field: keyof StoreConfig, value: any) {
    setConfig(c => c ? { ...c, [field]: value } : c)
  }

  async function handleSave() {
    if (!config) return
    setSaving(true)
    await supabase.from('store_config').update({
      primary_color: config.primary_color,
      mp_enabled: config.mp_enabled,
      transfer_enabled: config.transfer_enabled,
      transfer_cbu: config.transfer_cbu,
      transfer_alias: config.transfer_alias,
      oca_enabled: config.oca_enabled,
      andreani_enabled: config.andreani_enabled,
      pickup_enabled: config.pickup_enabled,
    }).eq('id', config.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleSaveMpToken() {
    if (!config) return
    setSavingMp(true)
    await supabase.from('store_config').update({
      mp_access_token: mpToken.trim() || null,
    }).eq('id', config.id)
    setSavingMp(false)
    setSavedMp(true)
    setTimeout(() => setSavedMp(false), 2000)
  }

  const hasMpToken = Boolean((config as any)?.mp_access_token || mpToken)

  return (
    <div>
      <div className="px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Mi tienda</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Configuración general de tu ecommerce</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-60">
          {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      <div className="px-8 py-6 max-w-2xl space-y-5">

        {/* Apariencia */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-700">Apariencia</h2>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Logo</label>
            <label className="flex items-center gap-3 px-3 py-2 border border-dashed border-zinc-200 rounded-lg cursor-pointer hover:border-violet-300 transition-colors">
              <div className="w-10 h-10 bg-zinc-100 rounded-lg flex items-center justify-center text-zinc-400 text-xs flex-shrink-0">
                {config?.logo_url ? <img src={config.logo_url} className="w-full h-full object-contain rounded-lg" /> : 'Logo'}
              </div>
              <span className="text-sm text-zinc-400">Subir imagen (PNG o SVG recomendado)</span>
              <input type="file" accept="image/*" className="hidden" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Color principal</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={config?.primary_color ?? '#7F77DD'}
                  onChange={e => update('primary_color', e.target.value)}
                  className="w-9 h-9 rounded-lg border border-zinc-200 cursor-pointer p-0.5"
                />
                <input
                  className="input flex-1"
                  value={config?.primary_color ?? ''}
                  onChange={e => update('primary_color', e.target.value)}
                  placeholder="#7F77DD"
                />
              </div>
            </div>
          </div>
        </div>

        {/* MercadoPago */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-700">MercadoPago</h2>
            {hasMpToken
              ? <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium"><CheckCircle size={13} />Conectado</span>
              : <span className="flex items-center gap-1.5 text-xs text-zinc-400"><XCircle size={13} />No conectado</span>
            }
          </div>

          <div className="flex items-center justify-between py-2 border-b border-zinc-50">
            <div>
              <p className="text-sm text-zinc-800">Habilitar MercadoPago</p>
              <p className="text-xs text-zinc-400 mt-0.5">Los clientes podrán pagar con tarjeta, débito y QR</p>
            </div>
            <Toggle checked={Boolean(config?.mp_enabled)} onChange={v => update('mp_enabled', v)} />
          </div>

          {config?.mp_enabled && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Access Token de tu cuenta MP
                </label>
                <input
                  className="input font-mono text-xs"
                  type="password"
                  value={mpToken}
                  onChange={e => setMpToken(e.target.value)}
                  placeholder="APP_USR-... o TEST-..."
                />
                <p className="text-xs text-zinc-400 mt-1.5">
                  Lo encontrás en{' '}
                  <a href="https://www.mercadopago.com.ar/developers/panel/app" target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline">
                    mercadopago.com.ar/developers
                  </a>
                  {' '}→ tu aplicación → Credenciales de producción
                </p>
              </div>
              <button
                onClick={handleSaveMpToken}
                disabled={savingMp}
                className="btn-secondary text-sm disabled:opacity-60"
              >
                {savedMp ? '✓ Token guardado' : savingMp ? 'Guardando...' : 'Guardar token MP'}
              </button>
            </div>
          )}
        </div>

        {/* Transferencia bancaria */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5">
          <h2 className="text-sm font-semibold text-zinc-700 mb-4">Transferencia bancaria</h2>
          <div className="space-y-1">
            <ToggleRow
              label="Habilitar transferencia"
              desc="El cliente transfiere y vos confirmás el pago manualmente"
              checked={Boolean(config?.transfer_enabled)}
              onChange={v => update('transfer_enabled', v)}
            />
          </div>
          {config?.transfer_enabled && (
            <div className="mt-4 grid grid-cols-2 gap-4 pt-4 border-t border-zinc-100">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">CBU</label>
                <input
                  className="input text-sm"
                  value={config.transfer_cbu ?? ''}
                  onChange={e => update('transfer_cbu', e.target.value)}
                  placeholder="0000000000000000000000"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Alias</label>
                <input
                  className="input text-sm"
                  value={config.transfer_alias ?? ''}
                  onChange={e => update('transfer_alias', e.target.value)}
                  placeholder="mi.alias.mp"
                />
              </div>
            </div>
          )}
        </div>

        {/* Métodos de envío */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5">
          <h2 className="text-sm font-semibold text-zinc-700 mb-4">Métodos de envío</h2>
          <div className="space-y-1">
            <ToggleRow label="OCA" desc="Cálculo automático de flete por código postal" checked={Boolean(config?.oca_enabled)} onChange={v => update('oca_enabled', v)} />
            <ToggleRow label="Andreani" desc="Requiere credenciales de cuenta empresas" checked={Boolean(config?.andreani_enabled)} onChange={v => update('andreani_enabled', v)} />
            <ToggleRow label="Retiro en local" desc="El cliente retira sin costo de envío" checked={Boolean(config?.pickup_enabled)} onChange={v => update('pickup_enabled', v)} />
          </div>
        </div>

      </div>
    </div>
  )
}

function ToggleRow({ label, desc, checked, onChange }: {
  label: string; desc: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-zinc-50 last:border-0">
      <div>
        <p className="text-sm text-zinc-800">{label}</p>
        <p className="text-xs text-zinc-400 mt-0.5">{desc}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Toggle from '@/components/Toggle'
import type { StoreConfig } from '@/lib/types'
import { CheckCircle, XCircle } from 'lucide-react'

export default function PagosPage() {
  const supabase = createClient()
  const [config, setConfig] = useState<StoreConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [mpToken, setMpToken] = useState('')
  const [mpPublicKey, setMpPublicKey] = useState('')
  const [savingMp, setSavingMp] = useState(false)
  const [savedMp, setSavedMp] = useState(false)
  const [errorMp, setErrorMp] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: _userRows } = await supabase.from('users').select('tenant_id').eq('id', user.id).limit(1)
      const userRow = _userRows?.[0]
      if (!userRow) return
      const { data } = await supabase.from('store_config').select('*').eq('tenant_id', userRow.tenant_id).single()
      setConfig(data)
      if ((data as any)?.mp_access_token) setMpToken((data as any).mp_access_token as string)
      if ((data as any)?.mp_public_key)   setMpPublicKey((data as any).mp_public_key as string)
    }
    load()
  }, [])

  function update(field: keyof StoreConfig, value: any) {
    setConfig(c => c ? { ...c, [field]: value } : c)
  }

  async function handleSave() {
    if (!config) return
    setSaving(true)
    setErrorGeneral(null)
    const { error } = await supabase.from('store_config').update({
      mp_enabled:       config.mp_enabled,
      interest_free_installments: (config as any).interest_free_installments ?? null,
      transfer_enabled: config.transfer_enabled,
      transfer_cbu:     config.transfer_cbu,
      transfer_alias:   config.transfer_alias,
    }).eq('id', config.id)
    setSaving(false)
    if (error) {
      console.error('Error guardando configuracion de pagos:', error)
      setErrorGeneral(error.message || 'No se pudo guardar. Reintentá o contactá a soporte.')
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleSaveMpToken() {
    if (!config) return
    setSavingMp(true)
    setErrorMp(null)
    const { error } = await supabase.from('store_config').update({
      mp_access_token: mpToken.trim() || null,
      mp_public_key:   mpPublicKey.trim() || null,
    }).eq('id', config.id)
    setSavingMp(false)
    if (error) {
      console.error('Error guardando token MP:', error)
      setErrorMp(error.message || 'No se pudo guardar. Reintentá o contactá a soporte.')
      return
    }
    setSavedMp(true); setTimeout(() => setSavedMp(false), 2000)
  }

  const hasMpToken = Boolean((config as any)?.mp_access_token || mpToken)

  return (
    <div>
      <div className="sticky top-0 z-10 px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Pagos y Finanzas</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Cómo cobrás — es la sección más sensible del panel</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-60">
          {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        {errorGeneral && <p className="text-xs text-red-600 mt-1.5">{errorGeneral}</p>}
      </div>

      <div className="px-8 py-6 max-w-2xl space-y-5">

        {/* MercadoPago */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-700">MercadoPago</h2>
            {hasMpToken
              ? <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium"><CheckCircle size={13} />Conectado</span>
              : <span className="flex items-center gap-1.5 text-xs text-zinc-400"><XCircle size={13} />No conectado</span>
            }
          </div>
          <ToggleRow label="Habilitar MercadoPago" desc="Los clientes podrán pagar con tarjeta, débito y QR" checked={Boolean(config?.mp_enabled)} onChange={v => update('mp_enabled', v)} />
          {config?.mp_enabled && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Cuotas sin interés</label>
                <select
                  className="input text-sm"
                  value={(config as any)?.interest_free_installments ?? ''}
                  onChange={e => update('interest_free_installments' as any, e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">No ofrezco cuotas sin interés</option>
                  {[2, 3, 6, 9, 12].map(n => <option key={n} value={n}>Hasta {n} cuotas sin interés</option>)}
                </select>
                <p className="text-xs text-zinc-400 mt-1.5">
                  Este dato es solo para mostrar el cartel correcto en tu tienda — no activa nada por sí solo. Tenés que activarlo antes en tu propia cuenta de Mercado Pago en{' '}
                  <a href="https://www.mercadopago.com.ar/ayuda/como-ofrecer-cuotas-sin-interes_19304" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                    Tu negocio → Configuraciones → Ofrecer cuotas sin interés
                  </a>
                  {' '}(elegí el mismo número acá).
                </p>
              </div>
              <p className="text-xs text-zinc-400">Las credenciales (Public Key y Access Token) se cargan más abajo, en su propio bloque.</p>
            </div>
          )}
        </div>

        {/* Credenciales MercadoPago — bloque separado por sensibilidad */}
        {config?.mp_enabled && (
          <div className="bg-white rounded-xl border border-amber-200 p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-700">Credenciales de MercadoPago</h2>
              <p className="text-xs text-zinc-400 mt-0.5">El Access Token es la clave real de cobro de tu cuenta — no la compartas.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Public Key de tu cuenta MP</label>
              <input className="input font-mono text-xs" value={mpPublicKey} onChange={e => setMpPublicKey(e.target.value)} placeholder="APP_USR-... o TEST-..." />
              <p className="text-xs text-zinc-400 mt-1.5">Se usa en el checkout para tokenizar la tarjeta del comprador.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Access Token de tu cuenta MP</label>
              <input className="input font-mono text-xs" type="password" value={mpToken} onChange={e => setMpToken(e.target.value)} placeholder="APP_USR-... o TEST-..." />
              <p className="text-xs text-zinc-400 mt-1.5">
                Encontrás ambas claves en{' '}
                <a href="https://www.mercadopago.com.ar/developers/panel/app" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">mercadopago.com.ar/developers</a>
                {' '}→ Credenciales de producción (o de prueba)
              </p>
            </div>
            <button onClick={handleSaveMpToken} disabled={savingMp} className="btn-secondary text-sm disabled:opacity-60">
              {savedMp ? '✓ Credenciales guardadas' : savingMp ? 'Guardando...' : 'Guardar credenciales'}
            </button>
            {errorMp && <p className="text-xs text-red-600 mt-1.5">{errorMp}</p>}
          </div>
        )}

        {/* Transferencia */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5">
          <h2 className="text-sm font-semibold text-zinc-700 mb-4">Transferencia bancaria</h2>
          <ToggleRow label="Habilitar transferencia" desc="El cliente transfiere y vos confirmás el pago manualmente" checked={Boolean(config?.transfer_enabled)} onChange={v => update('transfer_enabled', v)} />
          {config?.transfer_enabled && (
            <div className="mt-4 grid grid-cols-2 gap-4 pt-4 border-t border-zinc-100">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">CBU</label>
                <input className="input text-sm" value={config.transfer_cbu ?? ''} onChange={e => update('transfer_cbu', e.target.value)} placeholder="0000000000000000000000" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Alias</label>
                <input className="input text-sm" value={config.transfer_alias ?? ''} onChange={e => update('transfer_alias', e.target.value)} placeholder="mi.alias.mp" />
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
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

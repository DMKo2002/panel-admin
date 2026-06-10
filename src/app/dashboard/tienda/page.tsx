'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Toggle from '@/components/Toggle'
import type { StoreConfig } from '@/lib/types'
import { CheckCircle, XCircle, Plus, Trash2, GripVertical, X } from 'lucide-react'

interface VariantAttribute {
  key: string
  label: string
  type: 'text' | 'select'
  options?: string[]
}

export default function TiendaPage() {
  const supabase = createClient()
  const [config, setConfig] = useState<StoreConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [mpToken, setMpToken] = useState('')
  const [savingMp, setSavingMp] = useState(false)
  const [savedMp, setSavedMp] = useState(false)
  const [attributes, setAttributes] = useState<VariantAttribute[]>([])
  const [savingAttrs, setSavingAttrs] = useState(false)
  const [savedAttrs, setSavedAttrs] = useState(false)
  const [newOption, setNewOption] = useState<Record<number, string>>({})

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      if (!userRow) return
      const { data } = await supabase.from('store_config').select('*').eq('tenant_id', userRow.tenant_id).single()
      setConfig(data)
      if ((data as any)?.mp_access_token) setMpToken((data as any).mp_access_token)
      if ((data as any)?.variant_attributes) setAttributes((data as any).variant_attributes)
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
      // Andreani API
      andreani_usuario: (config as any).andreani_usuario || null,
      andreani_password: (config as any).andreani_password || null,
      andreani_codigo_cliente: (config as any).andreani_codigo_cliente || null,
      andreani_contrato_dom: (config as any).andreani_contrato_dom || null,
      andreani_cp_origen: (config as any).andreani_cp_origen || null,
      andreani_sandbox: (config as any).andreani_sandbox ?? true,
      andreani_peso_default_g: (config as any).andreani_peso_default_g ?? 500,
      andreani_tarifa_fallback: (config as any).andreani_tarifa_fallback ?? 0,
    }).eq('id', config.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleSaveMpToken() {
    if (!config) return
    setSavingMp(true)
    await supabase.from('store_config').update({ mp_access_token: mpToken.trim() || null }).eq('id', config.id)
    setSavingMp(false)
    setSavedMp(true)
    setTimeout(() => setSavedMp(false), 2000)
  }

  async function handleSaveAttributes() {
    if (!config) return
    setSavingAttrs(true)
    await supabase.from('store_config').update({ variant_attributes: attributes }).eq('id', config.id)
    setSavingAttrs(false)
    setSavedAttrs(true)
    setTimeout(() => setSavedAttrs(false), 2000)
  }

  function addAttribute() {
    setAttributes(prev => [...prev, { key: `attr_${Date.now()}`, label: '', type: 'text', options: [] }])
  }

  function removeAttribute(i: number) {
    setAttributes(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateAttribute(i: number, field: keyof VariantAttribute, value: any) {
    setAttributes(prev => prev.map((attr, idx) => {
      if (idx !== i) return attr
      const updated = { ...attr, [field]: value }
      if (field === 'label') updated.key = value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '')
      if (field === 'type' && value === 'select' && !updated.options) updated.options = []
      return updated
    }))
  }

  function addOption(attrIdx: number) {
    const val = newOption[attrIdx]?.trim()
    if (!val) return
    setAttributes(prev => prev.map((attr, idx) => {
      if (idx !== attrIdx) return attr
      return { ...attr, options: [...(attr.options ?? []), val] }
    }))
    setNewOption(prev => ({ ...prev, [attrIdx]: '' }))
  }

  function removeOption(attrIdx: number, optIdx: number) {
    setAttributes(prev => prev.map((attr, idx) => {
      if (idx !== attrIdx) return attr
      return { ...attr, options: (attr.options ?? []).filter((_, i) => i !== optIdx) }
    }))
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
                <input type="color" value={config?.primary_color ?? '#7F77DD'} onChange={e => update('primary_color', e.target.value)} className="w-9 h-9 rounded-lg border border-zinc-200 cursor-pointer p-0.5" />
                <input className="input flex-1" value={config?.primary_color ?? ''} onChange={e => update('primary_color', e.target.value)} placeholder="#7F77DD" />
              </div>
            </div>
          </div>
        </div>

        {/* Atributos de productos */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-700">Atributos de productos</h2>
              <p className="text-xs text-zinc-400 mt-0.5">Campos que aparecen al cargar cada producto</p>
            </div>
            <button onClick={handleSaveAttributes} disabled={savingAttrs} className="btn-secondary text-xs py-1.5 disabled:opacity-60">
              {savedAttrs ? '✓ Guardado' : savingAttrs ? 'Guardando...' : 'Guardar atributos'}
            </button>
          </div>

          <div className="space-y-3">
            {attributes.map((attr, i) => (
              <div key={i} className="border border-zinc-100 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Nombre del atributo</label>
                      <input
                        className="input text-sm"
                        value={attr.label}
                        onChange={e => updateAttribute(i, 'label', e.target.value)}
                        placeholder="Ej: Talle, Color, Textura..."
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Tipo</label>
                      <select
                        className="input text-sm"
                        value={attr.type}
                        onChange={e => updateAttribute(i, 'type', e.target.value as 'text' | 'select')}
                      >
                        <option value="text">Texto libre</option>
                        <option value="select">Lista de opciones</option>
                      </select>
                    </div>
                  </div>
                  <button onClick={() => removeAttribute(i)} className="text-zinc-300 hover:text-red-400 transition-colors mt-6 flex-shrink-0">
                    <Trash2 size={15} />
                  </button>
                </div>

                {/* Opciones para tipo select */}
                {attr.type === 'select' && (
                  <div className="pl-0">
                    <p className="text-xs text-zinc-500 mb-2">Opciones disponibles</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {(attr.options ?? []).map((opt, optIdx) => (
                        <span key={optIdx} className="inline-flex items-center gap-1 px-2.5 py-1 bg-zinc-100 rounded-full text-xs text-zinc-700">
                          {opt}
                          <button onClick={() => removeOption(i, optIdx)} className="text-zinc-400 hover:text-red-400 transition-colors">
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        className="input text-sm flex-1"
                        value={newOption[i] ?? ''}
                        onChange={e => setNewOption(prev => ({ ...prev, [i]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(i) } }}
                        placeholder="Nueva opción..."
                      />
                      <button onClick={() => addOption(i)} className="btn-secondary text-xs px-3 py-1.5 flex-shrink-0">
                        <Plus size={13} /> Agregar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button onClick={addAttribute} className="flex items-center gap-2 text-sm text-violet-600 hover:text-violet-700 transition-colors">
            <Plus size={14} />
            Agregar atributo
          </button>
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
                <label className="block text-sm font-medium text-zinc-700 mb-1">Access Token de tu cuenta MP</label>
                <input className="input font-mono text-xs" type="password" value={mpToken} onChange={e => setMpToken(e.target.value)} placeholder="APP_USR-... o TEST-..." />
                <p className="text-xs text-zinc-400 mt-1.5">
                  Lo encontrás en{' '}
                  <a href="https://www.mercadopago.com.ar/developers/panel/app" target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline">
                    mercadopago.com.ar/developers
                  </a>
                  {' '}→ Credenciales de producción
                </p>
              </div>
              <button onClick={handleSaveMpToken} disabled={savingMp} className="btn-secondary text-sm disabled:opacity-60">
                {savedMp ? '✓ Token guardado' : savingMp ? 'Guardando...' : 'Guardar token MP'}
              </button>
            </div>
          )}
        </div>

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

        {/* Envíos */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5">
          <h2 className="text-sm font-semibold text-zinc-700 mb-4">Métodos de envío</h2>
          <div className="space-y-1">
            <ToggleRow label="OCA" desc="Cálculo automático de flete por código postal" checked={Boolean(config?.oca_enabled)} onChange={v => update('oca_enabled', v)} />
            <ToggleRow label="Andreani" desc="Cotización automática via API por código postal" checked={Boolean(config?.andreani_enabled)} onChange={v => update('andreani_enabled', v)} />
            <ToggleRow label="Retiro en local" desc="El cliente retira sin costo de envío" checked={Boolean(config?.pickup_enabled)} onChange={v => update('pickup_enabled', v)} />
          </div>
        </div>

        {/* Andreani — credenciales API */}
        {config?.andreani_enabled && (
          <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-zinc-700">Andreani — Configuración API</h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Sin credenciales se usa la tarifa de fallback. Con credenciales se cotiza en tiempo real.
                </p>
              </div>
              <a
                href="mailto:apis@andreani.com"
                className="text-xs text-violet-600 hover:underline"
                target="_blank" rel="noopener noreferrer"
              >
                Solicitar credenciales →
              </a>
            </div>

            {/* Ambiente */}
            <div className="flex items-center justify-between py-2 border-b border-zinc-50">
              <div>
                <p className="text-sm text-zinc-800">Modo sandbox (pruebas)</p>
                <p className="text-xs text-zinc-400 mt-0.5">Activado = usa api.qa.andreani.com. Desactivar al pasar a producción.</p>
              </div>
              <Toggle checked={Boolean(config?.andreani_sandbox ?? true)} onChange={v => update('andreani_sandbox' as any, v)} />
            </div>

            {/* Credenciales */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Usuario</label>
                <input
                  className="input text-sm"
                  value={(config as any)?.andreani_usuario ?? ''}
                  onChange={e => update('andreani_usuario' as any, e.target.value)}
                  placeholder="usuario_api"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Contraseña</label>
                <input
                  className="input text-sm font-mono"
                  type="password"
                  value={(config as any)?.andreani_password ?? ''}
                  onChange={e => update('andreani_password' as any, e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Código de cliente</label>
                <input
                  className="input text-sm"
                  value={(config as any)?.andreani_codigo_cliente ?? ''}
                  onChange={e => update('andreani_codigo_cliente' as any, e.target.value)}
                  placeholder="CL0001234"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Contrato (domicilio)</label>
                <input
                  className="input text-sm"
                  value={(config as any)?.andreani_contrato_dom ?? ''}
                  onChange={e => update('andreani_contrato_dom' as any, e.target.value)}
                  placeholder="400006711"
                />
              </div>
            </div>

            {/* CP origen y peso */}
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-zinc-50">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Código postal de origen</label>
                <input
                  className="input text-sm"
                  value={(config as any)?.andreani_cp_origen ?? ''}
                  onChange={e => update('andreani_cp_origen' as any, e.target.value)}
                  placeholder="1428"
                  maxLength={4}
                />
                <p className="text-xs text-zinc-400 mt-1">CP desde donde despachás los pedidos</p>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Peso estimado por ítem (gramos)</label>
                <input
                  className="input text-sm"
                  type="number"
                  min={50}
                  value={(config as any)?.andreani_peso_default_g ?? 500}
                  onChange={e => update('andreani_peso_default_g' as any, Number(e.target.value))}
                  placeholder="500"
                />
                <p className="text-xs text-zinc-400 mt-1">Peso promedio de cada producto</p>
              </div>
            </div>

            {/* Tarifa fallback */}
            <div className="pt-2 border-t border-zinc-50">
              <label className="block text-xs text-zinc-500 mb-1">Tarifa fija de fallback (ARS)</label>
              <input
                className="input text-sm w-48"
                type="number"
                min={0}
                value={(config as any)?.andreani_tarifa_fallback ?? 0}
                onChange={e => update('andreani_tarifa_fallback' as any, Number(e.target.value))}
                placeholder="5000"
              />
              <p className="text-xs text-zinc-400 mt-1">
                Se muestra cuando no hay credenciales configuradas. Poné 0 para mostrar "Gratis".
              </p>
            </div>
          </div>
        )}

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

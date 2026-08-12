'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Toggle from '@/components/Toggle'
import type { StoreConfig } from '@/lib/types'
import { CheckCircle, XCircle } from 'lucide-react'
import { useTutorial, type TutorialStep } from '@/components/tutorial/TutorialProvider'
import TutorialHint from '@/components/tutorial/TutorialHint'
import PageTutorialButton from '@/components/tutorial/PageTutorialButton'

// Un solo array fuente de verdad: lo usa tanto el tour completo de la página
// (botón (?) del header) como cada botón (?) individual de cada bloque.
const PAGOS_STEPS: TutorialStep[] = [
  {
    id: 'pagos-mp',
    target: '[data-tutorial="pagos-mp"]',
    title: 'MercadoPago',
    content: 'Activá MercadoPago para que tus clientes paguen con tarjeta, débito o QR. Si ofrecés cuotas sin interés, elegí acá cuántas — pero primero tenés que activarlo en tu propia cuenta de MercadoPago; esto solo controla el cartel que se muestra en tu tienda, no activa nada por sí solo.',
  },
  {
    id: 'pagos-mp-creds',
    target: '[data-tutorial="pagos-mp-creds"]',
    title: 'Credenciales de MercadoPago',
    content: 'Acá cargás el Public Key y el Access Token de TU cuenta de MercadoPago (los conseguís en mercadopago.com.ar/developers → Credenciales). El Access Token es la clave real que cobra en tu nombre — nunca la compartas con nadie.',
  },
  {
    id: 'pagos-transfer',
    target: '[data-tutorial="pagos-transfer"]',
    title: 'Transferencia bancaria',
    content: 'Alternativa a MercadoPago: el cliente transfiere directo a tu CBU o alias, y vos confirmás el pago a mano desde Pedidos. No paga comisión, pero requiere que lo confirmes manualmente cada vez.',
  },
  {
    id: 'pagos-cash',
    target: '[data-tutorial="pagos-cash"]',
    title: 'Efectivo en el local',
    content: 'El cliente elige pagar en efectivo al retirar o recibir el pedido, sin transferir nada de antemano. Vos confirmás el cobro a mano desde Pedidos, igual que con transferencia. Usa la dirección de retiro que cargaste en Contacto y Redes.',
  },
]

export default function PagosPage() {
  const supabase = createClient()
  const { registerSteps } = useTutorial()
  const [config, setConfig] = useState<StoreConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [mpToken, setMpToken] = useState('')
  const [mpPublicKey, setMpPublicKey] = useState('')
  const [savingMp, setSavingMp] = useState(false)
  const [savedMp, setSavedMp] = useState(false)
  const [errorMp, setErrorMp] = useState<string | null>(null)
  const [mpConectado, setMpConectado] = useState(false)

  useEffect(() => {
    registerSteps('pagos', PAGOS_STEPS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: _userRows } = await supabase.from('users').select('tenant_id').eq('id', user.id).limit(1)
      const userRow = _userRows?.[0]
      if (!userRow) return
      // mp_access_token NO va en este select a propósito: desde 2026-08-11
      // "authenticated" ya no tiene permiso de leerlo (ver credenciales-status
      // route). Solo se piden acá las columnas que esta página realmente usa.
      const { data } = await supabase
        .from('store_config')
        .select('id, mp_enabled, interest_free_installments, transfer_enabled, transfer_cbu, transfer_alias, cash_enabled, mp_public_key')
        .eq('tenant_id', userRow.tenant_id)
        .single()
      // El select de arriba trae a propósito solo un subconjunto de columnas
      // (no StoreConfig completo) para no depender de mp_access_token acá.
      // Esta página solo usa esos campos, así que el cast es seguro.
      setConfig(data as StoreConfig)
      if ((data as any)?.mp_public_key) setMpPublicKey((data as any).mp_public_key as string)

      const statusRes = await fetch('/api/mp/credenciales-status')
      if (statusRes.ok) {
        const { conectado } = await statusRes.json()
        setMpConectado(conectado)
      }
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
      cash_enabled:     (config as any).cash_enabled,
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
    // Si el campo de Access Token quedó vacío, no se manda esa columna en el
    // update — así no se pisa el token ya guardado solo porque el campo
    // arranca vacío por seguridad (ya no se prellena con el valor real).
    // Para borrar el token de verdad está el botón "Quitar credenciales".
    const updates: Record<string, unknown> = { mp_public_key: mpPublicKey.trim() || null }
    if (mpToken.trim()) updates.mp_access_token = mpToken.trim()

    const { error } = await supabase.from('store_config').update(updates).eq('id', config.id)
    setSavingMp(false)
    if (error) {
      console.error('Error guardando token MP:', error)
      setErrorMp(error.message || 'No se pudo guardar. Reintentá o contactá a soporte.')
      return
    }
    if (mpToken.trim()) { setMpConectado(true); setMpToken('') }
    setSavedMp(true); setTimeout(() => setSavedMp(false), 2000)
  }

  async function handleRemoveMpToken() {
    if (!config) return
    if (!confirm('¿Quitar el Access Token de MercadoPago? Dejarás de poder cobrar con tarjeta hasta cargar uno nuevo.')) return
    setSavingMp(true)
    setErrorMp(null)
    const { error } = await supabase.from('store_config').update({ mp_access_token: null }).eq('id', config.id)
    setSavingMp(false)
    if (error) {
      console.error('Error quitando token MP:', error)
      setErrorMp(error.message || 'No se pudo quitar. Reintentá o contactá a soporte.')
      return
    }
    setMpConectado(false)
    setMpToken('')
  }

  const hasMpToken = mpConectado

  return (
    <div>
      <div className="sticky top-0 z-10 px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Pagos y Finanzas</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Cómo cobrás — es la sección más sensible del panel</p>
          <PageTutorialButton pageKey="pagos" />
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-60">
          {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        {errorGeneral && <p className="text-xs text-red-600 mt-1.5">{errorGeneral}</p>}
      </div>

      <div className="px-8 py-6 max-w-2xl space-y-5">

        {/* MercadoPago */}
        <div data-tutorial="pagos-mp" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-semibold text-zinc-700">MercadoPago</h2>
              <TutorialHint pageKey="pagos" step={PAGOS_STEPS[0]} />
            </div>
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
          <div data-tutorial="pagos-mp-creds" className="bg-white rounded-xl border border-amber-200 p-5 space-y-4">
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-semibold text-zinc-700">Credenciales de MercadoPago</h2>
                <TutorialHint pageKey="pagos" step={PAGOS_STEPS[1]} />
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">El Access Token es la clave real de cobro de tu cuenta — no la compartas.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Public Key de tu cuenta MP</label>
              <input className="input font-mono text-xs" value={mpPublicKey} onChange={e => setMpPublicKey(e.target.value)} placeholder="APP_USR-... o TEST-..." />
              <p className="text-xs text-zinc-400 mt-1.5">Se usa en el checkout para tokenizar la tarjeta del comprador.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Access Token de tu cuenta MP</label>
              <input
                className="input font-mono text-xs"
                type="password"
                value={mpToken}
                onChange={e => setMpToken(e.target.value)}
                placeholder={mpConectado ? '•••••••••••••••••••• (ya cargado — pegá uno nuevo para reemplazarlo)' : 'APP_USR-... o TEST-...'}
              />
              <p className="text-xs text-zinc-400 mt-1.5">
                Encontrás ambas claves en{' '}
                <a href="https://www.mercadopago.com.ar/developers/panel/app" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">mercadopago.com.ar/developers</a>
                {' '}→ Credenciales de producción (o de prueba). Por seguridad, una vez guardado no se vuelve a mostrar acá.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleSaveMpToken} disabled={savingMp} className="btn-secondary text-sm disabled:opacity-60">
                {savedMp ? '✓ Credenciales guardadas' : savingMp ? 'Guardando...' : 'Guardar credenciales'}
              </button>
              {mpConectado && (
                <button onClick={handleRemoveMpToken} disabled={savingMp} className="text-xs text-red-600 hover:underline disabled:opacity-60">
                  Quitar credenciales
                </button>
              )}
            </div>
            {errorMp && <p className="text-xs text-red-600 mt-1.5">{errorMp}</p>}
          </div>
        )}

        {/* Transferencia */}
        <div data-tutorial="pagos-transfer" className="bg-white rounded-xl border border-zinc-200 p-5">
          <div className="flex items-center gap-1.5 mb-4">
            <h2 className="text-sm font-semibold text-zinc-700">Transferencia bancaria</h2>
            <TutorialHint pageKey="pagos" step={PAGOS_STEPS[2]} />
          </div>
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

        {/* Efectivo en el local */}
        <div data-tutorial="pagos-cash" className="bg-white rounded-xl border border-zinc-200 p-5">
          <div className="flex items-center gap-1.5 mb-4">
            <h2 className="text-sm font-semibold text-zinc-700">Efectivo en el local</h2>
            <TutorialHint pageKey="pagos" step={PAGOS_STEPS[3]} />
          </div>
          <ToggleRow label="Habilitar pago en efectivo" desc="El cliente paga al retirar o recibir el pedido — vos confirmás el cobro manualmente" checked={Boolean((config as any)?.cash_enabled)} onChange={v => update('cash_enabled' as any, v)} />
          <p className="text-xs text-zinc-400 mt-3">
            Usa la dirección de retiro que cargaste en{' '}
            <a href="/dashboard/contacto" className="text-primary-600 hover:underline">Contacto y Redes</a>
            {' '}— no hace falta configurar nada más acá.
          </p>
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

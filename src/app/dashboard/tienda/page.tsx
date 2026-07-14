'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Toggle from '@/components/Toggle'
import type { StoreConfig } from '@/lib/types'
import { CheckCircle, XCircle, Plus, Trash2, X } from 'lucide-react'
import { applyTheme } from '@/components/ThemeProvider'

interface VariantAttribute {
  key: string
  label: string
  type: 'text' | 'select'
  options?: string[]
}

const THEMES = [
  { id: 'default', label: 'Default', preview: { sidebar: 'bg-violet-600', bg: 'bg-zinc-100' } },
  { id: 'dark',    label: 'Dark',    preview: { sidebar: 'bg-zinc-900',   bg: 'bg-zinc-800' } },
]

export default function TiendaPage() {
  const supabase = createClient()
  const [config, setConfig] = useState<StoreConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [mpToken, setMpToken] = useState('')
  const [savingMp, setSavingMp] = useState(false)
  const [savedMp, setSavedMp] = useState(false)
  const [errorMp, setErrorMp] = useState<string | null>(null)
  const [attributes, setAttributes] = useState<VariantAttribute[]>([])
  const [savingAttrs, setSavingAttrs] = useState(false)
  const [savedAttrs, setSavedAttrs] = useState(false)
  const [errorAttrs, setErrorAttrs] = useState<string | null>(null)
  const [newOption, setNewOption] = useState<Record<number, string>>({})
  const [customShipping, setCustomShipping] = useState<{name:string;price:number;active:boolean;carriers?:string[]}[]>([])
  // Texto crudo del input de transportes por método — separado del array para
  // no perder comas/espacios mientras el usuario está escribiendo (el array
  // final se recalcula en cada cambio, pero lo que se ve es este string).
  const [carriersText, setCarriersText] = useState<Record<number, string>>({})
  const [panelTheme, setPanelTheme] = useState<'default' | 'dark'>('default')
  const [savingPdf, setSavingPdf] = useState(false)
  const [savedPdf, setSavedPdf] = useState(false)
  const [errorPdf, setErrorPdf] = useState<string | null>(null)
  const [emailFromName, setEmailFromName] = useState('')
  const [notificationEmail, setNotificationEmail] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [emailIntroPedidoRecibido, setEmailIntroPedidoRecibido] = useState('')
  const [emailIntroPedidoEnviado, setEmailIntroPedidoEnviado] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  const [savedEmail, setSavedEmail] = useState(false)
  const [errorEmail, setErrorEmail] = useState<string | null>(null)
  const [whatsapp, setWhatsapp] = useState('')
  const [instagramUrl, setInstagramUrl] = useState('')
  const [facebookUrl, setFacebookUrl] = useState('')
  const [tiktokUrl, setTiktokUrl] = useState('')
  const [storeAddress, setStoreAddress] = useState('')
  const [pickupAddress, setPickupAddress] = useState('')
  const [savingContact, setSavingContact] = useState(false)
  const [savedContact, setSavedContact] = useState(false)
  const [errorContact, setErrorContact] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: _userRows } = await supabase.from('users').select('tenant_id').eq('id', user.id).limit(1)
  const userRow = _userRows?.[0]
      if (!userRow) return
      const { data } = await supabase.from('store_config').select('*').eq('tenant_id', userRow.tenant_id).single()
      setConfig(data)
      if ((data as any)?.mp_access_token)    setMpToken((data as any).mp_access_token as string)
      if ((data as any)?.variant_attributes) setAttributes((data as any).variant_attributes as any)
      if ((data as any)?.email_from_name)    setEmailFromName((data as any).email_from_name)
      if ((data as any)?.notification_email) setNotificationEmail((data as any).notification_email)
      if ((data as any)?.reply_to)           setReplyTo((data as any).reply_to)
      if ((data as any)?.email_intro_pedido_recibido) setEmailIntroPedidoRecibido((data as any).email_intro_pedido_recibido)
      if ((data as any)?.email_intro_pedido_enviado)  setEmailIntroPedidoEnviado((data as any).email_intro_pedido_enviado)
      if ((data as any)?.whatsapp_number)  setWhatsapp((data as any).whatsapp_number)
      if ((data as any)?.instagram_url)    setInstagramUrl((data as any).instagram_url)
      if ((data as any)?.facebook_url)     setFacebookUrl((data as any).facebook_url)
      if ((data as any)?.tiktok_url)       setTiktokUrl((data as any).tiktok_url)
      if ((data as any)?.store_address)    setStoreAddress((data as any).store_address)
      if ((data as any)?.pickup_address)   setPickupAddress((data as any).pickup_address)
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
      const theme = (data as any)?.panel_theme ?? 'default'
      setPanelTheme(theme)
    }
    load()
  }, [])

  function update(field: keyof StoreConfig, value: any) {
    setConfig(c => c ? { ...c, [field]: value } : c)
  }

  function handleThemeChange(theme: 'default' | 'dark') {
    setPanelTheme(theme)
    applyTheme(theme)
    localStorage.setItem('pa-theme', theme)
  }

  async function handleSave() {
    if (!config) return
    setSaving(true)
    setErrorGeneral(null)
    const { error } = await supabase.from('store_config').update({
      panel_theme:      panelTheme,
      mp_enabled:       config.mp_enabled,
      transfer_enabled: config.transfer_enabled,
      transfer_cbu:     config.transfer_cbu,
      transfer_alias:   config.transfer_alias,
      min_order_amount: config.min_order_amount ?? null,
      min_qty_per_variant: config.min_qty_per_variant ?? 1,
      price_visibility: config.price_visibility ?? 'all',
      registration_visibility: config.registration_visibility ?? 'both',
      custom_shipping:  customShipping,
      ignore_stock:     (config as any).ignore_stock ?? false,
    }).eq('id', config.id)
    setSaving(false)
    if (error) {
      console.error('Error guardando configuracion general:', error)
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
    const { error } = await supabase.from('store_config').update({ mp_access_token: mpToken.trim() || null }).eq('id', config.id)
    setSavingMp(false)
    if (error) {
      console.error('Error guardando token MP:', error)
      setErrorMp(error.message || 'No se pudo guardar. Reintentá o contactá a soporte.')
      return
    }
    setSavedMp(true); setTimeout(() => setSavedMp(false), 2000)
  }

  async function handleSaveAttributes() {
    if (!config) return
    setSavingAttrs(true)
    setErrorAttrs(null)
    const { error } = await supabase.from('store_config').update({ variant_attributes: attributes }).eq('id', config.id)
    setSavingAttrs(false)
    if (error) {
      console.error('Error guardando atributos:', error)
      setErrorAttrs(error.message || 'No se pudo guardar. Reintentá o contactá a soporte.')
      return
    }
    setSavedAttrs(true); setTimeout(() => setSavedAttrs(false), 2000)
  }

  async function handleSaveEmail() {
    if (!config) return
    setSavingEmail(true)
    setErrorEmail(null)
    const { error } = await supabase.from('store_config').update({
      email_from_name:    emailFromName.trim()    || null,
      notification_email: notificationEmail.trim() || null,
      reply_to:           replyTo.trim()           || null,
      email_intro_pedido_recibido: emailIntroPedidoRecibido.trim() || null,
      email_intro_pedido_enviado:  emailIntroPedidoEnviado.trim()  || null,
    }).eq('id', config.id)
    setSavingEmail(false)
    if (error) {
      console.error('Error guardando configuracion de emails:', error)
      setErrorEmail(error.message || 'No se pudo guardar. Reintentá o contactá a soporte.')
      return
    }
    setSavedEmail(true); setTimeout(() => setSavedEmail(false), 2000)
  }

  async function handleSaveContact() {
    if (!config) return
    setSavingContact(true)
    setErrorContact(null)
    const { error } = await supabase.from('store_config').update({
      whatsapp_number: whatsapp.trim()    || null,
      instagram_url:   instagramUrl.trim() || null,
      facebook_url:    facebookUrl.trim()  || null,
      tiktok_url:      tiktokUrl.trim()    || null,
      store_address:   storeAddress.trim()  || null,
      pickup_address:  pickupAddress.trim() || null,
    }).eq('id', config.id)
    setSavingContact(false)
    if (error) {
      console.error('Error guardando datos de contacto:', error)
      setErrorContact(error.message || 'No se pudo guardar. Reintentá o contactá a soporte.')
      return
    }
    setSavedContact(true); setTimeout(() => setSavedContact(false), 2000)
  }

  async function handleSavePdf() {
    if (!config) return
    setSavingPdf(true)
    setErrorPdf(null)
    const { error } = await supabase.from('store_config').update({
      pdf_show_variant:   (config as any).pdf_show_variant   ?? true,
      pdf_show_pricetype: (config as any).pdf_show_pricetype ?? true,
      pdf_show_address:   (config as any).pdf_show_address   ?? true,
      pdf_show_notes:     (config as any).pdf_show_notes     ?? true,
    }).eq('id', config.id)
    setSavingPdf(false)
    if (error) {
      console.error('Error guardando configuracion de PDF:', error)
      setErrorPdf(error.message || 'No se pudo guardar. Reintentá o contactá a soporte.')
      return
    }
    setSavedPdf(true); setTimeout(() => setSavedPdf(false), 2000)
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
      if (field === 'label') updated.key = value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '')
      if (field === 'type' && value === 'select' && !updated.options) updated.options = []
      return updated
    }))
  }
  function addOption(attrIdx: number) {
    const val = newOption[attrIdx]?.trim()
    if (!val) return
    setAttributes(prev => prev.map((attr, idx) => idx !== attrIdx ? attr : { ...attr, options: [...(attr.options ?? []), val] }))
    setNewOption(prev => ({ ...prev, [attrIdx]: '' }))
  }
  function removeOption(attrIdx: number, optIdx: number) {
    setAttributes(prev => prev.map((attr, idx) => idx !== attrIdx ? attr : { ...attr, options: (attr.options ?? []).filter((_, i) => i !== optIdx) }))
  }

  const hasMpToken = Boolean((config as any)?.mp_access_token || mpToken)

  return (
    <div>
      <div className="sticky top-0 z-10 px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Mi tienda</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Configuración general de tu ecommerce</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-60">
          {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
            {errorGeneral && <p className="text-xs text-red-600 mt-1.5">{errorGeneral}</p>}
      </div>

      <div className="px-8 py-6 max-w-2xl space-y-5">

        {/* Apariencia */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-700">Apariencia</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Las imágenes (logo, hero, colecciones) se gestionan en{' '}
              <a href="/dashboard/personalizacion" className="text-violet-600 hover:underline">Personalización</a>.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-2">Tema del panel</label>
            <div className="flex gap-3">
              {THEMES.map(t => (
                <button
                  key={t.id}
                  onClick={() => handleThemeChange(t.id as 'default' | 'dark')}
                  className={`relative flex flex-col items-start gap-2 p-4 rounded-xl border-2 transition-all w-32 ${
                    panelTheme === t.id ? 'border-violet-500 bg-violet-50' : 'border-zinc-200 hover:border-zinc-300'
                  }`}
                >
                  {/* Mini preview */}
                  <div className={`w-full h-10 rounded-md flex overflow-hidden ${t.preview.bg}`}>
                    <div className={`w-8 h-full ${t.preview.sidebar}`} />
                    <div className="flex-1 p-1.5 space-y-1.5">
                      <div className="h-1.5 rounded-full w-3/4 bg-white/40" />
                      <div className="h-1.5 rounded-full w-1/2 bg-white/20" />
                    </div>
                  </div>
                  <p className="text-sm font-medium text-zinc-900">{t.label}</p>
                  {panelTheme === t.id && (
                    <div className="absolute top-2 right-2 w-4 h-4 bg-violet-600 rounded-full flex items-center justify-center">
                      <span className="text-white text-[9px] font-bold">✓</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stock */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-700">Gestión de stock</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Útil para mayoristas que manejan disponibilidad por WhatsApp</p>
          </div>
          <ToggleRow
            label="Modo sin stock"
            desc="Todos los productos aparecen como disponibles sin importar el stock cargado"
            checked={Boolean((config as any)?.ignore_stock)}
            onChange={v => update('ignore_stock' as any, v)}
          />
        </div>

        {/* Pedido mínimo */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-700">Pedido mínimo</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Monto mínimo requerido para finalizar la compra. Dejá en 0 para no aplicar.</p>
          </div>
          <div className="flex items-center gap-3 max-w-xs">
            <span className="text-sm text-zinc-500 flex-shrink-0">ARS $</span>
            <input className="input flex-1" type="number" min={0} step={100} value={config?.min_order_amount ?? ''} onChange={e => update('min_order_amount', e.target.value === '' ? null : Number(e.target.value))} placeholder="Ej: 5000" />
          </div>
        </div>

        {/* Mínimo de unidades por variante */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-700">Mínimo de unidades por variante</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Cantidad mínima que hay que agregar de un mismo talle/color para poder sumarlo al carrito (aplica a minoristas y mayoristas). Dejá en 1 para no exigir mínimo.
              Cada producto puede tener su propio mínimo distinto desde su ficha — esto es el valor por defecto.
            </p>
          </div>
          <div className="flex items-center gap-3 max-w-xs">
            <span className="text-sm text-zinc-500 flex-shrink-0">Unidades</span>
            <input
              className="input flex-1"
              type="number"
              min={1}
              step={1}
              value={config?.min_qty_per_variant ?? 1}
              onChange={e => update('min_qty_per_variant', Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
        </div>

        {/* Visibilidad de precios */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-700">Visibilidad de precios</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Quién puede ver los precios en tu tienda</p>
          </div>
          <select className="input max-w-xs" value={config?.price_visibility ?? 'all'} onChange={e => update('price_visibility', e.target.value as any)}>
            <option value="all">Todos (sin login)</option>
            <option value="logged_in">Solo usuarios registrados</option>
            <option value="wholesale_only">Solo clientes mayoristas</option>
          </select>
        </div>

        {/* Registro de cuentas */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-700">Registro de cuentas</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Qué tipo de cuenta puede crearse desde "Crear cuenta" en tu tienda</p>
          </div>
          <select className="input max-w-xs" value={config?.registration_visibility ?? 'both'} onChange={e => update('registration_visibility', e.target.value as any)}>
            <option value="both">Minorista y mayorista</option>
            <option value="retail_only">Solo minorista</option>
            <option value="wholesale_only">Solo mayorista</option>
          </select>
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
            {errorAttrs && <p className="text-xs text-red-600 mt-1.5">{errorAttrs}</p>}
          </div>
          <div className="space-y-3">
            {attributes.map((attr, i) => (
              <div key={i} className="border border-zinc-100 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Nombre del atributo</label>
                      <input className="input text-sm" value={attr.label} onChange={e => updateAttribute(i, 'label', e.target.value)} placeholder="Ej: Talle, Color..." />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Tipo</label>
                      <select className="input text-sm" value={attr.type} onChange={e => updateAttribute(i, 'type', e.target.value as any)}>
                        <option value="text">Texto libre</option>
                        <option value="select">Lista de opciones</option>
                      </select>
                    </div>
                  </div>
                  <button onClick={() => removeAttribute(i)} className="text-zinc-300 hover:text-red-400 transition-colors mt-6 flex-shrink-0"><Trash2 size={15} /></button>
                </div>
                {attr.type === 'select' && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-2">Opciones disponibles</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {(attr.options ?? []).map((opt, optIdx) => (
                        <span key={optIdx} className="inline-flex items-center gap-1 px-2.5 py-1 bg-zinc-100 rounded-full text-xs text-zinc-700">
                          {opt}
                          <button onClick={() => removeOption(i, optIdx)} className="text-zinc-400 hover:text-red-400"><X size={11} /></button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input className="input text-sm flex-1" value={newOption[i] ?? ''} onChange={e => setNewOption(prev => ({ ...prev, [i]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(i) } }} placeholder="Nueva opción..." />
                      <button onClick={() => addOption(i)} className="btn-secondary text-xs px-3 py-1.5 flex-shrink-0"><Plus size={13} /> Agregar</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <button onClick={addAttribute} className="flex items-center gap-2 text-sm text-violet-600 hover:text-violet-700 transition-colors">
            <Plus size={14} /> Agregar atributo
          </button>
        </div>

        {/* Contacto y Redes Sociales */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-700">Contacto y redes sociales</h2>
              <p className="text-xs text-zinc-400 mt-0.5">Se muestran en el footer y la página de contacto de tu tienda</p>
            </div>
            <button onClick={handleSaveContact} disabled={savingContact} className="btn-secondary text-xs py-1.5 disabled:opacity-60">
              {savedContact ? '✓ Guardado' : savingContact ? 'Guardando...' : 'Guardar'}
            </button>
            {errorContact && <p className="text-xs text-red-600 mt-1.5">{errorContact}</p>}
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">WhatsApp</label>
              <input className="input text-sm" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="5491112345678 (sin + ni espacios)" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Instagram</label>
              <input className="input text-sm" value={instagramUrl} onChange={e => setInstagramUrl(e.target.value)} placeholder="https://instagram.com/tutienda" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Facebook</label>
              <input className="input text-sm" value={facebookUrl} onChange={e => setFacebookUrl(e.target.value)} placeholder="https://facebook.com/tutienda" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">TikTok</label>
              <input className="input text-sm" value={tiktokUrl} onChange={e => setTiktokUrl(e.target.value)} placeholder="https://tiktok.com/@tutienda" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Dirección de retiro (visible en la tienda)</label>
              <input className="input text-sm" value={pickupAddress} onChange={e => setPickupAddress(e.target.value)} placeholder="Av. Corrientes 1234, CABA" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Dirección de despacho (aparece en PDFs)</label>
              <input className="input text-sm" value={storeAddress} onChange={e => setStoreAddress(e.target.value)} placeholder="Av. Corrientes 1234, CABA" />
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
          <ToggleRow label="Habilitar MercadoPago" desc="Los clientes podrán pagar con tarjeta, débito y QR" checked={Boolean(config?.mp_enabled)} onChange={v => update('mp_enabled', v)} />
          {config?.mp_enabled && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Access Token de tu cuenta MP</label>
                <input className="input font-mono text-xs" type="password" value={mpToken} onChange={e => setMpToken(e.target.value)} placeholder="APP_USR-... o TEST-..." />
                <p className="text-xs text-zinc-400 mt-1.5">
                  Lo encontrás en{' '}
                  <a href="https://www.mercadopago.com.ar/developers/panel/app" target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline">mercadopago.com.ar/developers</a>
                  {' '}→ Credenciales de producción
                </p>
              </div>
              <button onClick={handleSaveMpToken} disabled={savingMp} className="btn-secondary text-sm disabled:opacity-60">
                {savedMp ? '✓ Token guardado' : savingMp ? 'Guardando...' : 'Guardar token MP'}
              </button>
            {errorMp && <p className="text-xs text-red-600 mt-1.5">{errorMp}</p>}
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

        {/* Métodos de envío */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-700">Métodos de envío</h2>
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
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">$</span>
                    <input type="number" min={0} className="input text-sm pl-6 w-28" placeholder="Precio" value={method.price || ''} onChange={e => setCustomShipping(s => s.map((m, j) => j === i ? { ...m, price: Number(e.target.value) } : m))} />
                  </div>
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
          <p className="text-xs text-zinc-400">Precio $0 para métodos gratuitos. Si cargás transportes, el cliente va a poder elegir uno (o "Otro" y escribir el suyo) al seleccionar ese método. Guardá arriba para aplicar.</p>
        </div>

        {/* PDF */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-700">Configuración de recibos PDF</h2>
              <p className="text-xs text-zinc-400 mt-0.5">Elegí qué datos mostrar en los comprobantes de compra</p>
            </div>
            <button onClick={handleSavePdf} disabled={savingPdf} className="btn-secondary text-xs py-1.5 disabled:opacity-60">
              {savedPdf ? '✓ Guardado' : savingPdf ? 'Guardando...' : 'Guardar PDF'}
            </button>
            {errorPdf && <p className="text-xs text-red-600 mt-1.5">{errorPdf}</p>}
          </div>
          <div className="space-y-1">
            <ToggleRow label="Mostrar variante" desc="Talle, color u otros atributos en la tabla del comprobante" checked={Boolean((config as any)?.pdf_show_variant ?? true)} onChange={v => update('pdf_show_variant' as any, v)} />
            <ToggleRow label="Mostrar tipo de precio" desc="Badge Minorista / Mayorista en cada ítem" checked={Boolean((config as any)?.pdf_show_pricetype ?? true)} onChange={v => update('pdf_show_pricetype' as any, v)} />
            <ToggleRow label="Mostrar dirección" desc="Dirección del comprador y dirección de envío" checked={Boolean((config as any)?.pdf_show_address ?? true)} onChange={v => update('pdf_show_address' as any, v)} />
            <ToggleRow label="Mostrar notas del pedido" desc="El campo de notas que ingresó el cliente" checked={Boolean((config as any)?.pdf_show_notes ?? true)} onChange={v => update('pdf_show_notes' as any, v)} />
          </div>
        </div>

        {/* Emails */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-700">Emails de tu tienda</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Configurá cómo aparecen y a dónde llegan los correos de tu tienda
              </p>
            </div>
            <button onClick={handleSaveEmail} disabled={savingEmail} className="btn-secondary text-xs py-1.5 disabled:opacity-60">
              {savedEmail ? '✓ Guardado' : savingEmail ? 'Guardando...' : 'Guardar emails'}
            </button>
            {errorEmail && <p className="text-xs text-red-600 mt-1.5">{errorEmail}</p>}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">
                Nombre del remitente
              </label>
              <input
                className="input"
                value={emailFromName}
                onChange={e => setEmailFromName(e.target.value)}
                placeholder="Ej: Connors Store, Iruda, Moda Caro..."
              />
              <p className="text-xs text-zinc-400 mt-1">
                El nombre que ven tus clientes en "De:" al recibir un mail de tu tienda.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">
                Email de notificaciones de pedidos
              </label>
              <input
                className="input"
                type="email"
                value={notificationEmail}
                onChange={e => setNotificationEmail(e.target.value)}
                placeholder="Ej: ventas@mitienda.com o tu@gmail.com"
              />
              <p className="text-xs text-zinc-400 mt-1">
                A esta dirección te llega un aviso cada vez que entra un pedido nuevo.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">
                Email de respuesta (reply-to)
              </label>
              <input
                className="input"
                type="email"
                value={replyTo}
                onChange={e => setReplyTo(e.target.value)}
                placeholder="Ej: contacto@mitienda.com"
              />
              <p className="text-xs text-zinc-400 mt-1">
                Si un cliente responde un mail de tu tienda, la respuesta llega acá.
              </p>
            </div>

            {/* Mensajes personalizados */}
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">
                Mensaje en mail de pedido recibido
              </label>
              <textarea
                className="input min-h-[72px] resize-y text-sm"
                value={emailIntroPedidoRecibido}
                onChange={e => setEmailIntroPedidoRecibido(e.target.value)}
                placeholder="Ej: Recibimos tu pedido y lo estamos preparando con cariño. Te avisamos en cuanto esté listo."
              />
              <p className="text-xs text-zinc-400 mt-1">Aparece debajo del saludo en el mail de confirmación de compra.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">
                Mensaje en mail de pedido enviado / listo para retirar
              </label>
              <textarea
                className="input min-h-[72px] resize-y text-sm"
                value={emailIntroPedidoEnviado}
                onChange={e => setEmailIntroPedidoEnviado(e.target.value)}
                placeholder="Ej: Tu pedido ya está en camino. Gracias por elegirnos, esperamos que te encante."
              />
              <p className="text-xs text-zinc-400 mt-1">Aparece en el mail que se envía al marcar un pedido como enviado o listo para retirar.</p>
            </div>

            <div className="bg-zinc-50 rounded-lg p-3 text-xs text-zinc-500 space-y-0.5">
              <p>📨 Los mails salen desde <strong>noreply@gounuri.com</strong> pero con tu nombre de remitente.</p>
              <p>💬 Si querés un dominio propio (ej: @connors.com), contactá a soporte para verificarlo.</p>
            </div>
          </div>
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

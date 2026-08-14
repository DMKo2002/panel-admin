'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Toggle from '@/components/Toggle'
import type { StoreConfig } from '@/lib/types'
import { applyTheme } from '@/components/ThemeProvider'
import { useTutorial, type TutorialStep } from '@/components/tutorial/TutorialProvider'
import TutorialHint from '@/components/tutorial/TutorialHint'
import PageTutorialButton from '@/components/tutorial/PageTutorialButton'

const THEMES = [
  { id: 'default', label: 'Default', preview: { sidebar: 'bg-primary-600', bg: 'bg-zinc-100' } },
  { id: 'dark',    label: 'Dark',    preview: { sidebar: 'bg-zinc-900',   bg: 'bg-zinc-800' } },
]

// Un solo array fuente de verdad: lo usa tanto el tour completo de la página
// (botón (?) del header) como cada botón (?) individual de cada bloque.
const GENERAL_STEPS: TutorialStep[] = [
  {
    id: 'general-theme',
    target: '[data-tutorial="general-theme"]',
    title: 'Tema del panel',
    content: 'Elegí cómo se ve ESTE panel para vos — Default o Dark. Es solo estético: no cambia nada en tu tienda pública ni en lo que ven tus clientes.',
  },
  {
    id: 'general-stock',
    target: '[data-tutorial="general-stock"]',
    title: 'Modo sin stock',
    content: 'Si lo activás, todos tus productos se muestran como disponibles sin importar el stock cargado. Pensado para quienes venden por WhatsApp y no llevan un stock exacto en el sistema.',
  },
  {
    id: 'general-min-order',
    target: '[data-tutorial="general-min-order"]',
    title: 'Pedido mínimo',
    content: 'Definí un monto mínimo de compra para poder finalizar el pedido. Dejalo vacío o en 0 si no querés exigir mínimo. El cartel opcional avisa el mínimo directamente en tu tienda, arriba del catálogo.',
  },
  {
    id: 'general-min-qty',
    target: '[data-tutorial="general-min-qty"]',
    title: 'Mínimo de unidades por variante',
    content: 'Cantidad mínima que hay que sumar de un mismo talle/color para poder agregarlo al carrito — útil para forzar venta por pack o docena. Cada producto puede tener su propio mínimo distinto; esto es el valor por defecto.',
  },
  {
    id: 'general-price-visibility',
    target: '[data-tutorial="general-price-visibility"]',
    title: 'Visibilidad de precios',
    content: 'Controlá quién puede ver los precios en tu tienda: todos sin loguearse, solo usuarios registrados, o solo tus clientes mayoristas.',
  },
  {
    id: 'general-price-types',
    target: '[data-tutorial="general-price-types"]',
    title: 'Tipos de precio',
    content: 'Activá o desactivá los campos de precio al cargar un producto: minorista, mayorista, y el precio rebajado/tachado para mostrar descuentos. Apagá lo que no uses para simplificar la carga de productos.',
  },
  {
    id: 'general-registration',
    target: '[data-tutorial="general-registration"]',
    title: 'Registro de cuentas',
    content: 'Elegí qué tipo de cuenta puede crearse desde "Crear cuenta" en tu tienda: minorista, mayorista, o ambas.',
  },
]

export default function GeneralPage() {
  const supabase = createClient()
  const { registerSteps } = useTutorial()
  const [config, setConfig] = useState<StoreConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [panelTheme, setPanelTheme] = useState<'default' | 'dark'>('default')

  useEffect(() => {
    registerSteps('general', GENERAL_STEPS)
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
      // por columna (tokens de MP/Andreani nunca se otorgan a authenticated/
      // anon), así que un select('*') devuelve 403 y esta página se queda
      // sin datos en silencio. Ver CLAUDE.md, sección de permisos de
      // store_config.
      const { data, error } = await supabase
        .from('store_config')
        .select('id, tenant_id, panel_theme, ignore_stock, min_order_amount, show_min_order_banner, min_qty_per_variant, price_visibility, registration_visibility, enable_retail_pricing, enable_wholesale_pricing, enable_discount_pricing')
        .eq('tenant_id', userRow.tenant_id)
        .single()
      if (error) {
        console.error('Error cargando configuracion general:', error)
        setErrorGeneral('No se pudo cargar la configuración. Recargá la página o contactá a soporte.')
        return
      }
      setConfig(data)
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
    // No se puede apagar minorista y mayorista a la vez — no quedaría ningún
    // precio posible de cargar.
    if (!(config as any).enable_retail_pricing && !(config as any).enable_wholesale_pricing) {
      setErrorGeneral('Tenés que dejar activo al menos un tipo de precio (minorista o mayorista).')
      return
    }
    setSaving(true)
    setErrorGeneral(null)
    const { error } = await supabase.from('store_config').update({
      panel_theme:      panelTheme,
      min_order_amount: config.min_order_amount ?? null,
      show_min_order_banner: (config as any).show_min_order_banner ?? false,
      min_qty_per_variant: config.min_qty_per_variant ?? 1,
      price_visibility: config.price_visibility ?? 'all',
      registration_visibility: config.registration_visibility ?? 'both',
      ignore_stock:     (config as any).ignore_stock ?? false,
      enable_retail_pricing:    (config as any).enable_retail_pricing ?? true,
      enable_wholesale_pricing: (config as any).enable_wholesale_pricing ?? true,
      enable_discount_pricing:  (config as any).enable_discount_pricing ?? true,
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

  return (
    <div>
      <div className="sticky top-0 z-10 px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">General</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Reglas básicas de tu tienda y del panel</p>
          <PageTutorialButton pageKey="general" />
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-60">
          {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        {errorGeneral && <p className="text-xs text-red-600 mt-1.5">{errorGeneral}</p>}
      </div>

      <div className="px-8 py-6 max-w-2xl space-y-5">

        {/* Apariencia del panel */}
        <div data-tutorial="general-theme" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-semibold text-zinc-700">Apariencia del panel</h2>
              <TutorialHint pageKey="general" step={GENERAL_STEPS[0]} />
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Esto solo cambia cómo se ve este panel para vos — no afecta tu tienda. Las imágenes y colores de tu tienda se gestionan en{' '}
              <a href="/dashboard/apariencia" className="text-primary-600 hover:underline">Apariencia</a>.
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
                    panelTheme === t.id ? 'border-primary-500 bg-primary-50' : 'border-zinc-200 hover:border-zinc-300'
                  }`}
                >
                  <div className={`w-full h-10 rounded-md flex overflow-hidden ${t.preview.bg}`}>
                    <div className={`w-8 h-full ${t.preview.sidebar}`} />
                    <div className="flex-1 p-1.5 space-y-1.5">
                      <div className="h-1.5 rounded-full w-3/4 bg-white/40" />
                      <div className="h-1.5 rounded-full w-1/2 bg-white/20" />
                    </div>
                  </div>
                  <p className="text-sm font-medium text-zinc-900">{t.label}</p>
                  {panelTheme === t.id && (
                    <div className="absolute top-2 right-2 w-4 h-4 bg-primary-600 rounded-full flex items-center justify-center">
                      <span className="text-white text-[9px] font-bold">✓</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stock */}
        <div data-tutorial="general-stock" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-3">
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-semibold text-zinc-700">Gestión de stock</h2>
              <TutorialHint pageKey="general" step={GENERAL_STEPS[1]} />
            </div>
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
        <div data-tutorial="general-min-order" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-3">
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-semibold text-zinc-700">Pedido mínimo</h2>
              <TutorialHint pageKey="general" step={GENERAL_STEPS[2]} />
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">Monto mínimo requerido para finalizar la compra. Dejá en 0 para no aplicar.</p>
          </div>
          <div className="flex items-center gap-3 max-w-xs">
            <span className="text-sm text-zinc-500 flex-shrink-0">ARS $</span>
            <input className="input flex-1" type="number" min={0} step={100} value={config?.min_order_amount ?? ''} onChange={e => update('min_order_amount', e.target.value === '' ? null : Number(e.target.value))} placeholder="Ej: 5000" />
          </div>
          <ToggleRow
            label="Mostrar cartel en la tienda"
            desc="Cartel sutil en la tienda con el pedido mínimo. No aparece si el campo de arriba está vacío"
            checked={Boolean((config as any)?.show_min_order_banner)}
            onChange={v => update('show_min_order_banner' as any, v)}
          />
        </div>

        {/* Mínimo de unidades por variante */}
        <div data-tutorial="general-min-qty" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-3">
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-semibold text-zinc-700">Mínimo de unidades por variante</h2>
              <TutorialHint pageKey="general" step={GENERAL_STEPS[3]} />
            </div>
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
        <div data-tutorial="general-price-visibility" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-3">
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-semibold text-zinc-700">Visibilidad de precios</h2>
              <TutorialHint pageKey="general" step={GENERAL_STEPS[4]} />
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">Quién puede ver los precios en tu tienda</p>
          </div>
          <select className="input max-w-xs" value={config?.price_visibility ?? 'all'} onChange={e => update('price_visibility', e.target.value as any)}>
            <option value="all">Todos (sin login)</option>
            <option value="logged_in">Solo usuarios registrados</option>
            <option value="wholesale_only">Solo clientes mayoristas</option>
          </select>
        </div>

        {/* Tipos de precio */}
        <div data-tutorial="general-price-types" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-1">
          <div className="mb-2">
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-semibold text-zinc-700">Tipos de precio</h2>
              <TutorialHint pageKey="general" step={GENERAL_STEPS[5]} />
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">Qué campos de precio aparecen al cargar productos — apagá lo que no uses para que la carga sea más simple</p>
          </div>
          <ToggleRow
            label="Precio minorista"
            desc={(config as any)?.enable_wholesale_pricing === false ? 'No se puede apagar — es el único tipo de precio activo' : 'Campo de precio minorista en cada producto'}
            checked={(config as any)?.enable_retail_pricing ?? true}
            onChange={v => update('enable_retail_pricing' as any, v)}
          />
          <ToggleRow
            label="Precio mayorista"
            desc={(config as any)?.enable_retail_pricing === false ? 'No se puede apagar — es el único tipo de precio activo' : 'Campo de precio mayorista en cada producto'}
            checked={(config as any)?.enable_wholesale_pricing ?? true}
            onChange={v => update('enable_wholesale_pricing' as any, v)}
          />
          <ToggleRow
            label="Precio rebajado (descuento)"
            desc="Campo de precio tachado/rebajado para los tipos de precio activos"
            checked={(config as any)?.enable_discount_pricing ?? true}
            onChange={v => update('enable_discount_pricing' as any, v)}
          />
        </div>

        {/* Registro de cuentas */}
        <div data-tutorial="general-registration" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-3">
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-semibold text-zinc-700">Registro de cuentas</h2>
              <TutorialHint pageKey="general" step={GENERAL_STEPS[6]} />
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">Qué tipo de cuenta puede crearse desde "Crear cuenta" en tu tienda</p>
          </div>
          <select className="input max-w-xs" value={config?.registration_visibility ?? 'both'} onChange={e => update('registration_visibility', e.target.value as any)}>
            <option value="both">Minorista y mayorista</option>
            <option value="retail_only">Solo minorista</option>
            <option value="wholesale_only">Solo mayorista</option>
          </select>
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

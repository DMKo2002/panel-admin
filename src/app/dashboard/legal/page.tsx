'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Toggle from '@/components/Toggle'
import { useTutorial, type TutorialStep } from '@/components/tutorial/TutorialProvider'
import TutorialHint from '@/components/tutorial/TutorialHint'
import PageTutorialButton from '@/components/tutorial/PageTutorialButton'

const LEGAL_STEPS: TutorialStep[] = [
  {
    id: 'legal-terms',
    target: '[data-tutorial="legal-terms"]',
    title: 'Términos y condiciones',
    content: 'Se muestran en la página legal de tu tienda. Si no tenés uno propio, usá el botón "Usar texto predeterminado" como punto de partida y editalo a gusto.',
  },
  {
    id: 'legal-privacy',
    target: '[data-tutorial="legal-privacy"]',
    title: 'Política de privacidad',
    content: 'Explica qué datos de tus clientes recopilás y cómo los usás. También tiene un texto predeterminado que podés adaptar.',
  },
  {
    id: 'legal-cookies',
    target: '[data-tutorial="legal-cookies"]',
    title: 'Política de cookies',
    content: 'Describe el uso de cookies en tu tienda (sesión, carrito, análisis). Igual que las otras dos, podés partir del texto predeterminado.',
  },
  {
    id: 'legal-empresa',
    target: '[data-tutorial="legal-empresa"]',
    title: 'Datos de la empresa',
    content: 'Razón social, CUIT y domicilio legal. Si completás estos datos, aparece un link "Empresa" en el pie de tu tienda. Si lo dejás vacío, no se muestra.',
  },
  {
    id: 'legal-consumer-defense',
    target: '[data-tutorial="legal-consumer-defense"]',
    title: 'Defensa del Consumidor',
    content: 'Agrega un link a Defensa del Consumidor en el pie de tu tienda. Apagado por defecto — vos decidís si lo mostrás.',
  },
]

const DEFAULT_COOKIES = `POLÍTICA DE COOKIES

Este sitio web utiliza cookies para mejorar la experiencia del usuario.

1. QUÉ SON LAS COOKIES
Las cookies son pequeños archivos de texto que los sitios web guardan en tu dispositivo cuando los visitás.

2. QUÉ COOKIES USAMOS
- Cookies técnicas: necesarias para el funcionamiento del sitio (sesión, carrito de compras).
- Cookies de análisis: nos permiten entender cómo se usa el sitio para mejorarlo.
- Cookies de preferencias: recuerdan tus opciones (idioma, moneda, etc.).

3. CÓMO GESTIONAR LAS COOKIES
Podés configurar tu navegador para rechazar cookies, aunque esto puede afectar la funcionalidad del sitio.

4. COOKIES DE TERCEROS
Podemos utilizar servicios de terceros (Google Analytics, MercadoPago) que instalan sus propias cookies. Estos servicios tienen sus propias políticas de privacidad.

5. CONSENTIMIENTO
Al continuar usando este sitio, aceptás el uso de cookies según esta política.`

const DEFAULT_TERMS = `TÉRMINOS Y CONDICIONES

Al realizar una compra en esta tienda, el cliente acepta los siguientes términos y condiciones.

1. PRECIOS Y PAGOS
Los precios están expresados en pesos argentinos (ARS). Nos reservamos el derecho de modificar los precios sin previo aviso. El pago debe realizarse en su totalidad antes del envío del pedido.

2. ENVÍOS
Los plazos de entrega son estimativos y pueden variar según la dirección de destino y el transportista seleccionado. No nos responsabilizamos por demoras ocasionadas por empresas de correo.

3. CAMBIOS Y DEVOLUCIONES
Se aceptan cambios dentro de los 30 días corridos de recibido el producto, siempre que el mismo se encuentre en perfectas condiciones, con su embalaje original y sin uso.

4. PRIVACIDAD
Los datos personales proporcionados serán utilizados exclusivamente para la gestión de pedidos y no serán compartidos con terceros.

5. LEY APLICABLE
Estos términos se rigen por las leyes de la República Argentina.`

const DEFAULT_PRIVACY = `POLÍTICA DE PRIVACIDAD

Esta política describe cómo recopilamos, usamos y protegemos tu información personal.

1. DATOS QUE RECOPILAMOS
Nombre y apellido, dirección de correo electrónico, número de teléfono, dirección de entrega y datos de pago (procesados de forma segura por el proveedor de pagos).

2. USO DE LA INFORMACIÓN
Usamos tus datos para procesar pedidos, enviarte confirmaciones de compra, responder consultas y mejorar nuestros servicios.

3. COMPARTIR INFORMACIÓN
No vendemos ni compartimos tu información con terceros, excepto con los transportistas necesarios para entregar tu pedido.

4. SEGURIDAD
Implementamos medidas de seguridad para proteger tu información personal contra acceso no autorizado.

5. COOKIES
Este sitio puede utilizar cookies para mejorar la experiencia de usuario. Podés deshabilitarlas desde la configuración de tu navegador.

6. CONTACTO
Si tenés preguntas sobre esta política, podés contactarnos a través de los medios indicados en el footer del sitio.`

export default function LegalPage() {
  const supabase = createClient()
  const { registerSteps } = useTutorial()
  const [configId, setConfigId] = useState<string | null>(null)
  const [terms, setTerms] = useState('')
  const [privacy, setPrivacy] = useState('')
  const [cookies, setCookies] = useState('')
  const [consumerDefenseEnabled, setConsumerDefenseEnabled] = useState(false)
  const [sellerLegalName, setSellerLegalName] = useState('')
  const [sellerCuit, setSellerCuit] = useState('')
  const [sellerLegalAddress, setSellerLegalAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)

  useEffect(() => {
    registerSteps('legal', LEGAL_STEPS)
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
        .select('id, terms_and_conditions, privacy_policy, cookies_policy, consumer_defense_enabled, seller_legal_name, seller_cuit, seller_legal_address')
        .eq('tenant_id', userRow.tenant_id)
        .single()
      if (error) {
        console.error('Error cargando textos legales:', error)
        setErrorGeneral('No se pudo cargar la configuración. Recargá la página o contactá a soporte.')
        return
      }
      if (data) {
        setConfigId(data.id)
        setTerms((data as any).terms_and_conditions ?? '')
        setPrivacy((data as any).privacy_policy ?? '')
        setCookies((data as any).cookies_policy ?? '')
        setConsumerDefenseEnabled(Boolean((data as any).consumer_defense_enabled))
        setSellerLegalName((data as any).seller_legal_name ?? '')
        setSellerCuit((data as any).seller_cuit ?? '')
        setSellerLegalAddress((data as any).seller_legal_address ?? '')
      }
    }
    load()
  }, [])

  async function handleSave() {
    if (!configId) return
    setSaving(true)
    setErrorGeneral(null)
    const { error } = await supabase.from('store_config').update({
      terms_and_conditions: terms   || null,
      privacy_policy:       privacy || null,
      cookies_policy:       cookies || null,
      consumer_defense_enabled: consumerDefenseEnabled,
      seller_legal_name:    sellerLegalName    || null,
      seller_cuit:          sellerCuit          || null,
      seller_legal_address: sellerLegalAddress  || null,
    }).eq('id', configId)
    setSaving(false)
    if (error) {
      console.error('Error guardando textos legales:', error)
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
          <h1 className="text-xl font-semibold text-zinc-900">Legal</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Textos que aparecen en las páginas legales de tu tienda</p>
          <PageTutorialButton pageKey="legal" />
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-60">
          {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        {errorGeneral && <p className="text-xs text-red-600 mt-1.5">{errorGeneral}</p>}
      </div>

      <div className="px-8 py-6 max-w-2xl space-y-5">
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-5">
          <div data-tutorial="legal-terms">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <label className="block text-xs font-medium text-zinc-600">Términos y condiciones</label>
                <TutorialHint pageKey="legal" step={LEGAL_STEPS[0]} />
              </div>
              {!terms && (
                <button onClick={() => setTerms(DEFAULT_TERMS)} className="text-xs text-primary-600 hover:text-primary-700">
                  Usar texto predeterminado
                </button>
              )}
            </div>
            <textarea
              className="input min-h-[180px] font-mono text-xs leading-relaxed resize-y"
              value={terms}
              onChange={e => setTerms(e.target.value)}
              placeholder="Escribí acá los términos y condiciones de tu tienda..."
            />
          </div>
          <div data-tutorial="legal-privacy">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <label className="block text-xs font-medium text-zinc-600">Política de privacidad</label>
                <TutorialHint pageKey="legal" step={LEGAL_STEPS[1]} />
              </div>
              {!privacy && (
                <button onClick={() => setPrivacy(DEFAULT_PRIVACY)} className="text-xs text-primary-600 hover:text-primary-700">
                  Usar texto predeterminado
                </button>
              )}
            </div>
            <textarea
              className="input min-h-[180px] font-mono text-xs leading-relaxed resize-y"
              value={privacy}
              onChange={e => setPrivacy(e.target.value)}
              placeholder="Escribí acá la política de privacidad de tu tienda..."
            />
          </div>
          <div data-tutorial="legal-cookies">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <label className="block text-xs font-medium text-zinc-600">Política de cookies</label>
                <TutorialHint pageKey="legal" step={LEGAL_STEPS[2]} />
              </div>
              {!cookies && (
                <button onClick={() => setCookies(DEFAULT_COOKIES)} className="text-xs text-primary-600 hover:text-primary-700">
                  Usar texto predeterminado
                </button>
              )}
            </div>
            <textarea
              className="input min-h-[160px] font-mono text-xs leading-relaxed resize-y"
              value={cookies}
              onChange={e => setCookies(e.target.value)}
              placeholder="Política de cookies de tu tienda..."
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4" data-tutorial="legal-empresa">
          <div className="flex items-center gap-1.5">
            <div>
              <p className="text-sm text-zinc-800">Datos de la empresa</p>
              <p className="text-xs text-zinc-400 mt-0.5">Completá estos datos para mostrar el link "Empresa" en el pie de tu tienda (Res. 424/2020). Si dejás todo vacío, el link no se muestra.</p>
            </div>
            <TutorialHint pageKey="legal" step={LEGAL_STEPS[3]} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">Razón social</label>
            <input
              type="text"
              className="input"
              value={sellerLegalName}
              onChange={e => setSellerLegalName(e.target.value)}
              placeholder="Ej: Mi Empresa S.R.L."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">CUIT</label>
            <input
              type="text"
              className="input"
              value={sellerCuit}
              onChange={e => setSellerCuit(e.target.value)}
              placeholder="Ej: 30-12345678-9"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">Domicilio legal</label>
            <input
              type="text"
              className="input"
              value={sellerLegalAddress}
              onChange={e => setSellerLegalAddress(e.target.value)}
              placeholder="Ej: Av. Siempre Viva 123, CABA"
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-5" data-tutorial="legal-consumer-defense">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div>
                <p className="text-sm text-zinc-800">Defensa del Consumidor</p>
                <p className="text-xs text-zinc-400 mt-0.5">Agrega un link a Defensa del Consumidor en el pie de tu tienda (URL nacional fija, no editable)</p>
              </div>
              <TutorialHint pageKey="legal" step={LEGAL_STEPS[4]} />
            </div>
            <Toggle checked={consumerDefenseEnabled} onChange={setConsumerDefenseEnabled} />
          </div>
        </div>
      </div>
    </div>
  )
}

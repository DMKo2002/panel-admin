'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Toggle from '@/components/Toggle'
import { MessageCircle, Mail, CheckCircle, XCircle, Clock } from 'lucide-react'
import type { StoreConfig, NotificationLog } from '@/lib/types'
import { useTutorial, type TutorialStep } from '@/components/tutorial/TutorialProvider'
import TutorialHint from '@/components/tutorial/TutorialHint'
import PageTutorialButton from '@/components/tutorial/PageTutorialButton'

const NOTIFICACIONES_STEPS: TutorialStep[] = [
  {
    id: 'notif-channels',
    target: '[data-tutorial="notif-channels"]',
    title: 'Canales de notificación',
    content: 'El WhatsApp se edita en Contacto y Redes — acá solo se muestra de referencia. El email de notificaciones es a donde te llegan los avisos cuando marcás las opciones de abajo.',
  },
  {
    id: 'notif-when',
    target: '[data-tutorial="notif-when"]',
    title: '¿Cuándo notificar?',
    content: 'Elegí qué avisos querés recibir y por qué canal: pedido nuevo (WhatsApp y/o email), stock bajo, y recordatorio de transferencia pendiente después de 24hs sin confirmar el pago.',
  },
  {
    id: 'notif-email',
    target: '[data-tutorial="notif-email"]',
    title: 'Identidad y mensajes de email',
    content: 'Configurá cómo aparecen tus mails: el nombre de remitente que ve el cliente, el email de respuesta (reply-to), y los mensajes personalizados que se muestran al confirmar un pedido o al marcarlo como enviado.',
  },
  {
    id: 'notif-log',
    target: '[data-tutorial="notif-log"]',
    title: 'Últimas notificaciones',
    content: 'Acá ves el historial de las últimas notificaciones enviadas, con su estado: enviado, pendiente o falló.',
  },
]

export default function NotificacionesPage() {
  const supabase = createClient()
  const { registerSteps } = useTutorial()

  useEffect(() => {
    registerSteps('notificaciones', NOTIFICACIONES_STEPS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [config, setConfig] = useState<StoreConfig | null>(null)
  const [logs, setLogs] = useState<NotificationLog[]>([])

  const [savingChannels, setSavingChannels] = useState(false)
  const [savedChannels, setSavedChannels] = useState(false)

  const [emailFromName, setEmailFromName] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [emailIntroPedidoRecibido, setEmailIntroPedidoRecibido] = useState('')
  const [emailIntroPedidoEnviado, setEmailIntroPedidoEnviado] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  const [savedEmail, setSavedEmail] = useState(false)
  const [errorEmail, setErrorEmail] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: _userRows } = await supabase.from('users').select('tenant_id').eq('id', user.id).limit(1)
      const userRow = _userRows?.[0]
      if (!userRow) return

      const [{ data: cfg }, { data: notifLogs }] = await Promise.all([
        supabase.from('store_config').select('*').eq('tenant_id', userRow.tenant_id).single(),
        supabase.from('notifications_log').select('*').eq('tenant_id', userRow.tenant_id).order('sent_at', { ascending: false }).limit(20),
      ])

      setConfig(cfg)
      setLogs(notifLogs ?? [])
      if (cfg) {
        setEmailFromName((cfg as any).email_from_name ?? '')
        setReplyTo((cfg as any).reply_to ?? '')
        setEmailIntroPedidoRecibido((cfg as any).email_intro_pedido_recibido ?? '')
        setEmailIntroPedidoEnviado((cfg as any).email_intro_pedido_enviado ?? '')
      }
    }
    load()
  }, [])

  async function handleSaveChannels() {
    if (!config) return
    setSavingChannels(true)
    await supabase.from('store_config').update({
      notification_email: config.notification_email,
      notify_wa_new_order: config.notify_wa_new_order,
      notify_email_new_order: config.notify_email_new_order,
      notify_wa_low_stock: config.notify_wa_low_stock,
      notify_wa_pending_transfer: config.notify_wa_pending_transfer,
    }).eq('id', config.id)
    setSavingChannels(false)
    setSavedChannels(true)
    setTimeout(() => setSavedChannels(false), 2000)
  }

  async function handleSaveEmail() {
    if (!config) return
    setSavingEmail(true)
    setErrorEmail(null)
    const { error } = await supabase.from('store_config').update({
      email_from_name:    emailFromName.trim() || null,
      reply_to:           replyTo.trim()        || null,
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

  function update(field: keyof StoreConfig, value: any) {
    setConfig(c => c ? { ...c, [field]: value } : c)
  }

  function formatDate(d: string) {
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
    if (diff < 1) return 'ahora'
    if (diff < 60) return `hace ${diff} min`
    if (diff < 1440) return `hace ${Math.floor(diff / 60)} hs`
    return new Date(d).toLocaleDateString('es-AR')
  }

  return (
    <div>
      <div className="sticky top-0 z-10 px-8 py-6 border-b border-zinc-200 bg-white">
        <h1 className="text-xl font-semibold text-zinc-900">Notificaciones</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Configurá cómo te avisamos de cada venta</p>
        <PageTutorialButton pageKey="notificaciones" />
      </div>

      <div className="px-8 py-6 grid grid-cols-5 gap-6">

        {/* Config */}
        <div className="col-span-3 space-y-5">
          <div data-tutorial="notif-channels" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-semibold text-zinc-700">Canales de notificación</h2>
                <TutorialHint pageKey="notificaciones" step={NOTIFICACIONES_STEPS[0]} />
              </div>
              <button onClick={handleSaveChannels} disabled={savingChannels} className="btn-secondary text-xs py-1.5 disabled:opacity-60">
                {savedChannels ? '✓ Guardado' : savingChannels ? 'Guardando...' : 'Guardar canales'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  <MessageCircle size={14} className="inline mr-1 text-green-500" />
                  Número de WhatsApp
                </label>
                <p className="input text-sm bg-zinc-50 text-zinc-500 flex items-center">
                  {config?.whatsapp_number || 'No configurado'}
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  Se edita en <a href="/dashboard/contacto" className="text-primary-600 hover:underline">Contacto y Redes</a>
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  <Mail size={14} className="inline mr-1 text-blue-500" />
                  Email de notificaciones
                </label>
                <input
                  className="input"
                  type="email"
                  value={config?.notification_email ?? ''}
                  onChange={e => update('notification_email', e.target.value)}
                  placeholder="tu@email.com"
                />
                <p className="text-xs text-zinc-400 mt-1">A esta dirección te llega un aviso cada vez que entra un pedido nuevo.</p>
              </div>
            </div>
          </div>

          <div data-tutorial="notif-when" className="bg-white rounded-xl border border-zinc-200 p-5">
            <div className="flex items-center gap-1.5 mb-4">
              <h2 className="text-sm font-semibold text-zinc-700">¿Cuándo notificar?</h2>
              <TutorialHint pageKey="notificaciones" step={NOTIFICACIONES_STEPS[1]} />
            </div>
            <div className="space-y-1">
              {[
                { field: 'notify_wa_new_order', label: 'WhatsApp al recibir un pedido', desc: 'Mensaje instantáneo con el detalle del pedido', icon: <MessageCircle size={14} className="text-green-500" /> },
                { field: 'notify_email_new_order', label: 'Email al recibir un pedido', desc: 'Copia completa del pedido al email configurado', icon: <Mail size={14} className="text-blue-500" /> },
                { field: 'notify_wa_low_stock', label: 'Alerta de stock bajo por WhatsApp', desc: 'Cuando un producto baja del umbral configurado', icon: <MessageCircle size={14} className="text-green-500" /> },
                { field: 'notify_wa_pending_transfer', label: 'Recordatorio de transferencia pendiente', desc: 'Aviso 24hs después si no se confirmó el pago', icon: <MessageCircle size={14} className="text-green-500" /> },
              ].map(row => (
                <div key={row.field} className="flex items-center justify-between py-3 border-b border-zinc-50 last:border-0">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5">{row.icon}</span>
                    <div>
                      <p className="text-sm text-zinc-800">{row.label}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">{row.desc}</p>
                    </div>
                  </div>
                  <Toggle
                    checked={Boolean(config?.[row.field as keyof StoreConfig])}
                    onChange={val => update(row.field as keyof StoreConfig, val)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Identidad y mensajes de email */}
          <div data-tutorial="notif-email" className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <h2 className="text-sm font-semibold text-zinc-700">Identidad y mensajes de email</h2>
                  <TutorialHint pageKey="notificaciones" step={NOTIFICACIONES_STEPS[2]} />
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">Cómo aparecen y qué dicen los correos de tu tienda</p>
              </div>
              <button onClick={handleSaveEmail} disabled={savingEmail} className="btn-secondary text-xs py-1.5 disabled:opacity-60">
                {savedEmail ? '✓ Guardado' : savingEmail ? 'Guardando...' : 'Guardar emails'}
              </button>
              {errorEmail && <p className="text-xs text-red-600 mt-1.5">{errorEmail}</p>}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Nombre del remitente</label>
                <input
                  className="input"
                  value={emailFromName}
                  onChange={e => setEmailFromName(e.target.value)}
                  placeholder="Ej: Connors Store, Iruda, Moda Caro..."
                />
                <p className="text-xs text-zinc-400 mt-1">El nombre que ven tus clientes en "De:" al recibir un mail de tu tienda.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Email de respuesta (reply-to)</label>
                <input
                  className="input"
                  type="email"
                  value={replyTo}
                  onChange={e => setReplyTo(e.target.value)}
                  placeholder="Ej: contacto@mitienda.com"
                />
                <p className="text-xs text-zinc-400 mt-1">Si un cliente responde un mail de tu tienda, la respuesta llega acá.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Mensaje en mail de pedido recibido</label>
                <textarea
                  className="input min-h-[72px] resize-y text-sm"
                  value={emailIntroPedidoRecibido}
                  onChange={e => setEmailIntroPedidoRecibido(e.target.value)}
                  placeholder="Ej: Recibimos tu pedido y lo estamos preparando con cariño. Te avisamos en cuanto esté listo."
                />
                <p className="text-xs text-zinc-400 mt-1">Aparece debajo del saludo en el mail de confirmación de compra.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Mensaje en mail de pedido enviado / listo para retirar</label>
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

        {/* Log */}
        <div data-tutorial="notif-log" className="col-span-2">
          <div className="flex items-center gap-1.5 mb-3">
            <h2 className="text-sm font-semibold text-zinc-700">Últimas notificaciones</h2>
            <TutorialHint pageKey="notificaciones" step={NOTIFICACIONES_STEPS[3]} />
          </div>
          <div className="space-y-2">
            {logs.map(log => (
              <div key={log.id} className="bg-white rounded-xl border border-zinc-200 p-3 flex items-start gap-3">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  log.channel === 'whatsapp' ? 'bg-green-50' : 'bg-blue-50'
                }`}>
                  {log.channel === 'whatsapp'
                    ? <MessageCircle size={14} className="text-green-600" />
                    : <Mail size={14} className="text-blue-600" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-zinc-800 truncate">{log.subject ?? 'Notificación'}</p>
                  <p className="text-xs text-zinc-400 truncate">{log.recipient}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {log.status === 'sent'
                    ? <CheckCircle size={13} className="text-emerald-500" />
                    : log.status === 'failed'
                    ? <XCircle size={13} className="text-red-400" />
                    : <Clock size={13} className="text-amber-400" />
                  }
                  <span className="text-[10px] text-zinc-400">{formatDate(log.sent_at)}</span>
                </div>
              </div>
            ))}
            {logs.length === 0 && (
              <div className="bg-white rounded-xl border border-zinc-200 p-6 text-center text-zinc-400 text-sm">
                Aún no se enviaron notificaciones
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

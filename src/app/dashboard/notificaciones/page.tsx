'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Toggle from '@/components/Toggle'
import { MessageCircle, Mail, CheckCircle, XCircle, Clock } from 'lucide-react'
import type { StoreConfig, NotificationLog } from '@/lib/types'

export default function NotificacionesPage() {
  const supabase = createClient()
  const [config, setConfig] = useState<StoreConfig | null>(null)
  const [logs, setLogs] = useState<NotificationLog[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      if (!userRow) return

      const [{ data: cfg }, { data: notifLogs }] = await Promise.all([
        supabase.from('store_config').select('*').eq('tenant_id', userRow.tenant_id).single(),
        supabase.from('notifications_log').select('*').eq('tenant_id', userRow.tenant_id).order('sent_at', { ascending: false }).limit(20),
      ])

      setConfig(cfg)
      setLogs(notifLogs ?? [])
    }
    load()
  }, [])

  async function handleSave() {
    if (!config) return
    setSaving(true)
    await supabase.from('store_config').update({
      whatsapp_number: config.whatsapp_number,
      notification_email: config.notification_email,
      notify_wa_new_order: config.notify_wa_new_order,
      notify_email_new_order: config.notify_email_new_order,
      notify_wa_low_stock: config.notify_wa_low_stock,
      notify_wa_pending_transfer: config.notify_wa_pending_transfer,
    }).eq('id', config.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
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
      <div className="px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Notificaciones</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Configurá cómo te avisamos de cada venta</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-60">
          {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      <div className="px-8 py-6 grid grid-cols-5 gap-6">

        {/* Config */}
        <div className="col-span-3 space-y-5">
          <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-zinc-700">Canales de notificación</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  <MessageCircle size={14} className="inline mr-1 text-green-500" />
                  Número de WhatsApp
                </label>
                <input
                  className="input"
                  value={config?.whatsapp_number ?? ''}
                  onChange={e => update('whatsapp_number', e.target.value)}
                  placeholder="+54 9 11 XXXX-XXXX"
                />
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
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-zinc-200 p-5">
            <h2 className="text-sm font-semibold text-zinc-700 mb-4">¿Cuándo notificar?</h2>
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
        </div>

        {/* Log */}
        <div className="col-span-2">
          <h2 className="text-sm font-semibold text-zinc-700 mb-3">Últimas notificaciones</h2>
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

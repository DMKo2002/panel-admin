// GET /api/config/email-identidad — trae los datos de identidad de email del
// tenant (nombre de remitente, reply-to, textos de intro).
//
// Estos campos son privados por diseño (el CLAUDE.md del proyecto los lista
// explícitamente como "nunca deben tener GRANT a anon/authenticated") — a
// diferencia de mp_access_token, SÍ es correcto que el propio dueño del
// tenant los vea (son su configuración, no una credencial). Lo que había mal
// no era que se mostraran, era que el permiso de lectura era de toda la
// tabla, exponiendo estos campos de CUALQUIER tenant a CUALQUIER usuario
// logueado. Por eso esta ruta filtra por tenant y usa el service client.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const service = createServiceClient()
  const { data: _userRows } = await service.from('users').select('tenant_id').eq('id', user.id).limit(1)
  const tenantId = _userRows?.[0]?.tenant_id
  if (!tenantId) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

  const { data: _rows } = await service
    .from('store_config')
    .select('email_from_name, reply_to, email_intro_pedido_recibido, email_intro_pedido_enviado')
    .eq('tenant_id', tenantId)
    .limit(1)

  const cfg = _rows?.[0] ?? {}
  return NextResponse.json({
    emailFromName: cfg.email_from_name ?? '',
    replyTo: cfg.reply_to ?? '',
    emailIntroPedidoRecibido: cfg.email_intro_pedido_recibido ?? '',
    emailIntroPedidoEnviado: cfg.email_intro_pedido_enviado ?? '',
  })
}

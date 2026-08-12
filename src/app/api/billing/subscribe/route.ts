// POST /api/billing/subscribe — inicia el upgrade de plan.
// Body: { plan: 'mini' | 'standard' | 'premium' }
// Devuelve { init_point } para redirigir al checkout de MP donde el tenant
// carga su tarjeta (el registro gratis nunca pide tarjeta — solo acá).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createPreapproval, billingEnabled } from '@/lib/billing'

export async function POST(req: Request) {
  if (!billingEnabled()) {
    return NextResponse.json({ error: 'La facturación todavía no está habilitada' }, { status: 403 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { plan, payerEmail: payerEmailInput } = await req.json()
  if (plan !== 'mini' && plan !== 'standard' && plan !== 'premium') {
    return NextResponse.json({ error: 'Plan inválido' }, { status: 400 })
  }

  // El email que autoriza en MP no tiene por qué ser el email de login del
  // Panel Admin — son cosas distintas (ver incidente 2026-08-12: el owner
  // logueado con un email quería pagar con una cuenta de MP de otro email, y
  // MP rechazaba todo con "el email no coincide con el de la suscripción").
  // Por eso el frontend puede mandar el email real de la cuenta de MP que se
  // va a usar; si no lo manda, se cae al email de login como antes.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const payerEmail = typeof payerEmailInput === 'string' && EMAIL_RE.test(payerEmailInput.trim())
    ? payerEmailInput.trim()
    : user.email

  const service = createServiceClient()
  const { data: _rows } = await service.from('users').select('tenant_id, role').eq('id', user.id).limit(1)
  const userRow = _rows?.[0]
  if (!userRow?.tenant_id) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
  if (userRow.role === 'staff') return NextResponse.json({ error: 'Solo el owner puede cambiar el plan' }, { status: 403 })

  try {
    const origin = new URL(req.url).origin
    const preapproval = await createPreapproval({
      tenantId: userRow.tenant_id,
      planId: plan,
      payerEmail,
      backUrl: `${origin}/dashboard/uso?sub=pendiente`,
    })
    // Guardar el id ya mismo — el webhook confirma la activación después
    await service.from('tenants').update({ mp_preapproval_id: preapproval.id }).eq('id', userRow.tenant_id)
    return NextResponse.json({ init_point: preapproval.init_point })
  } catch (e) {
    console.error('[billing/subscribe]', e)
    return NextResponse.json({ error: 'No se pudo iniciar la suscripción. Probá de nuevo.' }, { status: 500 })
  }
}

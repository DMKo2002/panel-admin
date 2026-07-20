import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sendEmail, emailBienvenidaTenant } from '@/lib/email'

export async function POST(req: Request) {
  // Verificar que el usuario está autenticado
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { name, domain, template } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

  // Usar service role para bypass de RLS
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Crear tenant
  const slug = name.trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    + '-' + Date.now().toString().slice(-4)

  const validTemplates = ['minimalista', 'mono', 'atelier', 'axis']
  const chosenTemplate = validTemplates.includes(template) ? template : 'minimalista'

  const { data: tenant, error: tenantError } = await serviceClient
    .from('tenants')
    .insert({ slug, name: name.trim(), domain: domain?.trim() || null, plan: 'basic', status: 'pending', template: chosenTemplate })
    .select()
    .single()

  if (tenantError) return NextResponse.json({ error: tenantError.message }, { status: 500 })

  // Crear store_config con atributos por defecto
  const { error: configError } = await serviceClient
    .from('store_config')
    .insert({
      tenant_id: tenant.id,
      variant_attributes: [
        { key: 'talle', label: 'Talle', type: 'select', options: ['XS','S','M','L','XL','XXL'] },
        { key: 'color', label: 'Color', type: 'text' },
      ],
      mp_enabled: true,
      transfer_enabled: true,
      pickup_enabled: true,
    })

  if (configError) return NextResponse.json({ error: configError.message }, { status: 500 })

  // Vincular usuario al tenant (con service role, sin RLS)
  const { error: userError } = await serviceClient
    .from('users')
    .upsert(
      { id: user.id, email: user.email, tenant_id: tenant.id, role: 'owner' },
      { onConflict: 'id' }
    )

  if (userError) return NextResponse.json({ error: userError.message }, { status: 500 })

  // Notificar al admin
  try {
    const adminEmail = process.env.ADMIN_EMAIL ?? 'dmko2002@gmail.com'
    const resendKey  = process.env.RESEND_API_KEY
    if (resendKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'gounuri Panel <onboarding@resend.dev>',
          to: [adminEmail],
          subject: `🆕 Nuevo tenant: ${name.trim()}`,
          html: `
            <h2>Nuevo tenant registrado</h2>
            <p><strong>Email:</strong> ${user.email}</p>
            <p><strong>Tienda:</strong> ${name.trim()}</p>
            <p><strong>Tenant ID:</strong> <code>${tenant.id}</code></p>
            <p>Para activar:</p>
            <pre>UPDATE tenants SET status = 'active' WHERE id = '${tenant.id}';</pre>
          `,
        }),
      })
    }
  } catch (e) {
    console.warn('notify failed:', e)
  }

  // Email de bienvenida al tenant (no bloqueante)
  if (user.email) {
    const panelUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://panel.gounuri.com'
    sendEmail({
      to: user.email,
      subject: `¡Tu tienda ${name.trim()} está lista! — gounuri`,
      html: emailBienvenidaTenant({ tenantName: name.trim(), email: user.email, panelUrl }),
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true, tenantId: tenant.id })
}

import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sendEmail, emailBienvenidaTenant } from '@/lib/email'
import { PLANS, TRIAL_DAYS } from '@/lib/plans'
import { addDomainToProject } from '@/lib/vercel'

export async function POST(req: Request) {
  // Verificar que el usuario está autenticado
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { name, domain, template, plan } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

  // Usar service role para bypass de RLS
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Crear tenant \u2014 el slug es literalmente {slug}.gounuri.com, antes ac\u00e1 se
  // le pegaba siempre un sufijo random de 4 d\u00edgitos sin chequear si el
  // nombre limpio ya estaba libre. Ahora se usa el nombre limpio y si ya
  // existe se avisa (ver chequeo m\u00e1s abajo) en vez de generar uno random.
  const slug = name.trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    || 'tienda'

  const { data: _slugTaken } = await serviceClient.from('tenants').select('id').eq('slug', slug).limit(1)
  if (_slugTaken?.[0]) {
    return NextResponse.json(
      { error: `El nombre "${name.trim()}" ya est\u00e1 en uso. Prob\u00e1 con otro nombre para tu tienda.` },
      { status: 409 }
    )
  }

  const validTemplates = ['minimalista', 'mono', 'atelier', 'axis', 'glow', 'bazaar']
  const chosenTemplate = validTemplates.includes(template) ? template : 'minimalista'

  // Modelo trial (2026-07-31): self-serve, tienda activa de entrada con
  // 7 días gratis del plan elegido — la suspensión la maneja el cron.
  const chosenPlan = plan && plan in PLANS && plan !== 'free' ? plan : 'standard'
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString()

  const { data: tenant, error: tenantError } = await serviceClient
    .from('tenants')
    .insert({
      slug,
      name: name.trim(),
      domain: domain?.trim() || null,
      plan: chosenPlan,
      plan_status: 'trial',
      trial_ends_at: trialEndsAt,
      status: 'active',
      template: chosenTemplate,
    })
    .select()
    .single()

  if (tenantError) {
    if (tenantError.code === '23505') {
      return NextResponse.json(
        { error: `El nombre "${name.trim()}" ya está en uso. Probá con otro nombre para tu tienda.` },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: tenantError.message }, { status: 500 })
  }

  // Glow y Bazaar son templates de rubros que en general no manejan talle/
  // color y usan foto de producto cuadrada — fotos 1:1 en vez del default de
  // indumentaria (2:3). Ver mismo criterio en
  // gounuri-web/src/app/api/create-tenant/route.ts.
  //
  // (2026-08-27) Antes arrancaban en variant_mode='simple' (sin tabla de
  // variantes para nada — ni siquiera la tabla libre). En la práctica los
  // rubros que eligen estos templates (comida, productos por peso/cantidad,
  // etc.) sí necesitan una tabla — la piden manualmente en Catálogo apenas
  // arrancan (caso real: HAEJIN-HAEJIN, bazaar). Ahora arrancan directo con
  // la tabla libre activada (variant_column_type='text') y los ejes ya
  // nombrados con el caso de uso más común de estos rubros — el tenant
  // puede cambiar los nombres de fila/columna en Catálogo en cualquier
  // momento si no le sirven.
  const isSimpleTemplate = chosenTemplate === 'glow' || chosenTemplate === 'bazaar'

  // Crear store_config con atributos por defecto
  const { error: configError } = await serviceClient
    .from('store_config')
    .insert({
      tenant_id: tenant.id,
      variant_attributes: isSimpleTemplate ? [] : [
        { key: 'talle', label: 'Talle', type: 'select', options: ['XS','S','M','L','XL','XXL'] },
        { key: 'color', label: 'Color', type: 'text' },
      ],
      variant_mode: 'sizes_colors',
      variant_column_type: isSimpleTemplate ? 'text' : 'color',
      variant_row_label: isSimpleTemplate ? 'Cantidad' : null,
      variant_column_label: isSimpleTemplate ? 'Peso' : null,
      product_image_ratio: isSimpleTemplate ? '1:1' : '2:3',
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

  // Alta de {slug}.gounuri.com en el proyecto de Vercel del template — sin
  // esto la URL de respaldo del tenant no resuelve (ver lib/vercel.ts).
  // Best-effort: no frena la creación del tenant si falla.
  try {
    await addDomainToProject(chosenTemplate, `${slug}.gounuri.com`)
  } catch (e) {
    console.error('[create-tenant] no se pudo dar de alta el dominio en Vercel', e)
  }

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
            <p><strong>Plan:</strong> ${chosenPlan} (trial hasta ${trialEndsAt.slice(0, 10)}) · <strong>Template:</strong> ${chosenTemplate}</p>
            <p><strong>Tenant ID:</strong> <code>${tenant.id}</code></p>
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

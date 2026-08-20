// POST /api/auth/registro — alta self-serve DIRECTO en panel.gounuri.com
// (2026-08-20). Antes /registro redirigía a gounuri.com/registro — se trae
// acá para que todo el flujo (registro → confirmar mail → onboarding →
// dashboard) quede en un solo dominio, sin rebotar a gounuri.com.
//
// Mismo patrón que usaba gounuri-web: admin.generateLink(type:'signup') en
// vez de supabase.auth.signUp() desde el browser, para controlar nosotros
// el contenido del mail de confirmación (Resend, ver lib/email.ts) y no
// depender del mailer genérico de Supabase. La cuenta queda SIN sesión
// hasta que confirman el mail (ver /auth/verificar + /api/auth/confirmar).
//
// A diferencia de gounuri-web (que comparte auth.users con TODAS las tiendas
// de los tenants, y por eso necesita gounuri_accounts + el caso "vincular
// cuenta existente"), acá el registro es específicamente para dueños de
// tienda: si el mail ya existe en auth.users, alcanza con pedirle que
// inicie sesión — no hay un caso de "ya es cliente de alguna tienda con
// este mail" que resolver del lado de Panel Admin.
//
// Trial: NO se crea el tenant acá — eso pasa recién en /onboarding
// (POST /api/create-tenant) una vez que el usuario confirmó el mail y eligió
// nombre + template. Ver TRIAL_DAYS en lib/plans.ts.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, emailConfirmacionRegistro } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password, confirmar } = body

    if (!email?.trim() || !password)
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
    if (password !== confirmar)
      return NextResponse.json({ error: 'Las contraseñas no coinciden' }, { status: 400 })
    if (password.length < 8)
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 })

    const normalizedEmail = String(email).trim().toLowerCase()
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
    const siteUrl = host ? `https://${host}` : (process.env.NEXT_PUBLIC_APP_URL ?? 'https://panel.gounuri.com')

    const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
      type: 'signup',
      email: normalizedEmail,
      password,
      options: {
        redirectTo: `${siteUrl}/auth/verificar`,
      },
    })

    if (linkError) {
      const msg = linkError.message ?? ''
      const yaExiste = msg.includes('already registered') || msg.includes('email_exists') || msg.includes('already been registered')
      if (yaExiste) {
        return NextResponse.json(
          { error: 'Ya existe una cuenta con ese email. Iniciá sesión, o recuperá tu contraseña si no la recordás.' },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: linkError.message }, { status: 400 })
    }
    if (!linkData?.user) {
      return NextResponse.json({ error: 'Error al crear la cuenta. Intentá de nuevo.' }, { status: 500 })
    }

    // hashed_token + nuestra propia URL de verificación → todo server-side,
    // sin depender del action_link de Supabase (llega con tokens en el hash
    // de la URL, que un route handler no puede leer).
    const hashedToken = linkData.properties?.hashed_token
    const confirmationUrl = hashedToken
      ? `${siteUrl}/auth/verificar?token_hash=${encodeURIComponent(hashedToken)}&type=signup`
      : linkData.properties?.action_link

    if (!confirmationUrl) {
      return NextResponse.json({ error: 'Error al generar el link de confirmación. Intentá de nuevo.' }, { status: 500 })
    }

    const emailResult = await sendEmail({
      to: normalizedEmail,
      subject: 'Confirmá tu cuenta en gounuri',
      html: emailConfirmacionRegistro({ confirmationUrl }),
    }).catch(e => { console.error('[registro] error de email:', e); return { ok: false } })
    console.log(`[registro] email confirmacion a ${normalizedEmail}: ${emailResult.ok ? 'ENVIADO OK' : 'FALLO'}`)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[registro] error:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

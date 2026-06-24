import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { tenantName, email, tenantId } = await req.json()

  const RESEND_API_KEY = process.env.RESEND_API_KEY
  const ADMIN_EMAIL    = process.env.ADMIN_EMAIL ?? 'dmko2002@gmail.com'

  if (!RESEND_API_KEY) {
    console.warn('[notify-new-tenant] RESEND_API_KEY no configurada — solo logueando')
    console.log(`NUEVO TENANT: ${email} / ${tenantName} / ${tenantId}`)
    return NextResponse.json({ ok: true, warn: 'no resend key' })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const directLink  = `${supabaseUrl.replace('supabase.co', 'supabase.com')}/project/_/auth/users`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'CreArt Panel <onboarding@resend.dev>',
      to:   [ADMIN_EMAIL],
      subject: `🆕 Nuevo tenant registrado: ${tenantName}`,
      html: `
        <h2>Nuevo tenant registrado</h2>
        <table style="border-collapse:collapse;font-family:sans-serif">
          <tr><td style="padding:4px 12px 4px 0;color:#666">Email</td><td><strong>${email}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#666">Tienda</td><td><strong>${tenantName}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#666">Tenant ID</td><td><code>${tenantId}</code></td></tr>
        </table>
        <p style="margin-top:20px">
          Para activar la cuenta, ejecutá en Supabase SQL Editor:<br/>
          <code style="background:#f4f4f5;padding:8px;display:block;margin-top:8px;border-radius:4px">
            UPDATE tenants SET status = 'active' WHERE id = '${tenantId}';
          </code>
        </p>
        <p>O activá directamente desde el <a href="${directLink}">panel de Supabase</a>.</p>
      `,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[notify-new-tenant] Resend error:', err)
    return NextResponse.json({ ok: false, error: err }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

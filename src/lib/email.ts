// Email via Resend — mismas variables que tienda-frontend
// RESEND_API_KEY, EMAIL_FROM

const RESEND_API_URL = 'https://api.resend.com/emails'

export async function sendEmail({
  to, subject, html, from,
}: {
  to: string; subject: string; html: string; from?: string
}) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) { console.warn('[email] RESEND_API_KEY no configurada'); return { ok: false } }
  const sender = from ?? process.env.EMAIL_FROM ?? 'noreply@gounuri.com'
  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: sender, to, subject, html }),
    })
    if (!res.ok) console.error('[email] Resend error:', await res.text())
    return { ok: res.ok }
  } catch (e: any) {
    console.error('[email] fetch error:', e.message)
    return { ok: false }
  }
}

// ── Email de bienvenida al tenant ────────────────────────────────────────────

export function emailBienvenidaTenant({
  tenantName,
  email,
  panelUrl,
}: {
  tenantName: string
  email: string
  panelUrl: string
}) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px;">
<table width="100%" style="max-width:520px;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:36px 40px;text-align:center;">
    <div style="width:48px;height:48px;background:rgba(255,255,255,0.15);border-radius:12px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;">
      <span style="font-size:24px;">🏪</span>
    </div>
    <p style="margin:0;color:#fff;font-size:20px;font-weight:600;">¡Tu tienda está lista!</p>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:36px 40px 28px;">
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
      Hola, tu tienda <strong>${tenantName}</strong> fue creada exitosamente en la plataforma gounuri.
    </p>
    <p style="margin:0 0 28px;font-size:15px;color:#374151;line-height:1.6;">
      Ya podés ingresar al panel de administración para configurar tus productos, medios de pago, envíos y personalización.
    </p>

    <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;"><tr>
      <td style="background:#7c3aed;border-radius:8px;">
        <a href="${panelUrl}/dashboard" style="display:block;padding:14px 28px;color:#fff;text-decoration:none;font-size:14px;font-weight:600;">
          Ir al panel de administración →
        </a>
      </td>
    </tr></table>

    <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;border-left:3px solid #7c3aed;">
      <p style="margin:0 0 4px;font-size:12px;color:#6b7280;letter-spacing:0.05em;text-transform:uppercase;">Tu email de acceso</p>
      <p style="margin:0;font-size:14px;color:#111827;font-weight:500;">${email}</p>
    </div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #f3f4f6;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">
      Enviado por <strong>gounuri</strong> · <a href="${panelUrl}" style="color:#7c3aed;text-decoration:none;">gounuri.com</a>
    </p>
  </td></tr>

</table>
</td></tr></table>
</body>
</html>`
}

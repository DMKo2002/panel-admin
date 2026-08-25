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

// ── Confirmación de registro (2026-08-20) ───────────────────────────────────
// Alta self-serve directo en panel.gounuri.com/registro (antes vivía en
// gounuri.com — se trajo acá para que todo el flujo, del registro al
// onboarding, quede en un solo dominio). Mismo patrón que gounuri-web:
// generateLink(type:'signup') + este mail propio en vez del genérico de
// Supabase, para controlar contenido y no depender de su mailer por defecto.

function layout(bodyHtml: string): string {
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
    <p style="margin:0;color:#fff;font-size:20px;font-weight:600;">gounuri</p>
  </td></tr>

  ${bodyHtml}

  <!-- Footer -->
  <tr><td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #f3f4f6;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">
      Enviado por <strong>gounuri</strong> · <a href="https://www.gounuri.com" style="color:#7c3aed;text-decoration:none;">gounuri.com</a>
    </p>
  </td></tr>

</table>
</td></tr></table>
</body>
</html>`
}

function ctaButton(href: string, label: string): string {
  return `<table cellpadding="0" cellspacing="0"><tr>
    <td style="background:#7c3aed;border-radius:8px;">
      <a href="${href}" style="display:block;padding:14px 28px;color:#fff;text-decoration:none;font-size:14px;font-weight:600;">
        ${label}
      </a>
    </td>
  </tr></table>`
}

export function emailConfirmacionRegistro({ confirmationUrl }: { confirmationUrl: string }): string {
  return layout(`
  <tr><td style="padding:36px 40px 28px;">
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">¡Hola!</p>
    <p style="margin:0 0 28px;font-size:15px;color:#374151;line-height:1.6;">
      Gracias por registrarte en <strong>gounuri</strong>. Para activar tu cuenta y arrancar tus <strong>7 días de prueba gratis</strong>, confirmá tu dirección de email:
    </p>
    ${ctaButton(confirmationUrl, 'Confirmar mi cuenta')}
    <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">
      Si no creaste esta cuenta, podés ignorar este email. El link es válido por 24 horas.
    </p>
  </td></tr>`)
}

// ── Pago confirmado (2026-08-22) ────────────────────────────────────────────
// Se dispara desde /api/superadmin/mark-plan-paid cada vez que se marca un
// pago manual (transferencia) — antes solo quedaba registrado en la base
// (manual_payment_*) y en el badge de /superadmin, el tenant no se enteraba
// por ningún lado de que su pago quedó confirmado. Mismo espíritu que
// emailBienvenidaTenant de acá abajo, con layout() (el de la cabecera
// violeta) en vez del layout propio de esa función.

export function emailPagoConfirmado({
  tenantName,
  planNombre,
  months,
  amount,
  paidUntil,
  panelUrl,
}: {
  tenantName: string
  planNombre: string
  months: number
  amount: number
  paidUntil: string // ISO
  panelUrl: string
}): string {
  const fechaVence = new Date(paidUntil).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const montoFmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(amount)
  return layout(`
  <tr><td style="padding:36px 40px 28px;">
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">¡Hola!</p>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
      Confirmamos tu pago — tu tienda <strong>${tenantName}</strong> ya está activa con el plan <strong>${planNombre}</strong>${months > 1 ? ` (${months} meses)` : ''}.
    </p>

    <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;border-left:3px solid #7c3aed;margin-bottom:28px;">
      <p style="margin:0 0 4px;font-size:12px;color:#6b7280;letter-spacing:0.05em;text-transform:uppercase;">Monto</p>
      <p style="margin:0 0 12px;font-size:14px;color:#111827;font-weight:500;">${montoFmt}</p>
      <p style="margin:0 0 4px;font-size:12px;color:#6b7280;letter-spacing:0.05em;text-transform:uppercase;">Próximo vencimiento</p>
      <p style="margin:0;font-size:14px;color:#111827;font-weight:500;">${fechaVence}</p>
    </div>

    ${ctaButton(`${panelUrl}/dashboard`, 'Ir a mi panel')}
    <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">
      Cualquier duda con tu plan o el próximo pago, escribinos y te ayudamos.
    </p>
  </td></tr>`)
}

// ── Baja de suscripción confirmada (2026-08-25) ─────────────────────────────
// Se dispara desde /api/billing/cancel al "dar de baja" una suscripción de
// Mercado Pago — hasta acá esta acción no mandaba ningún mail (ni al tenant
// ni a Gounuri), pedido explícito de David/Aram tras probar el flujo.
export function emailBajaConfirmada({
  tenantName,
  activeUntil,
  panelUrl,
}: {
  tenantName: string
  activeUntil: string | null // ISO
  panelUrl: string
}): string {
  const fechaTxt = activeUntil
    ? new Date(activeUntil).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null
  return layout(`
  <tr><td style="padding:36px 40px 28px;">
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">¡Hola!</p>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
      Confirmamos que diste de baja la suscripción de tu tienda <strong>${tenantName}</strong>. No te vamos a volver a cobrar.
    </p>
    ${fechaTxt ? `
    <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;border-left:3px solid #7c3aed;margin-bottom:28px;">
      <p style="margin:0 0 4px;font-size:12px;color:#6b7280;letter-spacing:0.05em;text-transform:uppercase;">Seguís con acceso hasta</p>
      <p style="margin:0;font-size:14px;color:#111827;font-weight:500;">${fechaTxt}</p>
    </div>` : ''}
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
      Después de esa fecha tu tienda pasa al plan gratuito — tus datos y tu catálogo quedan intactos. Si te arrepentís, podés volver a suscribirte cuando quieras desde tu cuenta.
    </p>
    ${ctaButton(`${panelUrl}/dashboard`, 'Ir a mi panel')}
  </td></tr>`)
}

// ── Email de bienvenida al tenant ────────────────────────────────────────────
// 2026-08-24: hasta acá el único mail que recibía un tenant nuevo era este
// (link solo al Panel Admin) — Aram/David pidieron sumar un link a
// gounuri.com y uno a un FAQ nuevo (dominio, footer vacío, productos, plan,
// etc. — ver gounuri-web/src/app/faq/page.tsx) para que la primera pantalla
// vacía no sea la única guía que tiene un tenant recién creado.
// gounuriUrl/faqUrl tienen default para no romper si algún call site viejo
// no los pasa, pero create-tenant/route.ts ya los pasa explícitos.

export function emailBienvenidaTenant({
  tenantName,
  email,
  panelUrl,
  gounuriUrl = 'https://www.gounuri.com',
  faqUrl = 'https://www.gounuri.com/faq',
}: {
  tenantName: string
  email: string
  panelUrl: string
  gounuriUrl?: string
  faqUrl?: string
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

    <table cellpadding="0" cellspacing="0" style="margin-bottom:20px;"><tr>
      <td style="background:#7c3aed;border-radius:8px;">
        <a href="${panelUrl}/dashboard" style="display:block;padding:14px 28px;color:#fff;text-decoration:none;font-size:14px;font-weight:600;">
          Ir al panel de administración →
        </a>
      </td>
    </tr></table>

    <p style="margin:0 0 28px;font-size:13px;color:#6b7280;line-height:1.6;">
      <a href="${gounuriUrl}" style="color:#7c3aed;text-decoration:none;font-weight:600;">Conocé gounuri.com</a>
      &nbsp;·&nbsp;
      <a href="${faqUrl}" style="color:#7c3aed;text-decoration:none;font-weight:600;">Preguntas frecuentes</a>
      <br/>
      <span style="color:#9ca3af;">¿Por qué mi tienda está vacía? ¿Por qué no funciona mi dominio? Está todo ahí.</span>
    </p>

    <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;border-left:3px solid #7c3aed;">
      <p style="margin:0 0 4px;font-size:12px;color:#6b7280;letter-spacing:0.05em;text-transform:uppercase;">Tu email de acceso</p>
      <p style="margin:0;font-size:14px;color:#111827;font-weight:500;">${email}</p>
    </div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #f3f4f6;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">
      Enviado por <strong>gounuri</strong> · <a href="${gounuriUrl}" style="color:#7c3aed;text-decoration:none;">gounuri.com</a>
    </p>
  </td></tr>

</table>
</td></tr></table>
</body>
</html>`
}

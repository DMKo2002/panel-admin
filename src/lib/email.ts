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

// Layout unificado (2026-08-28): antes esta cabecera era violeta con un
// gradiente y un emoji 🏪 — quedaba totalmente distinto del resto de los
// mails de la plataforma (ver gounuri-web/src/lib/email.ts). Se copia acá
// tal cual el layout()/ctaButton() de gounuri-web (cabecera negra con el
// isotipo real, hosteado en gounuri.com/img/email/, sin violeta) para que
// todos los mails automáticos, vengan de panel-admin o de gounuri-web, se
// vean iguales.
function layout(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px;">
<table width="100%" style="max-width:520px;background:#fff;border-radius:8px;overflow:hidden;">

  <!-- Header -->
  <tr><td style="background:#101010;padding:30px 40px;text-align:center;">
    <img src="https://www.gounuri.com/img/email/gounuri-logo.png" width="160" height="31" alt="gounuri.com" style="display:block;margin:0 auto;border:0;outline:none;max-width:160px;height:auto;">
  </td></tr>

  ${bodyHtml}

  <!-- Footer -->
  <tr><td style="padding:24px 40px;text-align:center;border-top:1px solid #f0f0f0;">
    <p style="margin:0;font-size:12px;color:#bbb;">
      © gounuri · <a href="https://www.gounuri.com" style="color:#bbb;text-decoration:underline;">gounuri.com</a>
    </p>
  </td></tr>

</table>
</td></tr></table>
</body>
</html>`
}

function ctaButton(href: string, label: string): string {
  return `<table cellpadding="0" cellspacing="0"><tr>
    <td style="background:#101010;border-radius:8px;">
      <a href="${href}" style="display:block;padding:14px 32px;color:#fff;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:0.02em;">
        ${label}
      </a>
    </td>
  </tr></table>`
}

export function emailConfirmacionRegistro({ confirmationUrl }: { confirmationUrl: string }): string {
  return layout(`
  <tr><td style="padding:40px 40px 32px;">
    <p style="margin:0 0 18px;font-size:12px;color:#999;letter-spacing:0.1em;text-transform:uppercase;">Confirmá tu cuenta</p>
    <h1 style="margin:0 0 16px;font-size:26px;font-weight:700;color:#101010;line-height:1.3;">¡Hola!</h1>
    <p style="margin:0 0 28px;font-size:15px;color:#555;line-height:1.7;">
      Gracias por registrarte en <strong>gounuri</strong>. Para activar tu cuenta y arrancar tus <strong>7 días de prueba gratis</strong>, confirmá tu dirección de email:
    </p>
    ${ctaButton(confirmationUrl, 'Confirmar mi cuenta')}
    <p style="margin:28px 0 0;font-size:12px;color:#bbb;line-height:1.6;">
      Si no creaste esta cuenta, podés ignorar este email. El link es válido por 24 horas.
    </p>
  </td></tr>`)
}

// ── Pago confirmado (2026-08-22) ────────────────────────────────────────────
// Se dispara desde /api/superadmin/mark-plan-paid cada vez que se marca un
// pago manual (transferencia) — antes solo quedaba registrado en la base
// (manual_payment_*) y en el badge de /superadmin, el tenant no se enteraba
// por ningún lado de que su pago quedó confirmado. Usa el layout()/
// ctaButton() de acá arriba (cabecera negra, sin violeta desde 2026-08-28).

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
  <tr><td style="padding:40px 40px 8px;">
    <p style="margin:0 0 18px;font-size:12px;color:#999;letter-spacing:0.1em;text-transform:uppercase;">Pago confirmado</p>
    <h1 style="margin:0 0 16px;font-size:26px;font-weight:700;color:#101010;line-height:1.3;">¡Hola!</h1>
    <p style="margin:0 0 28px;font-size:15px;color:#555;line-height:1.7;">
      Confirmamos tu pago — tu tienda <strong>${tenantName}</strong> ya está activa con el plan <strong>${planNombre}</strong>${months > 1 ? ` (${months} meses)` : ''}.
    </p>
  </td></tr>

  <tr><td style="padding:0 40px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f7;border-radius:8px;padding:4px 0;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 4px;font-size:11px;color:#999;letter-spacing:0.08em;text-transform:uppercase;">Monto</p>
          <p style="margin:0;font-size:14px;color:#101010;font-weight:600;">${montoFmt}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 20px 16px;">
          <p style="margin:0 0 4px;font-size:11px;color:#999;letter-spacing:0.08em;text-transform:uppercase;">Próximo vencimiento</p>
          <p style="margin:0;font-size:14px;color:#333;">${fechaVence}</p>
        </td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="padding:0 40px 40px;">
    ${ctaButton(`${panelUrl}/dashboard`, 'Ir a mi panel')}
    <p style="margin:20px 0 0;font-size:13px;color:#888;line-height:1.6;">
      Cualquier duda con tu plan o el próximo pago, escribinos y te ayudamos.
    </p>
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
//
// 2026-08-28: antes este mail tenía su propio HTML completo (cabecera
// violeta con emoji 🏪 y título "¡Tu tienda está lista!", sin pasar por
// layout()) — ahora usa el layout()/ctaButton() compartido de este archivo,
// igual que el resto, para que quede igual al mail de bienvenida de
// gounuri-web (emailBienvenidaTienda) en vez de un tercer estilo distinto.

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
}): string {
  return layout(`
  <tr><td style="padding:40px 40px 8px;">
    <p style="margin:0 0 18px;font-size:12px;color:#999;letter-spacing:0.1em;text-transform:uppercase;">¡Ya está lista!</p>
    <h1 style="margin:0 0 16px;font-size:26px;font-weight:700;color:#101010;line-height:1.3;">Tu tienda está lista</h1>
    <p style="margin:0 0 28px;font-size:15px;color:#555;line-height:1.7;">
      Hola, tu tienda <strong>${tenantName}</strong> fue creada exitosamente en la plataforma gounuri. Ya podés ingresar al panel de administración para configurar tus productos, medios de pago, envíos y personalización.
    </p>
  </td></tr>

  <tr><td style="padding:0 40px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f7;border-radius:8px;padding:4px 0;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 4px;font-size:11px;color:#999;letter-spacing:0.08em;text-transform:uppercase;">Tu email de acceso</p>
          <p style="margin:0;font-size:14px;color:#333;">${email}</p>
        </td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="padding:0 40px 40px;">
    ${ctaButton(`${panelUrl}/dashboard`, 'Ir al panel de administración')}
    <p style="margin:20px 0 0;font-size:13px;color:#888;line-height:1.6;">
      <a href="${gounuriUrl}" style="color:#101010;text-decoration:underline;font-weight:600;">Conocé gounuri.com</a>
      &nbsp;·&nbsp;
      <a href="${faqUrl}" style="color:#101010;text-decoration:underline;font-weight:600;">Preguntas frecuentes</a>
      <br/>
      <span style="color:#bbb;">¿Por qué mi tienda está vacía? ¿Por qué no funciona mi dominio? Está todo ahí.</span>
    </p>
  </td></tr>`)
}

// ── Baja de suscripción confirmada (2026-08-26) ─────────────────────────────
// Portado de gounuri-web/src/lib/email.ts (emailBajaConfirmada, 2026-08-25)
// -- ese mail nunca llegaba a dispararse en la práctica porque desde el
// cambio de hoy que centralizó "cancelar suscripción" en Panel Admin
// (SuscripcionSelector.tsx / /dashboard/facturacion/suscripcion), la ruta
// que realmente procesa la baja es Panel Admin/api/billing/cancel, no la de
// gounuri-web (bug detectado por David en QA: ni el tenant ni Gounuri se
// enteraban de una baja). Mismo contenido que el de gounuri-web, y desde
// 2026-08-28 también el mismo layout()/ctaButton() (cabecera negra) — antes
// esta función ya usaba el layout() de este archivo, pero ese layout() era
// el violeta.

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
  <tr><td style="padding:40px 40px 32px;">
    <p style="margin:0 0 18px;font-size:12px;color:#999;letter-spacing:0.1em;text-transform:uppercase;">Baja confirmada</p>
    <h1 style="margin:0 0 16px;font-size:26px;font-weight:700;color:#101010;line-height:1.3;">¡Hola!</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.7;">
      Confirmamos que diste de baja la suscripción de tu tienda <strong>${tenantName}</strong>. No te vamos a volver a cobrar.
    </p>
    ${fechaTxt ? `
    <div style="background:#f7f7f7;border-radius:8px;padding:16px 20px;border-left:3px solid #101010;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:12px;color:#999;letter-spacing:0.05em;text-transform:uppercase;">Seguís con acceso hasta</p>
      <p style="margin:0;font-size:14px;color:#101010;font-weight:600;">${fechaTxt}</p>
    </div>` : ''}
    <p style="margin:0 0 28px;font-size:14px;color:#767676;line-height:1.7;">
      Después de esa fecha tu tienda pasa al plan gratuito — tus datos y tu catálogo quedan intactos. Si te arrepentís, podés volver a suscribirte cuando quieras.
    </p>
    ${ctaButton(`${panelUrl}/dashboard`, 'Ir a mi panel')}
  </td></tr>`)
}

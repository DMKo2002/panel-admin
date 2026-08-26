'use client'

// Bloque reutilizable de "pagar por transferencia" — monto calculado +
// CBU/alias (con botón de copiar) + acceso directo a WhatsApp para
// coordinar el pago (dispara /api/billing/notify-manual-intent, best-effort).
// Antes también tenía "Escribir por mail" — sacado 2026-08-26 (pedido de
// ARam: "todos los pagos se maneja con whatsapp"), acá y en /onboarding que
// reusa este mismo componente.
//
// Extraído de /perfil/plan/PlanSelector.tsx (2026-08-22) para reusarlo tal
// cual en el paso "Pago" del /onboarding — mismo diseño, el único que cambia
// entre los dos lugares es el texto del mensaje de WhatsApp (`accion`:
// "pasar mi tienda" en un cambio de plan existente, "activar mi tienda
// nueva" recién creada desde el onboarding).

import { useState } from 'react'
import { Copy, CopyCheck } from 'lucide-react'
import type { PlatformPaymentSettings } from '@/lib/platformBilling'
import type { PlanId, BillingTerm } from '@/lib/plans'

function formatARS(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

const TERM_LABEL: Record<BillingTerm, string> = { 1: 'mensual', 6: 'semestral', 12: 'anual' }

export function CopyRow({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</p>
        <button
          type="button"
          onClick={onCopy}
          className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-zinc-600 hover:text-zinc-900 transition-colors"
        >
          {copied ? <CopyCheck size={13} className="text-emerald-600" /> : <Copy size={13} />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      {/* CBU son 22 dígitos seguidos, sin espacios — break-all + fuente
          monoespaciada para que entre y se lea bien, en vez de truncar con
          "..." (dato que hay que poder leer entero, no solo copiar). */}
      <p className="mt-0.5 break-all font-mono text-sm font-medium text-zinc-900">{value}</p>
    </div>
  )
}

export default function TransferPaymentBlock({
  paymentSettings,
  planId,
  planNombre,
  term,
  monto,
  accion = 'pasar mi tienda',
}: {
  paymentSettings: PlatformPaymentSettings
  planId: PlanId
  planNombre: string
  term: BillingTerm
  monto: number
  /** Verbo/frase para el mensaje de WhatsApp — "pasar mi tienda"
      (cambio de plan) por defecto, o "activar mi tienda nueva" desde el
      onboarding. */
  accion?: string
}) {
  const [copied, setCopied] = useState<'cbu' | 'alias' | null>(null)

  async function copyToClipboard(text: string, which: 'cbu' | 'alias') {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      // API de clipboard puede fallar (permiso, contexto no seguro, etc.) —
      // no rompe nada, el CBU/alias ya está visible para copiar a mano.
    }
  }

  // Aviso server-side a GOUNURI — no espera respuesta ni bloquea el click, el
  // <a> navega igual al wa.me aunque este POST falle.
  function notifyManualIntent(via: 'whatsapp') {
    fetch('/api/billing/notify-manual-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: planId, months: term, via }),
    }).catch(() => {})
  }

  const montoFmt = formatARS(monto)
  const texto = `${accion} al plan ${planNombre} (${TERM_LABEL[term]}) — ${montoFmt}`
  const whatsappHref = `https://wa.me/${(paymentSettings.whatsappNumber ?? '541131351972').replace(/\D/g, '')}?text=${encodeURIComponent(`Hola! Quiero ${texto}.`)}`

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-left text-sm space-y-3">
      <p className="text-zinc-700">
        Transferí <strong>{montoFmt}</strong> ({TERM_LABEL[term]}) y avisanos para activar el plan.
      </p>

      {(paymentSettings.transferCbu || paymentSettings.transferAlias) ? (
        <div className="space-y-2">
          {paymentSettings.transferCbu && (
            <CopyRow label="CBU" value={paymentSettings.transferCbu} copied={copied === 'cbu'} onCopy={() => copyToClipboard(paymentSettings.transferCbu!, 'cbu')} />
          )}
          {paymentSettings.transferAlias && (
            <CopyRow label="Alias" value={paymentSettings.transferAlias} copied={copied === 'alias'} onCopy={() => copyToClipboard(paymentSettings.transferAlias!, 'alias')} />
          )}
        </div>
      ) : (
        <p className="text-xs text-zinc-500">Todavía no cargamos el CBU/alias acá — escribinos y te lo pasamos.</p>
      )}

      <div className="pt-1">
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => notifyManualIntent('whatsapp')}
          className="btn-black w-full !px-3 !py-2 text-center text-xs"
        >
          Escribir por WhatsApp
        </a>
      </div>
    </div>
  )
}

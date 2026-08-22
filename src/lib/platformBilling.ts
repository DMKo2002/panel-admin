// Lee platform_billing_settings (fila única, id=1) — mismo archivo que
// gounuri-web/src/lib/platformBilling.ts (repos separados, no hay paquete
// compartido entre los dos, así que se mantiene una copia en cada uno a
// propósito — ver comentario ahí). Se usa acá para el email de "quién le
// escribe" cuando el webhook de MP confirma una suscripción.
import type { SupabaseClient } from '@supabase/supabase-js'

export interface PlatformPaymentSettings {
  manualTransferEnabled: boolean
  mercadopagoEnabled: boolean
  transferCbu: string | null
  transferAlias: string | null
  whatsappNumber: string | null
  contactEmail: string
}

const FALLBACK: PlatformPaymentSettings = {
  manualTransferEnabled: true,
  mercadopagoEnabled: false,
  transferCbu: null,
  transferAlias: null,
  whatsappNumber: '541131351972',
  contactEmail: 'info@gounuri.com',
}

export async function getPlatformPaymentSettings(service: SupabaseClient): Promise<PlatformPaymentSettings> {
  const { data, error } = await service
    .from('platform_billing_settings')
    .select('manual_transfer_enabled, mercadopago_enabled, transfer_cbu, transfer_alias, whatsapp_number, contact_email')
    .eq('id', 1)
    .single()

  if (error || !data) {
    console.error('[platformBilling] no se pudo leer platform_billing_settings, uso fallback:', error?.message)
    return FALLBACK
  }

  return {
    manualTransferEnabled: data.manual_transfer_enabled,
    mercadopagoEnabled: data.mercadopago_enabled,
    transferCbu: data.transfer_cbu,
    transferAlias: data.transfer_alias,
    whatsappNumber: data.whatsapp_number,
    contactEmail: data.contact_email,
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { MercadoPagoConfig, Preference } from 'mercadopago'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { items, payer, tenant_id, order_id } = body

    if (!items || !tenant_id) {
      return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: storeConfig } = await supabase
      .from('store_config')
      .select('mp_access_token, mp_enabled')
      .eq('tenant_id', tenant_id)
      .single()

    const accessToken = storeConfig?.mp_access_token ?? process.env.MP_ACCESS_TOKEN!

    if (!storeConfig?.mp_enabled) {
      return NextResponse.json({ error: 'MercadoPago no está habilitado en esta tienda' }, { status: 400 })
    }

    const client = new MercadoPagoConfig({ accessToken })
    const preference = new Preference(client)

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const isProduction = baseUrl.startsWith('https')

    const result = await preference.create({
      body: {
        items: items.map((item: any) => ({
          id: item.variant_id ?? item.id,
          title: item.name,
          description: item.variant_desc ?? '',
          quantity: item.quantity,
          unit_price: item.unit_price,
          currency_id: 'ARS',
        })),
        payer: payer ? {
          name: payer.name,
          email: payer.email,
          phone: payer.phone ? { number: payer.phone } : undefined,
        } : undefined,
        ...(isProduction && {
          back_urls: {
            success: `${baseUrl}/tienda/checkout/exito?order_id=${order_id}`,
            failure: `${baseUrl}/tienda/checkout/error?order_id=${order_id}`,
            pending: `${baseUrl}/tienda/checkout/pendiente?order_id=${order_id}`,
          },
          auto_return: 'approved' as const,
        }),
        notification_url: `${baseUrl}/api/mp/webhook?tenant_id=${tenant_id}`,
        external_reference: order_id,
        statement_descriptor: 'Tu tienda',
      },
    })

    return NextResponse.json({
      preference_id: result.id,
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point,
    })

  } catch (error: any) {
    console.error('Error creando preferencia MP:', error)
    return NextResponse.json(
      { error: error.message ?? 'Error interno' },
      { status: 500 }
    )
  }
}
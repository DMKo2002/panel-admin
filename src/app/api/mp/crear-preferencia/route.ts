import { NextRequest, NextResponse } from 'next/server'
import { MercadoPagoConfig, Preference } from 'mercadopago'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { items, payer, tenant_id, order_id } = body

    if (!items || !tenant_id) {
      return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 })
    }

    // Ruta de prueba (usada por dashboard/test-mp) sin ningún chequeo de auth
    // ni de que el tenant_id pedido sea el del usuario logueado — cualquiera
    // podía pegarle a este endpoint con el tenant_id de OTRO tenant y generar
    // un link de pago real usando su cuenta de MercadoPago. Ahora se exige
    // sesión activa y que el tenant_id pedido coincida con el del usuario.
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const service = createServiceClient()
    const { data: userRows } = await service.from('users').select('tenant_id').eq('id', user.id).limit(1)
    const myTenantId = userRows?.[0]?.tenant_id
    if (!myTenantId || myTenantId !== tenant_id) {
      return NextResponse.json({ error: 'No autorizado para este tenant' }, { status: 403 })
    }

    const supabase = service
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
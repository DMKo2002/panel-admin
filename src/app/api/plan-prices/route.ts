// GET /api/plan-prices — precios vigentes de mini/standard/premium, para
// pantallas 'use client' que no tienen un componente servidor padre desde
// el cual pasarlos como prop (ver src/app/onboarding/page.tsx). Requiere
// sesión (cualquier usuario logueado) -- no es información sensible, pero
// tampoco hace falta exponerla sin auth.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPlatformPlanPrices } from '@/lib/platformPlanPrices'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const service = createServiceClient()
  const prices = await getPlatformPlanPrices(service)
  return NextResponse.json(prices)
}

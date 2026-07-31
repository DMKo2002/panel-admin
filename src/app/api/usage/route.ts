// GET /api/usage — resumen de límites del plan para el tenant del usuario.
// Lo usan las páginas de productos para bloquear la creación de productos y
// la subida de imágenes cuando se superó el cupo del plan.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getTenantUsage } from '@/lib/usage'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const service = createServiceClient()
  const { data: _rows } = await service.from('users').select('tenant_id').eq('id', user.id).limit(1)
  const tenantId = _rows?.[0]?.tenant_id
  if (!tenantId) return NextResponse.json({ error: 'Sin tenant' }, { status: 404 })

  try {
    const usage = await getTenantUsage(service, tenantId)
    return NextResponse.json({
      plan: usage.plan.id,
      planNombre: usage.plan.nombre,
      // Bloqueos duros (productos y storage). Visitas: solo medición.
      canCreateProduct: usage.productCount < usage.plan.maxProductos,
      canUploadImages: usage.storageError || usage.storagePct < 100,
      productCount: usage.productCount,
      maxProductos: usage.plan.maxProductos,
      storagePct: Math.round(usage.storagePct),
      storageMB: usage.plan.storageMB,
    })
  } catch {
    // Sin migraciones o sin service key: no bloquear el trabajo del tenant
    return NextResponse.json({
      plan: null, planNombre: null,
      canCreateProduct: true, canUploadImages: true,
      productCount: 0, maxProductos: 0, storagePct: 0, storageMB: 0,
    })
  }
}

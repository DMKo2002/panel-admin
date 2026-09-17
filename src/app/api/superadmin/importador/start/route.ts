import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/superadmin'
import { parseWooCsv, groupRows, buildCategoryTree, type StockMode } from '@/lib/importer/woocommerce'
import type { ImageQuality } from '@/lib/importer/image'

export const maxDuration = 60

// Arranca un job de importación: valida el CSV, crea (o reutiliza) el
// árbol de categorías completo de una sola vez, guarda el CSV crudo en la
// fila del job (no hace falta un bucket aparte, un CSV de catálogo entra
// cómodo en una columna text) y deja todo listo para que
// /[jobId]/step vaya procesando productos de a lotes. Acá NO se crea
// ningún producto todavía — eso es responsabilidad exclusiva de /step,
// para que este endpoint responda rápido incluso con un CSV grande.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isSuperAdmin(user.email)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Formulario inválido' }, { status: 400 })

  const file = form.get('file')
  const tenantId = String(form.get('tenant_id') ?? '').trim()
  const imageQuality = String(form.get('image_quality') ?? 'estandar') as ImageQuality
  const stockMode = String(form.get('stock_mode') ?? 'csv') as StockMode

  if (!(file instanceof File)) return NextResponse.json({ error: 'Falta el archivo CSV' }, { status: 400 })
  if (!tenantId) return NextResponse.json({ error: 'Falta elegir tienda' }, { status: 400 })
  if (!['alta', 'estandar', 'baja'].includes(imageQuality)) return NextResponse.json({ error: 'Calidad de imagen inválida' }, { status: 400 })
  if (!['csv', 'zero'].includes(stockMode)) return NextResponse.json({ error: 'Modo de stock inválido' }, { status: 400 })

  const service = createServiceClient()

  const { data: tenant } = await service.from('tenants').select('id, name').eq('id', tenantId).single()
  if (!tenant) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

  const csvText = await file.text()
  if (!csvText.trim()) return NextResponse.json({ error: 'El CSV está vacío' }, { status: 400 })

  const rows = parseWooCsv(csvText)
  if (rows.length === 0) return NextResponse.json({ error: 'El CSV no tiene filas de datos' }, { status: 400 })
  if (!('Nombre' in rows[0]) || !('Tipo' in rows[0]) || !('ID' in rows[0])) {
    return NextResponse.json({
      error: 'El CSV no tiene las columnas esperadas de un export de WooCommerce (faltan "Nombre"/"Tipo"/"ID"). ¿Es el export correcto?',
    }, { status: 400 })
  }

  const { padres, orderedIds } = groupRows(rows)
  if (orderedIds.length === 0) {
    return NextResponse.json({ error: 'No se encontró ningún producto "simple" o "variable" en el CSV' }, { status: 400 })
  }

  const pendingLogs: { level: 'info' | 'warn' | 'error'; message: string }[] = []
  const log = (message: string, level: 'info' | 'warn' | 'error' = 'info') => pendingLogs.push({ level, message })

  await buildCategoryTree(service, tenantId, padres, log)

  const { data: job, error: jobError } = await service.from('import_jobs').insert({
    tenant_id: tenantId,
    created_by: user.id,
    status: 'processing',
    image_quality: imageQuality,
    stock_mode: stockMode,
    csv_content: csvText,
    csv_filename: file.name || null,
    total_products: orderedIds.length,
    processed_products: 0,
  }).select('id').single()

  if (jobError || !job) {
    return NextResponse.json({ error: 'No se pudo crear el job: ' + (jobError?.message ?? '') }, { status: 500 })
  }

  log(`Importación iniciada para "${tenant.name}": ${orderedIds.length} productos detectados, calidad=${imageQuality}, stock=${stockMode === 'zero' ? 'normalizado a 0' : 'según CSV'}`)

  if (pendingLogs.length > 0) {
    await service.from('import_job_logs').insert(pendingLogs.map(l => ({ job_id: job.id, level: l.level, message: l.message })))
  }

  return NextResponse.json({ job_id: job.id, total_products: orderedIds.length })
}

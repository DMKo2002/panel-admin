import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/superadmin'
import { parseWooCsv, groupRows, loadCategoriesBySlug, importOneProduct, type StockMode, type PriceType } from '@/lib/importer/woocommerce'
import { ratioFromStoreConfig, type ImageQuality } from '@/lib/importer/image'

export const maxDuration = 60

const BATCH_MAX = 5
const TIME_BUDGET_MS = 45_000
const PRICE_TYPE: PriceType = 'retail' // igual que los scripts de migración a mano hasta ahora

// Procesa el próximo lote de productos de un job de importación ya creado
// por /start. Sin memoria compartida entre llamadas — todo lo que hace
// falta se relee de `import_jobs`/el propio CSV guardado en la fila, así
// que esta ruta se puede llamar en un loop de polling desde el browser
// (cada llamada es un paso chico y seguro dentro del límite de Vercel) y
// también sirve para "reanudar" un job si se cerró la pestaña a mitad de
// camino — el cursor es processed_products, guardado en la base.
export async function POST(req: NextRequest, { params }: { params: { jobId: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isSuperAdmin(user.email)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const service = createServiceClient()
  const { data: job } = await service.from('import_jobs').select('*').eq('id', params.jobId).single()
  if (!job) return NextResponse.json({ error: 'Job no encontrado' }, { status: 404 })

  if (job.status === 'done' || job.status === 'failed' || job.status === 'cancelled') {
    const { data: logs } = await service.from('import_job_logs').select('id, level, message, created_at').eq('job_id', job.id).order('id', { ascending: true })
    return NextResponse.json({ job, new_logs: logs ?? [] })
  }

  const rows = parseWooCsv(job.csv_content)
  const { padres, varsByParent, orderedIds } = groupRows(rows)

  const batchIds = orderedIds.slice(job.processed_products, job.processed_products + BATCH_MAX)
  const pendingLogs: { level: 'info' | 'warn' | 'error'; message: string }[] = []
  const log = (message: string, level: 'info' | 'warn' | 'error' = 'info') => pendingLogs.push({ level, message })

  if (batchIds.length === 0) {
    const { data: updated } = await service.from('import_jobs').update({
      status: 'done', updated_at: new Date().toISOString(), finished_at: new Date().toISOString(),
    }).eq('id', job.id).select('*').single()
    log(`Importación terminada: ${job.products_created} producto/s creado/s, ${job.products_skipped} salteado/s (ya existían), ${job.images_uploaded} imagen/es subida/s${job.images_failed ? `, ${job.images_failed} imagen/es fallida/s` : ''}.`)
    await service.from('import_job_logs').insert(pendingLogs.map(l => ({ job_id: job.id, level: l.level, message: l.message })))
    return NextResponse.json({ job: updated ?? job, new_logs: pendingLogs })
  }

  const categoriesBySlug = await loadCategoriesBySlug(service, job.tenant_id)
  const { data: storeConfig } = await service.from('store_config').select('product_image_ratio').eq('tenant_id', job.tenant_id).single()
  const imageRatio = ratioFromStoreConfig((storeConfig as any)?.product_image_ratio)

  const ctx = {
    service,
    tenantId: job.tenant_id,
    stockMode: job.stock_mode as StockMode,
    priceType: PRICE_TYPE,
    imageQuality: job.image_quality as ImageQuality,
    imageRatio,
    categoriesBySlug,
    varsByParent,
    log,
  }

  let created = 0, skipped = 0, variants = 0, imgOk = 0, imgFail = 0, processedNow = 0
  const deadline = Date.now() + TIME_BUDGET_MS

  for (const pid of batchIds) {
    const prod = padres.get(pid)
    if (!prod) { processedNow++; continue }
    try {
      const outcome = await importOneProduct(ctx, pid, prod)
      if (outcome.created) created++
      if (outcome.skipped) skipped++
      variants += outcome.variantsCreated
      imgOk += outcome.imagesUploaded
      imgFail += outcome.imagesFailed
    } catch (e: any) {
      log(`Error inesperado en "${prod['Nombre'] || pid}": ${e?.message ?? e}`, 'error')
    }
    processedNow++
    if (Date.now() > deadline) break // el resto del lote queda para el próximo step
  }

  const { data: updated, error: updateError } = await service.from('import_jobs').update({
    processed_products: job.processed_products + processedNow,
    products_created: job.products_created + created,
    products_skipped: job.products_skipped + skipped,
    variants_created: job.variants_created + variants,
    images_uploaded: job.images_uploaded + imgOk,
    images_failed: job.images_failed + imgFail,
    updated_at: new Date().toISOString(),
  }).eq('id', job.id).select('*').single()

  if (updateError) {
    log(`No se pudo guardar el progreso: ${updateError.message}`, 'error')
  }

  if (pendingLogs.length > 0) {
    await service.from('import_job_logs').insert(pendingLogs.map(l => ({ job_id: job.id, level: l.level, message: l.message })))
  }

  return NextResponse.json({ job: updated ?? job, new_logs: pendingLogs })
}

// GET /api/cron/cleanup-storage — corre 1 vez por semana (Vercel Cron, ver
// vercel.json — domingos 05:00 UTC, antes de /enforce y /billing-recurring).
//
// Borra archivos de Storage (product-images, store-assets) que hace más de
// GRACE_DAYS días que ninguna fila de la base referencia. Usa la función SQL
// find_orphan_storage_objects (migración find_orphan_storage_objects_fn,
// 2026-08-20), que compara storage.objects contra: product_images.url,
// store_assets.url, store_config.hero_image_url/logo_url/favicon_url y
// order_items.product_image_url (esta última a propósito, para no borrar la
// foto de un pedido histórico aunque el producto ya no exista).
//
// Los GRACE_DAYS de gracia son para no borrar un archivo recién subido que
// todavía no tiene su fila en la base (ej: mitad de un flujo de carga de
// imágenes, entre el upload a Storage y el insert en product_images).
//
// Circuit breaker: si en una corrida aparecen más de MAX_DELETE_PER_RUN
// candidatos, no se borra nada — solo se avisa por mail. Esto evita que un
// bug de código, o una migración que vacíe una tabla por error, termine
// borrando medio bucket de un saque sin que nadie se entere hasta después.
//
// Seguridad: exige el header Authorization: Bearer ${CRON_SECRET}, igual
// patrón que /api/cron/enforce.

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const GRACE_DAYS = 30
const MAX_DELETE_PER_RUN = 500
const ADMIN_EMAIL = 'info@gounuri.com'

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

type Orphan = { bucket_id: string; name: string; size_bytes: number; created_at: string }

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const service = createServiceClient()

  const { data: orphans, error } = await service.rpc('find_orphan_storage_objects', { p_grace_days: GRACE_DAYS })
  if (error) {
    console.error('[cron/cleanup-storage] error consultando huérfanos:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const candidatos = (orphans ?? []) as Orphan[]

  if (candidatos.length === 0) {
    console.log('[cron/cleanup-storage] nada para limpiar')
    return NextResponse.json({ ok: true, borrados: 0, mensaje: 'nada para limpiar' })
  }

  if (candidatos.length > MAX_DELETE_PER_RUN) {
    console.error(`[cron/cleanup-storage] freno de seguridad: ${candidatos.length} candidatos supera MAX_DELETE_PER_RUN (${MAX_DELETE_PER_RUN}) — no se borró nada`)
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `⚠️ Limpieza de storage frenada — ${candidatos.length} candidatos`,
      html: `<p>La limpieza automática de storage encontró <strong>${candidatos.length}</strong> archivos huérfanos, más que el límite de seguridad (${MAX_DELETE_PER_RUN}). No se borró nada a propósito. Conviene revisar a mano antes de subir el límite — puede ser señal de un bug en vez de basura acumulada real.</p>`,
    }).catch(() => {})
    return NextResponse.json({ ok: false, frenado: true, candidatos: candidatos.length })
  }

  const porBucket: Record<string, string[]> = {}
  let totalBytes = 0
  for (const o of candidatos) {
    porBucket[o.bucket_id] = porBucket[o.bucket_id] ?? []
    porBucket[o.bucket_id].push(o.name)
    totalBytes += Number(o.size_bytes ?? 0)
  }

  let totalBorrados = 0
  const errores: string[] = []
  for (const [bucket, paths] of Object.entries(porBucket)) {
    for (const batch of chunk(paths, 100)) {
      const { data: removed, error: rmError } = await service.storage.from(bucket).remove(batch)
      if (rmError) {
        errores.push(`${bucket}: ${rmError.message}`)
        continue
      }
      totalBorrados += removed?.length ?? 0
    }
  }

  const resumenMb = (totalBytes / 1048576).toFixed(2)
  console.log(`[cron/cleanup-storage] borrados ${totalBorrados}/${candidatos.length} archivos (~${resumenMb}MB)`)

  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `Limpieza de storage: ${totalBorrados} archivos borrados (~${resumenMb}MB)`,
    html: `
      <p>Se borraron <strong>${totalBorrados}</strong> archivos de Storage sin uso hace más de ${GRACE_DAYS} días, liberando ~${resumenMb}MB.</p>
      ${errores.length ? `<p style="color:#b91c1c">Errores en algún lote: ${errores.join('; ')}</p>` : ''}
    `,
  }).catch(() => {})

  return NextResponse.json({ ok: true, borrados: totalBorrados, mb: resumenMb, candidatos: candidatos.length, errores })
}

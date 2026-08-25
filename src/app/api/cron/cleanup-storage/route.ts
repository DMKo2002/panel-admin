// GET /api/cron/cleanup-storage — corre 1 vez por semana (Vercel Cron, ver
// vercel.json — domingos 05:00 UTC, antes de /enforce y /billing-recurring).
//
// Borrado en dos pasos (2026-08-20), no borrado directo:
//
//   1) MOVER A CUARENTENA: archivos de Storage (product-images, store-assets)
//      que hace más de GRACE_DAYS días que ninguna fila de la base referencia
//      se mueven (no se borran) a una carpeta _cuarentena/ dentro del mismo
//      bucket, conservando el path original adentro. find_orphan_storage_objects
//      (migración find_orphan_storage_objects_fn / quarantine_storage_cleanup_fns)
//      compara storage.objects contra: product_images.url, store_assets.url,
//      store_config.hero_image_url/logo_url/favicon_url y
//      order_items.product_image_url (esta última a propósito, para no tocar
//      la foto de un pedido histórico aunque el producto ya no exista) — y
//      ya excluye lo que esté en _cuarentena/ para no re-moverlo cada semana.
//
//   2) BORRAR DEFINITIVO: lo que lleva QUARANTINE_DAYS (7) adentro de
//      _cuarentena/ sin que nadie lo haya reclamado (find_quarantine_expired)
//      recién ahí se borra de verdad con la Storage API.
//
// Si la función se equivocó marcando algo que en realidad se sigue usando,
// hay una semana entera para notarlo (queda visible en Storage, adentro de
// _cuarentena/{path original}) y devolverlo a su lugar a mano antes de que
// se borre en serio.
//
// GRACE_DAYS son para no mover un archivo recién subido que todavía no tiene
// su fila en la base (ej: mitad de un flujo de carga de imágenes).
//
// Circuit breaker: si en el paso 1 aparecen más de MAX_MOVE_PER_RUN
// candidatos, no se mueve nada — solo se avisa por mail. Evita que un bug de
// código, o una migración que vacíe una tabla por error, mande medio bucket
// a cuarentena de un saque sin que nadie se entere hasta después.
//
// Seguridad: exige el header Authorization: Bearer ${CRON_SECRET}, igual
// patrón que /api/cron/enforce.

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const GRACE_DAYS = 30
const QUARANTINE_DAYS = 7
const MAX_MOVE_PER_RUN = 500
const MOVE_CONCURRENCY = 10
const ADMIN_EMAIL = 'info@gounuri.com'

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// storage-js no tiene move en lote — lo corremos con concurrencia acotada
// en vez de secuencial (podrían ser cientos de archivos) pero sin saturar
// la API.
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

type Orphan = { bucket_id: string; name: string; size_bytes: number; created_at: string }
type QuarantineExpired = { bucket_id: string; name: string; size_bytes: number; quarantined_at: string }

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const service = createServiceClient()
  const errores: string[] = []

  // ── 1. Mover huérfanos nuevos a cuarentena ──────────────────────────────
  const { data: orphans, error: orphansError } = await service.rpc('find_orphan_storage_objects', { p_grace_days: GRACE_DAYS })
  if (orphansError) {
    console.error('[cron/cleanup-storage] error consultando huérfanos:', orphansError.message)
    return NextResponse.json({ error: orphansError.message }, { status: 500 })
  }

  const candidatos = (orphans ?? []) as Orphan[]
  let movidos = 0
  let movidosBytes = 0

  if (candidatos.length > MAX_MOVE_PER_RUN) {
    console.error(`[cron/cleanup-storage] freno de seguridad: ${candidatos.length} candidatos supera MAX_MOVE_PER_RUN (${MAX_MOVE_PER_RUN}) — no se movió nada`)
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `⚠️ Limpieza de storage frenada — ${candidatos.length} candidatos`,
      html: `<p>La limpieza automática de storage encontró <strong>${candidatos.length}</strong> archivos huérfanos, más que el límite de seguridad (${MAX_MOVE_PER_RUN}). No se movió nada a propósito. Conviene revisar a mano antes de subir el límite — puede ser señal de un bug en vez de basura acumulada real.</p>`,
    }).catch(() => {})
    return NextResponse.json({ ok: false, frenado: true, candidatos: candidatos.length })
  }

  if (candidatos.length > 0) {
    const resultados = await mapWithConcurrency(candidatos, MOVE_CONCURRENCY, async (o) => {
      const destino = `_cuarentena/${o.name}`
      const { error: mvError } = await service.storage.from(o.bucket_id).move(o.name, destino)
      return { o, mvError }
    })
    for (const { o, mvError } of resultados) {
      if (mvError) {
        errores.push(`mover ${o.bucket_id}/${o.name}: ${mvError.message}`)
        continue
      }
      movidos++
      movidosBytes += Number(o.size_bytes ?? 0)
    }
  }

  // ── 2. Borrar definitivo lo que ya cumplió los días de cuarentena ───────
  const { data: expired, error: expiredError } = await service.rpc('find_quarantine_expired', { p_days: QUARANTINE_DAYS })
  if (expiredError) {
    errores.push(`consultando cuarentena vencida: ${expiredError.message}`)
  }

  const vencidos = (expired ?? []) as QuarantineExpired[]
  let borrados = 0
  let borradosBytes = 0

  const porBucket: Record<string, string[]> = {}
  for (const o of vencidos) {
    porBucket[o.bucket_id] = porBucket[o.bucket_id] ?? []
    porBucket[o.bucket_id].push(o.name)
    borradosBytes += Number(o.size_bytes ?? 0)
  }
  for (const [bucket, paths] of Object.entries(porBucket)) {
    for (const batch of chunk(paths, 100)) {
      const { data: removed, error: rmError } = await service.storage.from(bucket).remove(batch)
      if (rmError) {
        errores.push(`borrar ${bucket}: ${rmError.message}`)
        continue
      }
      borrados += removed?.length ?? 0
    }
  }

  const movidosMb = (movidosBytes / 1048576).toFixed(2)
  const borradosMb = (borradosBytes / 1048576).toFixed(2)
  console.log(`[cron/cleanup-storage] movidos a cuarentena: ${movidos}/${candidatos.length} (~${movidosMb}MB) · borrados definitivos: ${borrados}/${vencidos.length} (~${borradosMb}MB)`)

  // Solo manda mail si pasó algo — no todas las semanas hay novedades.
  if (movidos > 0 || borrados > 0 || errores.length > 0) {
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `Limpieza de storage: ${movidos} a cuarentena, ${borrados} borrados definitivo`,
      html: `
        <p><strong>${movidos}</strong> archivos nuevos sin uso hace más de ${GRACE_DAYS} días se movieron a cuarentena (~${movidosMb}MB) — quedan ${QUARANTINE_DAYS} días ahí por si hay que rescatar alguno a mano.</p>
        <p><strong>${borrados}</strong> archivos que ya cumplieron esos ${QUARANTINE_DAYS} días en cuarentena se borraron definitivo (~${borradosMb}MB liberados).</p>
        ${errores.length ? `<p style="color:#b91c1c">Errores: ${errores.join('; ')}</p>` : ''}
      `,
    }).catch(() => {})
  }

  return NextResponse.json({
    ok: true,
    movidosACuarentena: movidos,
    movidosMb,
    borradosDefinitivo: borrados,
    borradosMb,
    errores,
  })
}

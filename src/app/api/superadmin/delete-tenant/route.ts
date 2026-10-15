// POST /api/superadmin/delete-tenant — borra una tienda COMPLETA, sin dejar nada.
//
// Pedido de David (2026-10-15): el botón "Borrar" del superadmin se usa solo
// con tenants de prueba o que no van a volver, así que tiene que borrar TODO,
// no solo las filas de la base. Antes solo borraba la fila de `tenants` (y lo
// que cae en cascada): los archivos de Storage, el dominio, el widget de
// Turnstile y los usuarios de login quedaban huérfanos, y si la tienda tenía
// import_jobs o withdrawal_requests (FK sin cascada) el borrado fallaba
// DESPUÉS de haber cancelado el débito de Mercado Pago.
//
// Orden pensado para que lo que puede fallar falle ANTES de lo irreversible:
//   0. Validaciones (superadmin, uuid, no es una tienda demo).
//   1. Juntar lo que después no se va a poder consultar: archivos de Storage
//      y usuarios de login. (Solo lectura.)
//   2. Cancelar el débito en Mercado Pago. Si no se puede, NO se borra nada.
//   3. Quitar el dominio de Vercel y del pool de Turnstile. Si no se puede,
//      NO se borra nada (se puede reintentar: todos los pasos son idempotentes).
//   4. Base de datos: filas que bloquean el borrado (sin cascada) y después
//      el tenant, que cascadea productos, variantes, imágenes, pedidos, etc.
//   5. Limpieza posterior (mejor esfuerzo, con aviso si algo queda): archivos
//      de Storage y usuarios de login que no pertenezcan a ninguna otra tienda.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { isSuperAdmin } from '@/lib/superadmin'
import { cancelPreapprovalIfActive, findActivePreapprovalIdsForTenant } from '@/lib/billing'
import { projectIdForTemplate, removeDomainFromProject } from '@/lib/vercel'
import { removeDomainFromWidgetPool } from '@/lib/turnstile'

export const maxDuration = 60

function makeService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type Service = ReturnType<typeof makeService>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Las tiendas demo (00000000-0000-0000-0000-00000000000X) las usan las
// plantillas como fallback y seedDemoStore como origen de copias: no se borran.
const DEMO_TENANT_PREFIX = '00000000-0000-0000-0000-'
const BUCKETS = ['product-images', 'store-assets'] as const
// Lo que queda de los 60s de maxDuration después de los pasos 1-4.
const TIME_BUDGET_MS = 45_000

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// Lista TODOS los archivos bajo `prefix` (las carpetas vienen con id null).
async function listAllFiles(service: Service, bucket: string, prefix: string): Promise<string[]> {
  const files: string[] = []
  const pending = [prefix]
  while (pending.length > 0) {
    const dir = pending.pop() as string
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await service.storage.from(bucket).list(dir, { limit: 1000, offset })
      if (error) throw new Error(`listando ${bucket}/${dir}: ${error.message}`)
      const items = data ?? []
      for (const item of items) {
        const path = `${dir}/${item.name}`
        if (item.id === null) pending.push(path)
        else files.push(path)
      }
      if (items.length < 1000) break
    }
  }
  return files
}

async function fetchColumn(service: Service, table: string, column: string, tenantId: string): Promise<string[]> {
  const out: string[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service
      .from(table).select(column).eq('tenant_id', tenantId).not(column, 'is', null)
      .order(column).range(from, from + 999)
    if (error) throw new Error(`leyendo ${table}.${column}: ${error.message}`)
    const rows = (data ?? []) as unknown as Record<string, string>[]
    for (const r of rows) out.push(r[column])
    if (rows.length < 1000) break
  }
  return out
}

// Usuarios de login que además pertenecen a OTRA tienda (o a ninguna): no se tocan.
async function idsUsedElsewhere(service: Service, tenantId: string, ids: string[]): Promise<Set<string>> {
  const shared = new Set<string>()
  for (const batch of chunk(ids, 100)) {
    const [staff, buyers, accounts] = await Promise.all([
      service.from('users').select('id, tenant_id').in('id', batch),
      service.from('customers').select('auth_user_id, tenant_id').in('auth_user_id', batch),
      service.from('gounuri_accounts').select('auth_user_id, tenant_id').in('auth_user_id', batch),
    ])
    for (const r of [staff, buyers, accounts]) {
      if (r.error) throw new Error(`revisando usuarios compartidos: ${r.error.message}`)
    }
    for (const r of (staff.data ?? []) as { id: string; tenant_id: string | null }[]) {
      if (r.tenant_id !== tenantId) shared.add(r.id)
    }
    for (const r of [...(buyers.data ?? []), ...(accounts.data ?? [])] as { auth_user_id: string; tenant_id: string | null }[]) {
      if (r.tenant_id !== tenantId) shared.add(r.auth_user_id)
    }
  }
  return shared
}

export async function POST(req: NextRequest) {
  const t0 = Date.now()
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isSuperAdmin(user.email)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { tenantId } = await req.json()
  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 })
  }
  if (typeof tenantId !== 'string' || !UUID_RE.test(tenantId)) {
    return NextResponse.json({ error: 'tenantId inválido' }, { status: 400 })
  }
  if (tenantId.startsWith(DEMO_TENANT_PREFIX)) {
    return NextResponse.json({ error: 'Las tiendas demo no se pueden borrar (las usan las plantillas).' }, { status: 403 })
  }

  const service = makeService()

  const { data: _tenantRows } = await service
    .from('tenants').select('name, mp_preapproval_id, domain, template').eq('id', tenantId).limit(1)
  const tenantRow = _tenantRows?.[0]
  if (!tenantRow) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

  const { data: _configRows } = await service
    .from('store_config').select('turnstile_widget_id').eq('tenant_id', tenantId).limit(1)
  const widgetId: string | null = _configRows?.[0]?.turnstile_widget_id ?? null

  const warnings: string[] = []

  // ── 1. Juntar lo que después no se va a poder consultar (solo lectura) ──
  const archivos: { bucket: string; paths: string[] }[] = []
  let authIds: string[] = []
  let gounuriAccountIds: string[] = []
  try {
    for (const bucket of BUCKETS) {
      const paths = [
        ...(await listAllFiles(service, bucket, tenantId)),
        ...(await listAllFiles(service, bucket, `_cuarentena/${tenantId}`)),
      ]
      archivos.push({ bucket, paths })
    }
    const candidatos = new Set<string>([
      ...(await fetchColumn(service, 'users', 'id', tenantId)),
      ...(await fetchColumn(service, 'customers', 'auth_user_id', tenantId)),
      ...(await fetchColumn(service, 'gounuri_accounts', 'auth_user_id', tenantId)),
    ])
    candidatos.delete(user.id) // nunca la cuenta de quien aprieta el botón
    const compartidos = await idsUsedElsewhere(service, tenantId, [...candidatos])
    authIds = [...candidatos].filter(id => !compartidos.has(id))
    gounuriAccountIds = await fetchColumn(service, 'gounuri_accounts', 'id', tenantId)
  } catch (e) {
    console.error('[delete-tenant] no se pudo preparar el borrado', e)
    return NextResponse.json({
      error: `No se pudo preparar el borrado, la tienda NO se borró: ${e instanceof Error ? e.message : 'error desconocido'}`,
    }, { status: 500 })
  }

  // ── 2. Débito automático de Mercado Pago ────────────────────────────────
  // (2026-09-29, incidente: un tenant de prueba borrado seguía cobrando $20/mes
  // porque el preapproval vive en MP y borrar la fila no lo toca.) Si no se
  // puede cancelar, NO se borra: mejor una tienda de más que un cobro a
  // alguien que ya no tiene servicio.
  const preapprovalIds = new Set<string>()
  if (tenantRow.mp_preapproval_id) preapprovalIds.add(tenantRow.mp_preapproval_id)

  // Suscripciones viejas del mismo tenant que ya no están guardadas en la
  // fila (mejor esfuerzo: si la búsqueda falla se sigue con el id guardado).
  if (process.env.GOUNURI_MP_ACCESS_TOKEN) {
    try {
      for (const id of await findActivePreapprovalIdsForTenant(tenantId)) preapprovalIds.add(id)
    } catch (e) {
      console.error('[delete-tenant] no se pudo buscar preapprovals extra en MP', e)
      warnings.push('No se pudo buscar otras suscripciones de esta tienda en Mercado Pago. Revisalas a mano.')
    }
  }

  let cancelled = 0
  for (const id of preapprovalIds) {
    try {
      const outcome = await cancelPreapprovalIfActive(id)
      if (outcome === 'cancelled') cancelled++
    } catch (e) {
      console.error('[delete-tenant] no se pudo cancelar el preapproval', id, e)
      return NextResponse.json({
        error: `No se pudo cancelar el débito automático en Mercado Pago (suscripción ${id}). La tienda NO se borró. Probá de nuevo o cancelala a mano en MP.`,
      }, { status: 502 })
    }
  }

  // ── 3. Dominio: Vercel + pool de Turnstile ──────────────────────────────
  let dominioQuitado = false
  if (tenantRow.domain) {
    let proyectoMapeado = true
    try {
      projectIdForTemplate(tenantRow.template)
    } catch {
      proyectoMapeado = false
      warnings.push(`El dominio ${tenantRow.domain} no se pudo quitar de Vercel porque la plantilla "${tenantRow.template}" no tiene proyecto asignado. Sacalo a mano.`)
    }

    if (proyectoMapeado) {
      try {
        await removeDomainFromProject(tenantRow.template, tenantRow.domain)
        dominioQuitado = true
      } catch (e) {
        console.error('[delete-tenant] no se pudo quitar el dominio de Vercel', e)
        return NextResponse.json({
          error: `No se pudo quitar el dominio ${tenantRow.domain} de Vercel (${e instanceof Error ? e.message : 'error desconocido'}). La tienda NO se borró. Podés reintentar.`,
        }, { status: 502 })
      }
    }

    if (widgetId) {
      // Sacar la referencia ANTES de tocar turnstile_widgets: el FK
      // store_config.turnstile_widget_id -> turnstile_widgets(id) no tiene
      // ON DELETE CASCADE (ver /api/dominio, mismo orden y mismo motivo).
      const { error: clearError } = await service
        .from('store_config').update({ turnstile_widget_id: null, turnstile_site_key: null }).eq('tenant_id', tenantId)
      if (clearError) {
        return NextResponse.json({ error: `No se pudo soltar el widget de Turnstile: ${clearError.message}. La tienda NO se borró.` }, { status: 500 })
      }
      try {
        await removeDomainFromWidgetPool(widgetId, tenantRow.domain)
      } catch (e) {
        console.error('[delete-tenant] no se pudo quitar el dominio del pool de Turnstile', e)
        await service.from('store_config').update({ turnstile_widget_id: widgetId }).eq('tenant_id', tenantId)
        return NextResponse.json({
          error: `No se pudo quitar el dominio del widget de Turnstile (${e instanceof Error ? e.message : 'error desconocido'}). La tienda NO se borró${dominioQuitado ? ', pero el dominio ya se había sacado de Vercel' : ''}. Podés reintentar.`,
        }, { status: 502 })
      }
    }
  }

  // ── 4. Base de datos ────────────────────────────────────────────────────
  // import_jobs y withdrawal_requests tienen FK sin cascada y bloquean el
  // borrado del tenant: se borran primero (import_job_logs cascadea).
  for (const table of ['import_jobs', 'withdrawal_requests']) {
    const { error } = await service.from(table).delete().eq('tenant_id', tenantId)
    if (error) {
      return NextResponse.json({ error: `No se pudo borrar ${table}: ${error.message}. La tienda NO se borró.` }, { status: 500 })
    }
  }

  // Cascadea: productos (variantes, precios, imágenes, categorías de producto),
  // categorías, pedidos (items), clientes, store_config, store_assets, usuarios
  // del panel, cobros, visitas, notificaciones, etc.
  const { error: deleteError } = await service.from('tenants').delete().eq('id', tenantId)
  if (deleteError) {
    return NextResponse.json({
      error: `${deleteError.message}. Ya se canceló el débito${dominioQuitado ? ' y se quitó el dominio' : ''}; reintentá o revisá a mano.`,
    }, { status: 500 })
  }

  // La cuenta de gounuri.com del dueño pasa a tenant_id NULL (SET NULL): se
  // borra con los ids que se juntaron antes. Es mejor esfuerzo.
  if (gounuriAccountIds.length > 0) {
    const { error } = await service.from('gounuri_accounts').delete().in('id', gounuriAccountIds)
    if (error) warnings.push(`No se pudo borrar la cuenta de gounuri.com asociada: ${error.message}`)
  }

  // ── 5. Limpieza posterior (mejor esfuerzo) ──────────────────────────────
  let archivosBorrados = 0
  let archivosPendientes = 0
  for (const { bucket, paths } of archivos) {
    for (const batch of chunk(paths, 100)) {
      if (Date.now() - t0 > TIME_BUDGET_MS) { archivosPendientes += batch.length; continue }
      const { data, error } = await service.storage.from(bucket).remove(batch)
      if (error) {
        archivosPendientes += batch.length
        console.error(`[delete-tenant] no se pudieron borrar archivos de ${bucket}`, error.message)
      } else {
        archivosBorrados += data?.length ?? 0
      }
    }
  }
  if (archivosPendientes > 0) {
    warnings.push(`Quedaron ${archivosPendientes} archivos sin borrar de Storage (la limpieza semanal los va a sacar).`)
  }

  let usuariosBorrados = 0
  let usuariosPendientes = 0
  let usuariosConservados = 0
  for (const batch of chunk(authIds, 10)) {
    if (Date.now() - t0 > TIME_BUDGET_MS) { usuariosPendientes += batch.length; continue }
    await Promise.all(batch.map(async (id) => {
      const { data: found } = await service.auth.admin.getUserById(id)
      if (!found?.user) return // ya no existe
      if (isSuperAdmin(found.user.email)) { usuariosConservados++; return }
      const { error } = await service.auth.admin.deleteUser(id)
      if (error) {
        usuariosPendientes++
        console.error('[delete-tenant] no se pudo borrar el usuario de login', id, error.message)
      } else {
        usuariosBorrados++
      }
    }))
  }
  if (usuariosPendientes > 0) {
    warnings.push(`Quedaron ${usuariosPendientes} usuarios de login sin borrar (Supabase > Authentication).`)
  }

  return NextResponse.json({
    ok: true,
    preapprovalsCancelled: cancelled,
    dominioQuitado,
    archivosBorrados,
    usuariosBorrados,
    usuariosConservados,
    ...(warnings.length ? { warning: warnings.join(' ') } : {}),
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseCsv, csvRowsToObjects } from '@/lib/csv'

function toBool(v: string, fallback = true): boolean {
  const t = v.trim().toLowerCase()
  if (t === '') return fallback
  return !['0', 'false', 'no', 'inactivo'].includes(t)
}

/**
 * Importación CSV de clientes — pensada para migrar clientes desde otra
 * tienda/plataforma. Upsert por email dentro del tenant (o por cliente_id si
 * viene en el CSV, ej: reimportar un export previo de esta misma tienda).
 */
export async function POST(req: NextRequest) {
  try {
    const text = await req.text()
    if (!text.trim()) return NextResponse.json({ error: 'Archivo vacío' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const service = createServiceClient()
    const { data: userRows } = await service.from('users').select('tenant_id').eq('id', user.id).limit(1)
    const tenantId = userRows?.[0]?.tenant_id
    if (!tenantId) return NextResponse.json({ error: 'Usuario sin tienda asignada' }, { status: 400 })

    const objects = csvRowsToObjects(parseCsv(text))
    if (objects.length === 0) return NextResponse.json({ error: 'El CSV no tiene filas de datos' }, { status: 400 })

    const { data: existing } = await service.from('customers').select('id, email').eq('tenant_id', tenantId)
    const byId = new Map((existing ?? []).map((c: any) => [c.id, c]))
    const byEmail = new Map((existing ?? []).filter((c: any) => c.email).map((c: any) => [c.email.toLowerCase(), c]))

    let created = 0, updated = 0
    const errors: string[] = []

    for (let i = 0; i < objects.length; i++) {
      const row = objects[i]
      const rowNum = i + 2
      try {
        const email = row['email']?.trim()
        const nombre = row['nombre']?.trim()
        if (!email && !nombre) { errors.push(`Fila ${rowNum}: falta email y nombre, se salteó.`); continue }

        const payload: Record<string, any> = {
          full_name: nombre || null,
          last_name: row['apellido']?.trim() || null,
          phone: row['telefono']?.trim() || null,
          address_street: row['direccion_calle']?.trim() || null,
          address_city: row['direccion_localidad']?.trim() || null,
          address_province: row['direccion_provincia']?.trim() || null,
          address_zip: row['direccion_cp']?.trim() || null,
          cuit: row['cuit']?.trim() || null,
          company_name: row['empresa']?.trim() || null,
          email: email || null,
          type: (row['tipo']?.trim() || 'retail'),
          active: toBool(row['activo'] ?? ''),
        }

        const cliente_id = row['cliente_id']?.trim()
        const matchedById = cliente_id && byId.has(cliente_id) ? cliente_id : null
        const matchedByEmail = !matchedById && email ? byEmail.get(email.toLowerCase()) : null
        const targetId = matchedById ?? matchedByEmail?.id

        if (targetId) {
          const { error } = await service.from('customers').update(payload).eq('id', targetId).eq('tenant_id', tenantId)
          if (error) throw new Error(error.message)
          updated++
        } else {
          const { error } = await service.from('customers').insert({
            id: randomUUID(), tenant_id: tenantId, ...payload,
          })
          if (error) throw new Error(error.message)
          created++
        }
      } catch (rowErr: any) {
        errors.push(`Fila ${rowNum}: ${rowErr.message}`)
      }
    }

    return NextResponse.json({ ok: true, created, updated, errors })
  } catch (error: any) {
    console.error('Error importando CSV de clientes:', error)
    return NextResponse.json({ error: error.message ?? 'Error interno' }, { status: 500 })
  }
}

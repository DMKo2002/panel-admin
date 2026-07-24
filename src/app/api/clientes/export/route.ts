import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { toCsv } from '@/lib/csv'

const HEADERS = [
  'cliente_id', 'nombre', 'apellido', 'telefono',
  'direccion_calle', 'direccion_localidad', 'direccion_provincia', 'direccion_cp',
  'cuit', 'empresa', 'email', 'tipo', 'activo',
]

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const service = createServiceClient()
  const { data: userRows } = await service.from('users').select('tenant_id').eq('id', user.id).limit(1)
  const tenantId = userRows?.[0]?.tenant_id
  if (!tenantId) return NextResponse.json({ error: 'Usuario sin tienda asignada' }, { status: 400 })

  const { data: customers } = await service
    .from('customers')
    .select('id, full_name, last_name, phone, address_street, address_city, address_province, address_zip, cuit, company_name, email, type, active')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  const rows: (string | number)[][] = [HEADERS]
  for (const c of customers ?? []) {
    rows.push([
      c.id, c.full_name ?? '', c.last_name ?? '', c.phone ?? '',
      c.address_street ?? '', c.address_city ?? '', c.address_province ?? '', c.address_zip ?? '',
      c.cuit ?? '', (c as any).company_name ?? '', c.email ?? '', c.type ?? 'retail', c.active ? '1' : '0',
    ])
  }

  const csv = toCsv(rows)
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="clientes-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}

// ============================================================
//  Helpers de agregación para las páginas de Estadísticas
// ============================================================
import { SupabaseClient } from '@supabase/supabase-js'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export interface MonthRange {
  year: number
  month: number // 1-12
  startISO: string
  endISO: string
  daysInMonth: number
  label: string
  param: string // "YYYY-MM"
  prevParam: string
  nextParam: string
  isCurrentMonth: boolean
}

/**
 * Calcula el rango del mes a partir de un query param "YYYY-MM".
 * Si no viene o es inválido, usa el mes actual.
 */
export function getMonthRange(monthParam?: string): MonthRange {
  const now = new Date()
  let year = now.getFullYear()
  let month = now.getMonth() + 1 // 1-12

  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split('-').map(Number)
    if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12) {
      year = y
      month = m
    }
  }

  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 1) // primer día del mes siguiente (exclusive)
  const daysInMonth = new Date(year, month, 0).getDate()

  const prevDate = new Date(year, month - 2, 1)
  const nextDate = new Date(year, month, 1)

  const pad = (n: number) => String(n).padStart(2, '0')

  const nowIsCurrent = year === now.getFullYear() && month === now.getMonth() + 1

  return {
    year,
    month,
    startISO: start.toISOString(),
    endISO: end.toISOString(),
    daysInMonth,
    label: `${MESES[month - 1]} ${year}`,
    param: `${year}-${pad(month)}`,
    prevParam: `${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}`,
    nextParam: `${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}`,
    isCurrentMonth: nowIsCurrent,
  }
}

export interface YearRange {
  year: number
  startISO: string
  endISO: string
  label: string
  param: string // "YYYY"
  prevParam: string
  nextParam: string
  isCurrentYear: boolean
}

/** Rango anual a partir de un query param "YYYY". Si no viene o es inválido, usa el año actual. */
export function getYearRange(yearParam?: string): YearRange {
  const now = new Date()
  let year = now.getFullYear()
  if (yearParam && /^\d{4}$/.test(yearParam)) {
    const y = Number(yearParam)
    if (y >= 2000 && y <= 2100) year = y
  }
  return {
    year,
    startISO: new Date(year, 0, 1).toISOString(),
    endISO: new Date(year + 1, 0, 1).toISOString(),
    label: String(year),
    param: String(year),
    prevParam: String(year - 1),
    nextParam: String(year + 1),
    isCurrentYear: year === now.getFullYear(),
  }
}

export const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
export { MESES }

export interface OrderRow {
  id: string
  total: number
  created_at: string
  status: string
}

/** Trae los pedidos (no cancelados) del rango de fechas, para ingresos/pedidos/ticket promedio */
export async function fetchOrdersForRange(
  supabase: SupabaseClient,
  tenantId: string,
  range: Pick<MonthRange, 'startISO' | 'endISO'>
): Promise<OrderRow[]> {
  // Paginado: PostgREST corta en 1000 filas por request, y en modo anual
  // un año de pedidos puede pasarse de eso.
  const PAGE = 1000
  const all: OrderRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from('orders')
      .select('id, total, created_at, status')
      .eq('tenant_id', tenantId)
      .neq('status', 'cancelled')
      .gte('created_at', range.startISO)
      .lt('created_at', range.endISO)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    const rows = (data ?? []) as OrderRow[]
    all.push(...rows)
    if (rows.length < PAGE) break
  }
  return all
}

export interface SalesItemRow {
  productId: string | null
  productName: string
  categoryId: string | null
  categoryName: string
  sku: string | null
  variantLabel: string | null
  quantity: number
  subtotal: number
}

/** Trae los items vendidos (no cancelados) del rango, con producto/categoría/sku resueltos */
export async function fetchSalesItemsForRange(
  supabase: SupabaseClient,
  tenantId: string,
  range: Pick<MonthRange, 'startISO' | 'endISO'>
): Promise<SalesItemRow[]> {
  const PAGE = 1000
  const data: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data: page } = await supabase
    .from('orders')
    .select(`
      id, status, created_at,
      order_items (
        product_name, variant_desc, quantity, unit_price, subtotal, variant_id,
        variants (
          size, color,
          products ( id, name, sku, category_id, categories ( id, name ) )
        )
      )
    `)
    .eq('tenant_id', tenantId)
    .neq('status', 'cancelled')
    .gte('created_at', range.startISO)
    .lt('created_at', range.endISO)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .range(from, from + PAGE - 1)
    const rows = (page ?? []) as any[]
    data.push(...rows)
    if (rows.length < PAGE) break
  }

  const rows: SalesItemRow[] = []

  for (const order of (data ?? []) as any[]) {
    for (const item of order.order_items ?? []) {
      const variant = item.variants
      const product = variant?.products
      const category = product?.categories

      let variantLabel: string | null = item.variant_desc ?? null
      if (variant && (variant.size || variant.color)) {
        variantLabel = [variant.size, variant.color].filter(Boolean).join(' / ')
      }

      rows.push({
        productId: product?.id ?? null,
        productName: product?.name ?? item.product_name ?? 'Producto eliminado',
        categoryId: category?.id ?? null,
        categoryName: category?.name ?? 'Sin categoría',
        sku: product?.sku ?? null,
        variantLabel,
        quantity: item.quantity ?? 0,
        subtotal: item.subtotal ?? 0,
      })
    }
  }

  return rows
}

export interface DayRevenue {
  day: number
  total: number
}

/** Agrupa el total de pedidos por día del mes (1..daysInMonth) */
export function aggregateRevenueByDay(orders: OrderRow[], range: MonthRange): DayRevenue[] {
  const byDay = new Map<number, number>()
  for (let d = 1; d <= range.daysInMonth; d++) byDay.set(d, 0)

  for (const order of orders) {
    const d = new Date(order.created_at)
    // created_at es UTC; lo llevamos a día local del mes seleccionado
    const day = d.getDate()
    byDay.set(day, (byDay.get(day) ?? 0) + (order.total ?? 0))
  }

  return Array.from(byDay.entries()).map(([day, total]) => ({ day, total }))
}

export interface MonthRevenue {
  month: number // 1-12
  total: number
}

/** Agrupa el total de pedidos por mes del año (1..12) */
export function aggregateRevenueByMonth(orders: OrderRow[]): MonthRevenue[] {
  const byMonth = new Array<number>(12).fill(0)
  for (const order of orders) {
    const m = new Date(order.created_at).getMonth()
    byMonth[m] += order.total ?? 0
  }
  return byMonth.map((total, i) => ({ month: i + 1, total }))
}

export interface CategoryAgg {
  categoryId: string | null
  categoryName: string
  quantity: number
  netSales: number
}

export function aggregateByCategory(items: SalesItemRow[]): CategoryAgg[] {
  const map = new Map<string, CategoryAgg>()
  for (const item of items) {
    const key = item.categoryId ?? item.categoryName
    const existing = map.get(key)
    if (existing) {
      existing.quantity += item.quantity
      existing.netSales += item.subtotal
    } else {
      map.set(key, {
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        quantity: item.quantity,
        netSales: item.subtotal,
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity)
}

export interface ProductAgg {
  productId: string | null
  productName: string
  categoryName: string
  skus: string[]
  variants: string[]
  quantity: number
  netSales: number
}

export function aggregateByProduct(items: SalesItemRow[]): ProductAgg[] {
  const map = new Map<string, ProductAgg>()
  for (const item of items) {
    const key = item.productId ?? item.productName
    const existing = map.get(key)
    if (existing) {
      existing.quantity += item.quantity
      existing.netSales += item.subtotal
      if (item.sku && !existing.skus.includes(item.sku)) existing.skus.push(item.sku)
      if (item.variantLabel && !existing.variants.includes(item.variantLabel)) existing.variants.push(item.variantLabel)
    } else {
      map.set(key, {
        productId: item.productId,
        productName: item.productName,
        categoryName: item.categoryName,
        skus: item.sku ? [item.sku] : [],
        variants: item.variantLabel ? [item.variantLabel] : [],
        quantity: item.quantity,
        netSales: item.subtotal,
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity)
}

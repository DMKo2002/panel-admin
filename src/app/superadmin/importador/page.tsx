import { createClient } from '@supabase/supabase-js'
import ImportadorClient, { TenantOption, ImportJobRow } from './ImportadorClient'

// Superadmin > Importador CSV — reemplaza correr importar-*.py a mano:
// elegís tenant + CSV de WooCommerce, se sube en lotes desde acá. Ver
// SQL/importar-iruda.py para la lógica original de la que sale ésta, y
// Gounuri Obsidian/Pendientes/Importador CSV.md para el pedido original.
export default async function ImportadorPage() {
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: tenants } = await serviceClient
    .from('tenants')
    .select('id, name, slug, template')
    .order('name', { ascending: true })

  const { data: recentJobs } = await serviceClient
    .from('import_jobs')
    .select('id, tenant_id, status, image_quality, stock_mode, total_products, processed_products, products_created, products_skipped, images_uploaded, images_failed, created_at, csv_filename')
    .order('created_at', { ascending: false })
    .limit(15)

  const tenantOptions: TenantOption[] = (tenants ?? []).map((t: any) => ({ id: t.id, name: t.name, slug: t.slug, template: t.template }))
  const tenantNameById = new Map(tenantOptions.map(t => [t.id, t.name]))

  const jobs: ImportJobRow[] = (recentJobs ?? []).map((j: any) => ({
    id: j.id,
    tenantId: j.tenant_id,
    tenantName: tenantNameById.get(j.tenant_id) ?? j.tenant_id,
    status: j.status,
    imageQuality: j.image_quality,
    stockMode: j.stock_mode,
    totalProducts: j.total_products,
    processedProducts: j.processed_products,
    productsCreated: j.products_created,
    productsSkipped: j.products_skipped,
    imagesUploaded: j.images_uploaded,
    imagesFailed: j.images_failed,
    createdAt: j.created_at,
    csvFilename: j.csv_filename,
  }))

  return <ImportadorClient tenants={tenantOptions} recentJobs={jobs} />
}

// ============================================================
//  Tipos TypeScript - mapeados al schema de Supabase
// ============================================================

export type UserRole = 'superadmin' | 'owner' | 'staff'
export type CustomerType = 'retail' | 'wholesale'
export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'
export type PaymentMethod = 'mercadopago' | 'transfer'
export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'failed'
export type PriceType = 'retail' | 'wholesale'
export type NotifChannel = 'whatsapp' | 'email' | 'sms'
export type PanelTheme = 'default' | 'dark'
// 'sizes_colors' = matriz de talle/color (indumentaria, default). 'simple' =
// una sola variante por producto, sin talle/color (ej: cosmética/skincare).
export type VariantMode = 'sizes_colors' | 'simple'

export interface Tenant {
  id: string
  slug: string
  name: string
  domain: string | null
  plan: 'basic' | 'pro' | 'enterprise'
  active: boolean
  created_at: string
}

export interface Branch {
  name: string
  address: string
  phone?: string
}

export interface CustomShippingMethod {
  name: string
  price: number
  active: boolean
  // Si es true, el método no tiene precio fijo — se muestra "A convenir" en
  // vez del precio y no se suma nada al total del pedido (se coordina aparte
  // con el cliente). `price` se ignora mientras esto esté en true.
  priceOnRequest?: boolean
  // Lista de transportes/empresas que el cliente puede elegir al seleccionar
  // este método (ej: "Expreso / Contrareembolso" -> Vía Cargo, Cruz del Sur...).
  // Si está vacía o no existe, el método no muestra selector de transporte.
  carriers?: string[]
}

export interface StoreConfig {
  id: string
  tenant_id: string
  logo_url: string | null
  hero_image_url: string | null
  hero_thumb1_url: string | null
  hero_thumb2_url: string | null
  primary_color: string
  whatsapp_number: string | null
  notification_email: string | null
  mp_enabled: boolean
  mp_access_token: string | null
  mp_public_key: string | null
  transfer_enabled: boolean
  transfer_cbu: string | null
  transfer_alias: string | null
  min_order_amount: number | null
  // Mínimo global de unidades por variante (talle/color) para poder agregarla
  // al carrito. Los productos pueden sobreescribirlo con Product.min_qty.
  min_qty_per_variant: number
  oca_enabled: boolean
  andreani_enabled: boolean
  pickup_enabled: boolean
  notify_wa_new_order: boolean
  notify_email_new_order: boolean
  notify_wa_low_stock: boolean
  notify_wa_pending_transfer: boolean
  updated_at: string
  andreani_usuario: string | null
  andreani_password: string | null
  andreani_codigo_cliente: string | null
  andreani_contrato_dom: string | null
  andreani_cp_origen: string | null
  andreani_sandbox: boolean
  andreani_peso_default_g: number
  andreani_tarifa_fallback: number
  store_address: string | null
  pickup_address: string | null
  instagram_url: string | null
  facebook_url: string | null
  tiktok_url: string | null
  branches: Branch[]
  price_visibility: 'all' | 'logged_in' | 'wholesale_only'
  registration_visibility: 'both' | 'retail_only' | 'wholesale_only'
  custom_shipping: CustomShippingMethod[]
  panel_theme: PanelTheme
  variant_mode: VariantMode
  panel_accent_color: string | null
  terms_and_conditions: string | null
  privacy_policy: string | null
  cookies_policy: string | null
}

export interface Customer {
  id: string
  tenant_id: string
  // Vínculo con la identidad global de Supabase Auth (auth.users.id). id (arriba)
  // es propio de esta fila/tienda — una misma persona puede tener una fila de
  // customer por tienda, todas con el mismo auth_user_id.
  auth_user_id: string | null
  email: string
  full_name: string | null
  phone: string | null
  type: CustomerType
  address_street: string | null
  address_city: string | null
  address_province: string | null
  address_zip: string | null
  active: boolean
  created_at: string
}

export interface Category {
  id: string
  tenant_id: string
  parent_id: string | null
  name: string
  slug: string
  sort_order: number
  active: boolean
}

export interface Product {
  id: string
  tenant_id: string
  category_id: string | null
  name: string
  slug: string
  description: string | null
  active: boolean
  created_at: string
  updated_at: string
  // Mínimo de unidades por variante (talle/color) para este producto puntual.
  // null/vacío = usa el mínimo global de la tienda (store_config.min_qty_per_variant).
  min_qty: number | null
  product_images?: ProductImage[]
  variants?: Variant[]
  categories?: Category
}

export interface ProductImage {
  id: string
  product_id: string
  url: string
  sort_order: number
  is_cover: boolean
}

export interface Variant {
  id: string
  product_id: string
  size: string | null
  color: string | null
  sku: string | null
  stock: number
  low_stock_alert: number
  active: boolean
  price_rules?: PriceRule[]
}

export interface PriceRule {
  id: string
  variant_id: string
  type: PriceType
  min_qty: number
  price: number
  compare_at_price: number | null
  active: boolean
}

export interface Order {
  id: string
  tenant_id: string
  customer_id: string | null
  status: OrderStatus
  payment_method: PaymentMethod
  payment_status: PaymentStatus
  mp_payment_id: string | null
  subtotal: number
  shipping_cost: number
  total: number
  shipping_method: string | null
  shipping_address: Record<string, string> | null
  tracking_code: string | null
  notes: string | null
  created_at: string
  updated_at: string
  customers?: Customer
  order_items?: OrderItem[]
}

export interface OrderItem {
  id: string
  order_id: string
  variant_id: string | null
  product_name: string
  variant_desc: string | null
  quantity: number
  unit_price: number
  price_type: PriceType
  subtotal: number
}

export interface NotificationLog {
  id: string
  tenant_id: string
  order_id: string | null
  channel: NotifChannel
  recipient: string
  subject: string | null
  status: 'sent' | 'failed' | 'pending'
  error_msg: string | null
  sent_at: string
  orders?: Order
}

// ============================================================
//  Tipos TypeScript — mapeados al schema de Supabase
// ============================================================

export type UserRole = 'superadmin' | 'owner' | 'staff'
export type CustomerType = 'retail' | 'wholesale'
export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'
export type PaymentMethod = 'mercadopago' | 'transfer'
export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'failed'
export type PriceType = 'retail' | 'wholesale'
export type NotifChannel = 'whatsapp' | 'email' | 'sms'

export interface Tenant {
  id: string
  slug: string
  name: string
  domain: string | null
  plan: 'basic' | 'pro' | 'enterprise'
  active: boolean
  created_at: string
}

export interface StoreConfig {
  id: string
  tenant_id: string
  logo_url: string | null
  primary_color: string
  whatsapp_number: string | null
  notification_email: string | null
  mp_enabled: boolean
  transfer_enabled: boolean
  transfer_cbu: string | null
  transfer_alias: string | null
  oca_enabled: boolean
  andreani_enabled: boolean
  pickup_enabled: boolean
  notify_wa_new_order: boolean
  notify_email_new_order: boolean
  notify_wa_low_stock: boolean
  notify_wa_pending_transfer: boolean
  updated_at: string
}

export interface Customer {
  id: string
  tenant_id: string
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

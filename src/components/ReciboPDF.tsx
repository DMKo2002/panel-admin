import {
  Document, Page, Text, View, StyleSheet, Font
} from '@react-pdf/renderer'

// Estilos del PDF
const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 50,
    backgroundColor: '#FFFFFF',
    color: '#1C1C1C',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 32,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  storeName: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: '#1C1C1C',
    letterSpacing: 1,
  },
  reciboLabel: {
    fontSize: 11,
    color: '#888',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  orderId: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#1C1C1C',
  },
  orderDate: {
    fontSize: 9,
    color: '#888',
    marginTop: 3,
  },

  // Secciones
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 8,
  },

  // Grid 2 columnas
  row2: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 20,
  },
  col: {
    flex: 1,
    backgroundColor: '#F9F9F9',
    padding: 12,
    borderRadius: 4,
  },
  colLabel: {
    fontSize: 8,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  colValue: {
    fontSize: 10,
    color: '#1C1C1C',
    lineHeight: 1.5,
  },

  // Tabla de items
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F2F2F2',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 3,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  tableRowLast: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  colProducto: { flex: 3 },
  colCantidad: { flex: 1, textAlign: 'center' },
  colPrecio: { flex: 1.5, textAlign: 'right' },
  colSubtotal: { flex: 1.5, textAlign: 'right' },
  headerText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cellText: {
    fontSize: 9,
    color: '#333',
  },
  cellTextBold: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#1C1C1C',
  },

  // Totales
  totalesSection: {
    marginTop: 12,
    alignItems: 'flex-end',
  },
  totalesBox: {
    width: 220,
  },
  totalesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  totalesLabel: {
    fontSize: 9,
    color: '#666',
  },
  totalesValue: {
    fontSize: 9,
    color: '#1C1C1C',
    fontFamily: 'Helvetica-Bold',
  },
  totalFinalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1.5,
    borderTopColor: '#1C1C1C',
    marginTop: 4,
  },
  totalFinalLabel: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#1C1C1C',
  },
  totalFinalValue: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#1C1C1C',
  },

  // Estado de pago
  estadoBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    marginTop: 8,
    alignSelf: 'flex-end',
  },
  estadoText: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 50,
    right: 50,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    paddingTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 8,
    color: '#AAA',
  },
})

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n)
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-AR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
}

function getEstadoStyle(status: string) {
  switch (status) {
    case 'paid': return { bg: '#ECFDF5', color: '#065F46' }
    case 'pending': return { bg: '#FFFBEB', color: '#92400E' }
    case 'failed': return { bg: '#FEF2F2', color: '#991B1B' }
    default: return { bg: '#F3F4F6', color: '#374151' }
  }
}

function getEstadoLabel(status: string) {
  const labels: Record<string, string> = {
    paid: 'Pagado',
    pending: 'Pago pendiente',
    failed: 'Pago fallido',
    refunded: 'Reembolsado',
  }
  return labels[status] ?? status
}

interface ReciboPDFProps {
  order: any
  storeName: string
  storeEmail: string
  storeWhatsapp: string
  storeCbu: string
  storeAlias: string
}

export function ReciboPDF({
  order,
  storeName,
  storeEmail,
  storeWhatsapp,
  storeCbu,
  storeAlias,
}: ReciboPDFProps) {
  const customer = order.customers
  const items = order.order_items ?? []
  const estadoStyle = getEstadoStyle(order.payment_status)

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* HEADER */}
        <View style={styles.header}>
          <View>
            <Text style={styles.storeName}>{storeName.toUpperCase()}</Text>
            <Text style={styles.reciboLabel}>Comprobante de compra</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.orderId}>#{order.id.slice(0, 8).toUpperCase()}</Text>
            <Text style={styles.orderDate}>{formatDate(order.created_at)}</Text>
          </View>
        </View>

        {/* DATOS DEL COMPRADOR Y PAGO */}
        <View style={styles.row2}>
          {/* Comprador */}
          <View style={styles.col}>
            <Text style={styles.colLabel}>Datos del comprador</Text>
            {customer?.full_name && <Text style={styles.colValue}>{customer.full_name}</Text>}
            {customer?.email && <Text style={styles.colValue}>{customer.email}</Text>}
            {customer?.phone && <Text style={styles.colValue}>{customer.phone}</Text>}
            {customer?.address_street && (
              <Text style={styles.colValue}>
                {customer.address_street}
                {customer.address_city ? `, ${customer.address_city}` : ''}
                {customer.address_province ? `, ${customer.address_province}` : ''}
                {customer.address_zip ? ` (${customer.address_zip})` : ''}
              </Text>
            )}
            {!customer?.full_name && <Text style={[styles.colValue, { color: '#AAA' }]}>Sin datos de cliente</Text>}
          </View>

          {/* Pago */}
          <View style={styles.col}>
            <Text style={styles.colLabel}>Método de pago</Text>
            <Text style={styles.colValue}>
              {order.payment_method === 'mercadopago' ? 'MercadoPago' : 'Transferencia bancaria'}
            </Text>
            {order.payment_method === 'transfer' && storeCbu && (
              <Text style={[styles.colValue, { marginTop: 4 }]}>CBU: {storeCbu}</Text>
            )}
            {order.payment_method === 'transfer' && storeAlias && (
              <Text style={styles.colValue}>Alias: {storeAlias}</Text>
            )}
            {order.mp_payment_id && (
              <Text style={[styles.colValue, { color: '#888', fontSize: 8, marginTop: 4 }]}>
                ID: {order.mp_payment_id}
              </Text>
            )}
            {order.shipping_method && (
              <>
                <Text style={[styles.colLabel, { marginTop: 10 }]}>Envío</Text>
                <Text style={styles.colValue}>
                  {order.shipping_method === 'oca' ? 'OCA' :
                   order.shipping_method === 'andreani' ? 'Andreani' : 'Retiro en local'}
                </Text>
                {order.tracking_code && (
                  <Text style={[styles.colValue, { color: '#888', fontSize: 8 }]}>
                    Tracking: {order.tracking_code}
                  </Text>
                )}
              </>
            )}
          </View>
        </View>

        {/* TABLA DE ITEMS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detalle del pedido</Text>

          {/* Header tabla */}
          <View style={styles.tableHeader}>
            <Text style={[styles.headerText, styles.colProducto]}>Producto</Text>
            <Text style={[styles.headerText, styles.colCantidad]}>Cant.</Text>
            <Text style={[styles.headerText, styles.colPrecio]}>Precio unit.</Text>
            <Text style={[styles.headerText, styles.colSubtotal]}>Subtotal</Text>
          </View>

          {/* Rows */}
          {items.map((item: any, i: number) => (
            <View key={item.id} style={i === items.length - 1 ? styles.tableRowLast : styles.tableRow}>
              <View style={styles.colProducto}>
                <Text style={styles.cellTextBold}>{item.product_name}</Text>
                {item.variant_desc && (
                  <Text style={[styles.cellText, { color: '#888', fontSize: 8, marginTop: 2 }]}>
                    {item.variant_desc}
                  </Text>
                )}
                {item.price_type === 'wholesale' && (
                  <Text style={[styles.cellText, { color: '#92400E', fontSize: 8, marginTop: 1 }]}>
                    Precio mayorista
                  </Text>
                )}
              </View>
              <Text style={[styles.cellText, styles.colCantidad]}>{item.quantity}</Text>
              <Text style={[styles.cellText, styles.colPrecio]}>{formatPrice(item.unit_price)}</Text>
              <Text style={[styles.cellTextBold, styles.colSubtotal]}>{formatPrice(item.unit_price * item.quantity)}</Text>
            </View>
          ))}
        </View>

        {/* TOTALES */}
        <View style={styles.totalesSection}>
          <View style={styles.totalesBox}>
            {order.shipping_cost > 0 && (
              <>
                <View style={styles.totalesRow}>
                  <Text style={styles.totalesLabel}>Subtotal</Text>
                  <Text style={styles.totalesValue}>{formatPrice(order.subtotal)}</Text>
                </View>
                <View style={styles.totalesRow}>
                  <Text style={styles.totalesLabel}>Envío</Text>
                  <Text style={styles.totalesValue}>{formatPrice(order.shipping_cost)}</Text>
                </View>
              </>
            )}
            <View style={styles.totalFinalRow}>
              <Text style={styles.totalFinalLabel}>TOTAL</Text>
              <Text style={styles.totalFinalValue}>{formatPrice(order.total)}</Text>
            </View>

            {/* Badge estado */}
            <View style={[styles.estadoBadge, { backgroundColor: estadoStyle.bg }]}>
              <Text style={[styles.estadoText, { color: estadoStyle.color }]}>
                {getEstadoLabel(order.payment_status)}
              </Text>
            </View>
          </View>
        </View>

        {/* FOOTER */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{storeName}</Text>
          <Text style={styles.footerText}>
            {[storeEmail, storeWhatsapp].filter(Boolean).join(' · ')}
          </Text>
          <Text style={styles.footerText}>
            Generado el {new Date().toLocaleDateString('es-AR')}
          </Text>
        </View>

      </Page>
    </Document>
  )
}

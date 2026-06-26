import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

// Etiqueta de envío A5 sin precios — 2 por hoja A4 al imprimir
const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    padding: 28,
    backgroundColor: '#FFFFFF',
    color: '#1C1C1C',
  },

  // Número de pedido grande
  orderNumber: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 16,
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    paddingBottom: 12,
  },

  // Bloque remitente
  section: { marginBottom: 14 },
  sectionLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  box: {
    borderWidth: 1.5,
    borderColor: '#1C1C1C',
    borderRadius: 4,
    padding: 12,
  },
  boxDestino: {
    borderWidth: 2.5,
    borderColor: '#1C1C1C',
    borderRadius: 4,
    padding: 14,
  },
  name:    { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#1C1C1C', marginBottom: 4 },
  address: { fontSize: 11, color: '#333', lineHeight: 1.6 },
  phone:   { fontSize: 10, color: '#666', marginTop: 4 },

  // Productos (solo nombre y cantidad, sin precio)
  itemsSection: { marginTop: 14 },
  itemsTitle: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  itemName: { fontSize: 9, color: '#333', flex: 1 },
  itemVariant: { fontSize: 8, color: '#888', flex: 1, marginTop: 2 },
  itemQty: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#1C1C1C', textAlign: 'right' },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 28,
    right: 28,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: { fontSize: 7, color: '#BBB' },
})

interface EtiquetaEnvioPDFProps {
  order: any
  storeName: string
  storeAddress?: string
  storeWhatsapp?: string
}

export function EtiquetaEnvioPDF({
  order, storeName, storeAddress, storeWhatsapp,
}: EtiquetaEnvioPDFProps) {
  const customer = order.customers
  const items: any[] = order.order_items ?? []

  const shipStreet   = order.shipping_address?.street   ?? customer?.address_street   ?? ''
  const shipCity     = order.shipping_address?.city     ?? customer?.address_city     ?? ''
  const shipProvince = order.shipping_address?.province ?? customer?.address_province ?? ''
  const shipZip      = order.shipping_address?.zip      ?? customer?.address_zip      ?? ''

  const addressLine2 = [shipCity, shipProvince].filter(Boolean).join(', ') + (shipZip ? `  CP ${shipZip}` : '')

  return (
    <Document>
      <Page size="A5" style={styles.page}>

        {/* Número de pedido */}
        <Text style={styles.orderNumber}>
          Pedido #{order.id.slice(0, 8).toUpperCase()}
        </Text>

        {/* Remitente */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>De</Text>
          <View style={styles.box}>
            <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#1C1C1C', marginBottom: 3 }}>
              {storeName}
            </Text>
            {storeAddress && <Text style={styles.address}>{storeAddress}</Text>}
            {storeWhatsapp && <Text style={styles.phone}>Tel: {storeWhatsapp}</Text>}
          </View>
        </View>

        {/* Destinatario — caja más grande y prominente */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Para</Text>
          <View style={styles.boxDestino}>
            <Text style={styles.name}>{customer?.full_name ?? 'Sin nombre'}</Text>
            {shipStreet    && <Text style={styles.address}>{shipStreet}</Text>}
            {addressLine2.trim() && <Text style={styles.address}>{addressLine2}</Text>}
            {customer?.phone && <Text style={styles.phone}>Tel: {customer.phone}</Text>}
          </View>
        </View>

        {/* Contenido del paquete — sin precios */}
        {items.length > 0 && (
          <View style={styles.itemsSection}>
            <Text style={styles.itemsTitle}>Contenido</Text>
            {items.map((item: any, i: number) => (
              <View key={item.id ?? i} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.product_name}</Text>
                  {item.variant_desc && <Text style={styles.itemVariant}>{item.variant_desc}</Text>}
                </View>
                <Text style={styles.itemQty}>x{item.quantity}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{storeName}</Text>
          <Text style={styles.footerText}>{new Date(order.created_at).toLocaleDateString('es-AR')}</Text>
        </View>

      </Page>
    </Document>
  )
}

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    paddingTop: 36,
    paddingBottom: 50,
    paddingHorizontal: 45,
    backgroundColor: '#FFFFFF',
    color: '#1C1C1C',
  },

  // ── DISPATCH BOX (top of page — big and clear for couriers) ────────────────
  dispatchBox: {
    borderWidth: 2,
    borderColor: '#1C1C1C',
    borderRadius: 4,
    padding: 14,
    marginBottom: 20,
    flexDirection: 'row',
    gap: 16,
  },
  dispatchFrom: { flex: 1, borderRightWidth: 1, borderRightColor: '#DDDDDD', paddingRight: 14 },
  dispatchTo: { flex: 2 },
  dispatchLabel: {
    fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#888',
    textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 5,
  },
  dispatchName:    { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#1C1C1C', marginBottom: 3 },
  dispatchAddress: { fontSize: 10, color: '#333', lineHeight: 1.6 },
  dispatchSmall:   { fontSize: 9, color: '#666', marginTop: 2 },

  // ── HEADER ─────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  storeName:    { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#1C1C1C', letterSpacing: 1 },
  reciboLabel:  { fontSize: 9, color: '#888', marginTop: 3, textTransform: 'uppercase', letterSpacing: 1 },
  headerRight:  { alignItems: 'flex-end' },
  orderId:      { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#1C1C1C' },
  orderDate:    { fontSize: 9, color: '#888', marginTop: 3 },

  // ── INFO GRID ──────────────────────────────────────────────────────────────
  row2:       { flexDirection: 'row', gap: 12, marginBottom: 18 },
  col:        { flex: 1, backgroundColor: '#F9F9F9', padding: 10, borderRadius: 4 },
  colLabel:   { fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  colValue:   { fontSize: 9.5, color: '#1C1C1C', lineHeight: 1.55 },
  colSmall:   { fontSize: 8, color: '#555', lineHeight: 1.5 },

  // ── TABLE ──────────────────────────────────────────────────────────────────
  sectionTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#888', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 },
  tableContainer: { marginBottom: 14 },
  tableHeader: {
    flexDirection: 'row', backgroundColor: '#EFEFEF',
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 3, marginBottom: 1,
  },
  tableRow:    { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', alignItems: 'flex-start' },
  tableRowLast:{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, alignItems: 'flex-start' },
  tableRowAlt: { backgroundColor: '#FAFAFA' },
  colProd:     { flex: 4 },
  colQty:      { flex: 1, textAlign: 'center' },
  colPrice:    { flex: 2, textAlign: 'right' },
  colTotal:    { flex: 2, textAlign: 'right' },
  headerCell:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#555', textTransform: 'uppercase', letterSpacing: 0.5 },
  cellText:    { fontSize: 9, color: '#333' },
  cellBold:    { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#1C1C1C' },
  cellSmall:   { fontSize: 7.5, color: '#888', marginTop: 2 },
  badgeWholesale: { fontSize: 7.5, color: '#92400E', backgroundColor: '#FEF3C7', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2, marginTop: 3, alignSelf: 'flex-start' },
  badgeRetail:    { fontSize: 7.5, color: '#065F46', backgroundColor: '#D1FAE5', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2, marginTop: 3, alignSelf: 'flex-start' },

  // ── TOTALS ─────────────────────────────────────────────────────────────────
  totalesSection: { marginTop: 4, alignItems: 'flex-end' },
  totalesBox:     { width: 200 },
  totalesRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalesLabel:   { fontSize: 9, color: '#666' },
  totalesValue:   { fontSize: 9, color: '#1C1C1C', fontFamily: 'Helvetica-Bold' },
  totalFinalRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderTopWidth: 1.5, borderTopColor: '#1C1C1C', marginTop: 4 },
  totalFinalLabel:{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#1C1C1C' },
  totalFinalValue:{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#1C1C1C' },
  estadoBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 3, marginTop: 6, alignSelf: 'flex-end' },
  estadoText:  { fontSize: 9, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },

  // ── NOTES ─────────────────────────────────────────────────────────────────
  notasBox:   { marginTop: 14, backgroundColor: '#FFFBEB', padding: 10, borderRadius: 4, borderLeftWidth: 3, borderLeftColor: '#F59E0B' },
  notasLabel: { fontSize: 8, color: '#92400E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  notasText:  { fontSize: 9, color: '#78350F', lineHeight: 1.5 },

  // ── FOOTER ─────────────────────────────────────────────────────────────────
  footer: {
    position: 'absolute', bottom: 22, left: 45, right: 45,
    borderTopWidth: 1, borderTopColor: '#E5E5E5',
    paddingTop: 7, flexDirection: 'row', justifyContent: 'space-between',
  },
  footerText: { fontSize: 8, color: '#AAA' },
})

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
}
function getEstadoStyle(status: string) {
  const map: Record<string, { bg: string; color: string }> = {
    paid:      { bg: '#ECFDF5', color: '#065F46' },
    pending:   { bg: '#FFFBEB', color: '#92400E' },
    failed:    { bg: '#FEF2F2', color: '#991B1B' },
    refunded:  { bg: '#F3F4F6', color: '#374151' },
  }
  return map[status] ?? { bg: '#F3F4F6', color: '#374151' }
}
function getEstadoLabel(status: string) {
  const map: Record<string, string> = { paid: 'Pagado', pending: 'Pago pendiente', failed: 'Pago fallido', refunded: 'Reembolsado' }
  return map[status] ?? status
}

interface ReciboPDFProps {
  order: any
  storeName: string
  storeEmail: string
  storeWhatsapp: string
  storeCbu: string
  storeAlias: string
  storeAddress?: string
  pdfShowVariant?:   boolean
  pdfShowPricetype?: boolean
  pdfShowAddress?:   boolean
  pdfShowNotes?:     boolean
}

export function ReciboPDF({
  order, storeName, storeEmail, storeWhatsapp, storeCbu, storeAlias, storeAddress,
  pdfShowVariant   = true,
  pdfShowPricetype = true,
  pdfShowAddress   = true,
  pdfShowNotes     = true,
}: ReciboPDFProps) {
  const customer = order.customers
  const items: any[] = order.order_items ?? []
  const estadoStyle = getEstadoStyle(order.payment_status)

  // Shipping address: prefer order.shipping_address, fall back to customer address
  const shipStreet   = order.shipping_address?.street   ?? customer?.address_street ?? ''
  const shipCity     = order.shipping_address?.city     ?? customer?.address_city ?? ''
  const shipProvince = order.shipping_address?.province ?? customer?.address_province ?? ''
  const shipZip      = order.shipping_address?.zip      ?? customer?.address_zip ?? ''
  const hasShipAddr  = !!(shipStreet || shipCity)

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* ── DISPATCH BOX — recipient info prominent at the top ── */}
        {pdfShowAddress && hasShipAddr && (
          <View style={styles.dispatchBox}>
            {/* From */}
            <View style={styles.dispatchFrom}>
              <Text style={styles.dispatchLabel}>Remitente</Text>
              <Text style={styles.dispatchName}>{storeName}</Text>
              {storeAddress ? <Text style={styles.dispatchAddress}>{storeAddress}</Text> : null}
              {storeWhatsapp ? <Text style={styles.dispatchSmall}>Tel: {storeWhatsapp}</Text> : null}
            </View>
            {/* To */}
            <View style={styles.dispatchTo}>
              <Text style={styles.dispatchLabel}>Destinatario</Text>
              <Text style={styles.dispatchName}>{customer?.full_name ?? 'Sin nombre'}</Text>
              {shipStreet   && <Text style={styles.dispatchAddress}>{shipStreet}</Text>}
              {(shipCity || shipProvince) && (
                <Text style={styles.dispatchAddress}>
                  {[shipCity, shipProvince].filter(Boolean).join(', ')}
                  {shipZip ? `  (CP ${shipZip})` : ''}
                </Text>
              )}
              {customer?.phone && <Text style={styles.dispatchSmall}>Tel: {customer.phone}</Text>}
            </View>
          </View>
        )}

        {/* ── HEADER ── */}
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

        {/* ── INFO COMPRADOR + PAGO ── */}
        <View style={styles.row2}>
          {/* Comprador */}
          <View style={styles.col}>
            <Text style={styles.colLabel}>Datos del comprador</Text>
            {customer?.full_name
              ? <Text style={styles.colValue}>{customer.full_name}</Text>
              : <Text style={[styles.colValue, { color: '#AAA' }]}>Sin datos de cliente</Text>
            }
            {customer?.email && <Text style={styles.colSmall}>{customer.email}</Text>}
            {customer?.phone && <Text style={styles.colSmall}>{customer.phone}</Text>}
            {pdfShowAddress && customer?.address_street && (
              <Text style={[styles.colSmall, { marginTop: 4 }]}>
                {[customer.address_street, customer.address_city, customer.address_province, customer.address_zip && `(${customer.address_zip})`].filter(Boolean).join(', ')}
              </Text>
            )}
          </View>

          {/* Pago + Envío */}
          <View style={styles.col}>
            <Text style={styles.colLabel}>Método de pago</Text>
            <Text style={styles.colValue}>
              {order.payment_method === 'mercadopago' ? 'MercadoPago' : 'Transferencia bancaria'}
            </Text>
            {order.payment_method === 'transfer' && storeCbu  && <Text style={[styles.colSmall, { marginTop: 3 }]}>CBU: {storeCbu}</Text>}
            {order.payment_method === 'transfer' && storeAlias && <Text style={styles.colSmall}>Alias: {storeAlias}</Text>}
            {order.mp_payment_id && <Text style={[styles.colSmall, { color: '#AAA', marginTop: 3 }]}>ID MP: {order.mp_payment_id}</Text>}
            {order.shipping_method && (
              <>
                <Text style={[styles.colLabel, { marginTop: 10 }]}>Envío</Text>
                <Text style={styles.colValue}>
                  {order.shipping_method === 'oca' ? 'OCA'
                   : order.shipping_method === 'andreani' ? 'Andreani'
                   : 'Retiro en local'}
                </Text>
                {order.tracking_code && <Text style={styles.colSmall}>Tracking: {order.tracking_code}</Text>}
              </>
            )}
          </View>
        </View>

        {/* ── TABLA DE PRODUCTOS ── */}
        <View style={styles.tableContainer}>
          <Text style={styles.sectionTitle}>Detalle del pedido</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, styles.colProd]}>Producto</Text>
            <Text style={[styles.headerCell, styles.colQty]}>Cant.</Text>
            <Text style={[styles.headerCell, styles.colPrice]}>Precio unit.</Text>
            <Text style={[styles.headerCell, styles.colTotal]}>Subtotal</Text>
          </View>
          {items.length === 0 && (
            <View style={styles.tableRow}><Text style={[styles.cellText, { flex: 1, color: '#AAA' }]}>Sin productos registrados</Text></View>
          )}
          {items.map((item: any, i: number) => {
            const isLast = i === items.length - 1
            const isAlt  = i % 2 === 1
            return (
              <View key={item.id ?? i} style={[isLast ? styles.tableRowLast : styles.tableRow, isAlt ? styles.tableRowAlt : {}]}>
                <View style={styles.colProd}>
                  <Text style={styles.cellBold}>{item.product_name}</Text>
                                    {pdfShowVariant && item.variant_desc && (
                    <Text style={styles.cellSmall}>{item.variant_desc}</Text>
                  )}
                  {pdfShowPricetype && item.price_type && (
                    <Text style={item.price_type === 'wholesale' ? styles.badgeWholesale : styles.badgeRetail}>
                      {item.price_type === 'wholesale' ? 'Mayorista' : 'Minorista'}
                    </Text>
                  )}
                </View>
                <Text style={[styles.cellText, styles.colQty]}>{item.quantity}</Text>
                <Text style={[styles.cellText, styles.colPrice]}>{formatPrice(item.unit_price)}</Text>
                <Text style={[styles.cellText, styles.colTotal]}>{formatPrice(item.subtotal ?? item.unit_price * item.quantity)}</Text>
              </View>
            )
          })}
        </View>

        {/* ── TOTALES ── */}
        <View style={styles.totalesSection}>
          <View style={styles.totalesBox}>
            {order.shipping_cost > 0 && (
              <View style={styles.totalesRow}>
                <Text style={styles.totalesLabel}>Subtotal</Text>
                <Text style={styles.totalesValue}>{formatPrice(order.subtotal ?? order.total)}</Text>
              </View>
            )}
            {order.shipping_cost > 0 && (
              <View style={styles.totalesRow}>
                <Text style={styles.totalesLabel}>Envío</Text>
                <Text style={styles.totalesValue}>{formatPrice(order.shipping_cost)}</Text>
              </View>
            )}
            {order.discount_amount > 0 && (
              <View style={styles.totalesRow}>
                <Text style={styles.totalesLabel}>Descuento</Text>
                <Text style={[styles.totalesValue, { color: '#DC2626' }]}>-{formatPrice(order.discount_amount)}</Text>
              </View>
            )}
            <View style={styles.totalFinalRow}>
              <Text style={styles.totalFinalLabel}>TOTAL</Text>
              <Text style={styles.totalFinalValue}>{formatPrice(order.total)}</Text>
            </View>
            <View style={[styles.estadoBadge, { backgroundColor: estadoStyle.bg }]}>
              <Text style={[styles.estadoText, { color: estadoStyle.color }]}>{getEstadoLabel(order.payment_status)}</Text>
            </View>
          </View>
        </View>

        {/* ── NOTAS ── */}
        {pdfShowNotes && order.notes && (
          <View style={styles.notasBox}>
            <Text style={styles.notasLabel}>Notas del pedido</Text>
            <Text style={styles.notasText}>{order.notes}</Text>
          </View>
        )}

        {/* ── FOOTER ── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{storeName}</Text>
          <Text style={styles.footerText}>{storeEmail}{storeWhatsapp ? '  ·  ' + storeWhatsapp : ''}</Text>
        </View>

      </Page>
    </Document>
  )
}

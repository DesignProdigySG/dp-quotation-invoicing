import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1a1d23" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  title: { fontSize: 20, fontWeight: 700 },
  docNumber: { fontSize: 11, color: "#6b7280", marginTop: 4 },
  section: { marginBottom: 18 },
  label: { fontSize: 8, textTransform: "uppercase", color: "#6b7280", marginBottom: 2 },
  value: { fontSize: 11, marginBottom: 8 },
  table: { marginTop: 10, borderTopWidth: 1, borderTopColor: "#e2e5ea" },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e5ea",
    paddingVertical: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f0f1f3",
    paddingVertical: 6,
  },
  colDesc: { width: "50%" },
  colQty: { width: "15%", textAlign: "right" },
  colPrice: { width: "17.5%", textAlign: "right" },
  colTotal: { width: "17.5%", textAlign: "right" },
  headerText: { fontSize: 8, textTransform: "uppercase", color: "#6b7280" },
  totalsBlock: { marginTop: 16, alignItems: "flex-end" },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", width: 200, marginBottom: 4 },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 200,
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#1a1d23",
  },
  grandText: { fontWeight: 700, fontSize: 12 },
  notes: { marginTop: 24, fontSize: 9, color: "#6b7280" },
  statusBadge: { fontSize: 9, color: "#6b7280", marginTop: 4 },
  fxSecondaryRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    width: 200,
    marginBottom: 4,
    marginTop: -2,
  },
  fxSecondaryText: { fontSize: 8, color: "#9ca3af" },
});

function money(amount: number, currency: string) {
  return `${currency} ${amount.toFixed(2)}`;
}

export type DocPdfProps = {
  docType: "QUOTATION" | "INVOICE";
  docNumber: string;
  docDate: string;
  dueDate?: string | null;
  reference?: string | null;
  status: string;
  client: {
    name: string;
    contact_name?: string | null;
    contact_email?: string | null;
    billing_address?: string | null;
  };
  currency: string;
  gstRate: number;
  gstApplicable: boolean;
  exchangeRate?: number | null;
  displayCurrency: "original" | "sgd";
  lineItems: { description: string; quantity: number; unit_price: number }[];
  notes?: string | null;
  preparedBy?: { name: string; title?: string | null } | null;
};

export default function DocumentPdf({
  docType,
  docNumber,
  docDate,
  dueDate,
  reference,
  status,
  client,
  currency,
  gstRate,
  gstApplicable,
  exchangeRate,
  displayCurrency,
  lineItems,
  notes,
  preparedBy,
}: DocPdfProps) {
  const subtotal = lineItems.reduce((s, li) => s + li.quantity * li.unit_price, 0);
  const gstAmount = subtotal * ((gstApplicable ? gstRate : 0) / 100);
  const total = subtotal + gstAmount;

  const isForeignCurrency = currency.toUpperCase() !== "SGD";
  const showDualCurrency = isForeignCurrency && !!exchangeRate;
  const sgdSubtotal = showDualCurrency ? subtotal * exchangeRate! : 0;
  const sgdGstAmount = showDualCurrency ? gstAmount * exchangeRate! : 0;
  const sgdTotal = showDualCurrency ? total * exchangeRate! : 0;
  const showSgdAsPrimary = showDualCurrency && displayCurrency === "sgd";
  const primaryCurrency = showSgdAsPrimary ? "SGD" : currency;
  const displaySubtotal = showSgdAsPrimary ? sgdSubtotal : subtotal;
  const displayGstAmount = showSgdAsPrimary ? sgdGstAmount : gstAmount;
  const displayTotal = showSgdAsPrimary ? sgdTotal : total;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>{docType === "QUOTATION" ? "Quotation" : "Invoice"}</Text>
            <Text style={styles.docNumber}>{docNumber}</Text>
            <Text style={styles.statusBadge}>Status: {status}</Text>
            {reference && <Text style={styles.statusBadge}>Reference: {reference}</Text>}
          </View>
          <View>
            <Text style={styles.label}>Date</Text>
            <Text style={styles.value}>{docDate}</Text>
            {dueDate && (
              <>
                <Text style={styles.label}>Due date</Text>
                <Text style={styles.value}>{dueDate}</Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Bill to</Text>
          <Text style={styles.value}>{client.name}</Text>
          {client.billing_address && (
            <Text style={styles.value}>{client.billing_address}</Text>
          )}
          {client.contact_name && <Text style={styles.value}>{client.contact_name}</Text>}
          {client.contact_email && <Text style={styles.value}>{client.contact_email}</Text>}
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.colDesc, styles.headerText]}>Description</Text>
            <Text style={[styles.colQty, styles.headerText]}>Qty</Text>
            <Text style={[styles.colPrice, styles.headerText]}>Unit price</Text>
            <Text style={[styles.colTotal, styles.headerText]}>Total</Text>
          </View>
          {lineItems.map((li, idx) => (
            <View style={styles.tableRow} key={idx}>
              <Text style={styles.colDesc}>{li.description}</Text>
              <Text style={styles.colQty}>{li.quantity}</Text>
              <Text style={styles.colPrice}>{money(li.unit_price, currency)}</Text>
              <Text style={styles.colTotal}>{money(li.quantity * li.unit_price, currency)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text>Subtotal</Text>
            <Text>{money(displaySubtotal, primaryCurrency)}</Text>
          </View>
          {showDualCurrency && showSgdAsPrimary && (
            <View style={styles.fxSecondaryRow}>
              <Text style={styles.fxSecondaryText}>({money(subtotal, currency)})</Text>
            </View>
          )}
          {gstApplicable && (
            <>
              <View style={styles.totalsRow}>
                <Text>GST ({gstRate}%)</Text>
                <Text>{money(displayGstAmount, primaryCurrency)}</Text>
              </View>
              {showDualCurrency && (
                <View style={styles.fxSecondaryRow}>
                  <Text style={styles.fxSecondaryText}>
                    {showSgdAsPrimary
                      ? `(${money(gstAmount, currency)})`
                      : `SGD equivalent: ${money(sgdGstAmount, "SGD")}`}
                  </Text>
                </View>
              )}
            </>
          )}
          <View style={styles.grandRow}>
            <Text style={styles.grandText}>Total</Text>
            <Text style={styles.grandText}>{money(displayTotal, primaryCurrency)}</Text>
          </View>
          {showDualCurrency && (
            <View style={styles.fxSecondaryRow}>
              <Text style={styles.fxSecondaryText}>
                {showSgdAsPrimary
                  ? `(${money(total, currency)})`
                  : `SGD equivalent: ${money(sgdTotal, "SGD")}`}
              </Text>
            </View>
          )}
        </View>

        {notes && (
          <View style={styles.notes}>
            <Text style={styles.label}>Notes</Text>
            <Text>{notes}</Text>
          </View>
        )}

        {preparedBy?.name && (
          <View style={styles.notes}>
            <Text style={styles.label}>Prepared by</Text>
            <Text>
              {preparedBy.name}
              {preparedBy.title ? `, ${preparedBy.title}` : ""}
            </Text>
          </View>
        )}
      </Page>
    </Document>
  );
}

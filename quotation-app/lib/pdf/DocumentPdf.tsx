import type { ReactNode } from "react";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { fontFor, DEFAULT_FONT_FAMILY } from "./fonts";
import { getLogoDataUri } from "./logo";
import { BRAND } from "./brand";
import { formatDisplayDate } from "../format";

const LOGO_DATA_URI = getLogoDataUri();

const styles = StyleSheet.create({
  page: {
    paddingTop: 150,
    paddingBottom: 40,
    paddingHorizontal: 40,
    fontSize: 10,
    fontFamily: DEFAULT_FONT_FAMILY,
    color: "#1a1d23",
  },
  logoContainer: { position: "absolute", top: 30, left: 40 },
  logo: { width: 280, height: 80, objectFit: "contain" },
  headerRow: { marginBottom: 20 },
  title: { fontSize: 20, fontWeight: 700 },
  docNumber: { fontSize: 11, color: "#6b7280", marginTop: 4 },
  section: { marginBottom: 18 },
  label: { fontSize: 8, textTransform: "uppercase", color: "#6b7280", marginBottom: 2 },
  value: { fontSize: 11, marginBottom: 8 },
  accentDivider: {
    borderBottomWidth: 2,
    borderBottomColor: BRAND.accentColor,
    marginBottom: 20,
  },
  metaSection: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  metaColLeft: { width: "58%" },
  metaColRight: { width: "38%" },
  metaRow: { flexDirection: "row", marginBottom: 8, alignItems: "flex-start" },
  metaLabel: { width: 90, fontSize: 9, color: "#6b7280" },
  metaValue: { flex: 1, fontSize: 9.5, color: "#1a1d23" },
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
  signature: { width: 110, height: 44, marginBottom: 6, objectFit: "contain" },
  termsSection: { marginTop: 24 },
  termsHeading: { fontSize: 9, fontWeight: 700, marginBottom: 6 },
  termsParagraph: { fontSize: 8, color: "#6b7280", marginBottom: 6, lineHeight: 1.4 },
  footerSection: { marginTop: 40, flexDirection: "row", justifyContent: "space-between" },
  footerCol: { width: "47%" },
  footerColTitle: { fontSize: 10, fontWeight: 700, marginBottom: 16 },
  footerRow: { marginBottom: 14 },
  footerLabel: { fontSize: 8, textTransform: "uppercase", color: "#6b7280", marginBottom: 3 },
  footerValue: { fontSize: 10 },
  footerSignatureImage: { width: 110, height: 40, marginTop: 4, objectFit: "contain" },
});

function money(amount: number, currency: string) {
  return `${currency} ${amount.toFixed(2)}`;
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <View style={styles.metaValue}>{children}</View>
    </View>
  );
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
  preparedBy?: {
    name: string;
    title?: string | null;
    signatureDataUri?: string | null;
  } | null;
  preparedByEmail?: string | null;
  validUntil?: string | null;
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
  preparedByEmail,
  validUntil,
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

  const isQuotation = docType === "QUOTATION";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {LOGO_DATA_URI && (
          <View style={styles.logoContainer} fixed>
            <Image style={styles.logo} src={LOGO_DATA_URI} />
          </View>
        )}

        <View style={styles.headerRow}>
          <Text style={styles.title}>{isQuotation ? "Quotation" : "Invoice"}</Text>
        </View>

        <View style={styles.accentDivider} />

        <View style={styles.metaSection}>
          <View style={styles.metaColLeft}>
            <MetaRow label={isQuotation ? "Quotation Number" : "Invoice Number"}>
              <Text style={[styles.footerValue, { fontFamily: fontFor(docNumber) }]}>
                {docNumber}
              </Text>
            </MetaRow>
            <MetaRow label="Company Name">
              <Text style={styles.footerValue}>{BRAND.companyName}</Text>
            </MetaRow>
            <MetaRow label="Address">
              {BRAND.companyAddress.map((line, idx) => (
                <Text key={idx} style={styles.footerValue}>
                  {line}
                </Text>
              ))}
            </MetaRow>
            <MetaRow label="Bill To">
              <Text style={[styles.footerValue, { fontFamily: fontFor(client.name) }]}>
                {client.name}
              </Text>
              {client.billing_address && (
                <Text style={[styles.footerValue, { fontFamily: fontFor(client.billing_address) }]}>
                  {client.billing_address}
                </Text>
              )}
              {client.contact_name && (
                <Text style={[styles.footerValue, { fontFamily: fontFor(client.contact_name) }]}>
                  {client.contact_name}
                </Text>
              )}
              {client.contact_email && (
                <Text style={styles.footerValue}>{client.contact_email}</Text>
              )}
            </MetaRow>
          </View>

          <View style={styles.metaColRight}>
            <MetaRow label="Created Date">
              <Text style={styles.footerValue}>{formatDisplayDate(docDate)}</Text>
            </MetaRow>
            {preparedBy?.name && (
              <MetaRow label="Prepared By">
                <Text style={[styles.footerValue, { fontFamily: fontFor(preparedBy.name) }]}>
                  {preparedBy.name}
                </Text>
              </MetaRow>
            )}
            {preparedByEmail && (
              <MetaRow label="Email">
                <Text style={styles.footerValue}>{preparedByEmail}</Text>
              </MetaRow>
            )}
            {isQuotation && validUntil && (
              <MetaRow label="Expiration Date">
                <Text style={styles.footerValue}>{formatDisplayDate(validUntil)}</Text>
              </MetaRow>
            )}
            {!isQuotation && dueDate && (
              <MetaRow label="Due Date">
                <Text style={styles.footerValue}>{formatDisplayDate(dueDate)}</Text>
              </MetaRow>
            )}
            {!isQuotation && reference && (
              <MetaRow label="Reference">
                <Text style={[styles.footerValue, { fontFamily: fontFor(reference) }]}>
                  {reference}
                </Text>
              </MetaRow>
            )}
          </View>
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
              <Text style={[styles.colDesc, { fontFamily: fontFor(li.description) }]}>
                {li.description}
              </Text>
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
            <Text style={{ fontFamily: fontFor(notes) }}>{notes}</Text>
          </View>
        )}

        {isQuotation && (
          <View style={styles.termsSection}>
            <Text style={styles.termsHeading}>Payment Terms</Text>
            <Text style={styles.termsParagraph}>{BRAND.paymentTerms}</Text>
            <Text style={styles.termsHeading}>Terms &amp; Conditions</Text>
            {BRAND.termsAndConditions.map((paragraph, idx) => (
              <Text key={idx} style={styles.termsParagraph}>
                {paragraph}
              </Text>
            ))}
          </View>
        )}

        {isQuotation ? (
          <View style={styles.footerSection} wrap={false}>
            <View style={styles.footerCol}>
              <Text style={styles.footerColTitle}>Quote accepted by:</Text>
              <View style={styles.footerRow}>
                <Text style={styles.footerLabel}>Signature</Text>
              </View>
              <View style={styles.footerRow}>
                <Text style={styles.footerLabel}>Name</Text>
              </View>
              <View style={styles.footerRow}>
                <Text style={styles.footerLabel}>Designation</Text>
              </View>
              <View style={styles.footerRow}>
                <Text style={styles.footerLabel}>Date</Text>
              </View>
            </View>

            <View style={styles.footerCol}>
              <Text style={styles.footerColTitle}>Quote prepared by:</Text>
              <View style={styles.footerRow}>
                <Text style={styles.footerLabel}>Signature</Text>
                {preparedBy?.signatureDataUri && (
                  <Image style={styles.footerSignatureImage} src={preparedBy.signatureDataUri} />
                )}
              </View>
              <View style={styles.footerRow}>
                <Text style={styles.footerLabel}>Name</Text>
                {preparedBy?.name && (
                  <Text style={[styles.footerValue, { fontFamily: fontFor(preparedBy.name) }]}>
                    {preparedBy.name}
                  </Text>
                )}
              </View>
              <View style={styles.footerRow}>
                <Text style={styles.footerLabel}>Designation</Text>
                {preparedBy?.title && (
                  <Text style={[styles.footerValue, { fontFamily: fontFor(preparedBy.title) }]}>
                    {preparedBy.title}
                  </Text>
                )}
              </View>
              <View style={styles.footerRow}>
                <Text style={styles.footerLabel}>Date</Text>
                <Text style={styles.footerValue}>{formatDisplayDate(docDate)}</Text>
              </View>
            </View>
          </View>
        ) : (
          preparedBy?.name && (
            <View style={styles.notes} wrap={false}>
              <Text style={styles.label}>Prepared by</Text>
              {preparedBy.signatureDataUri && (
                <Image style={styles.signature} src={preparedBy.signatureDataUri} />
              )}
              <Text style={{ fontFamily: fontFor(`${preparedBy.name} ${preparedBy.title || ""}`) }}>
                {preparedBy.name}
                {preparedBy.title ? `, ${preparedBy.title}` : ""}
              </Text>
              <Text style={{ marginTop: 4 }}>{formatDisplayDate(docDate)}</Text>
            </View>
          )
        )}
      </Page>
    </Document>
  );
}

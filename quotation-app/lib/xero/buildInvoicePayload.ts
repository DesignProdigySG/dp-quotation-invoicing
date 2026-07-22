import { Invoice, LineAmountTypes, CurrencyCode } from "xero-node";
import type { XeroConnectionRow } from "./client";

export type InvoiceForXero = {
  invoice_date: string;
  due_date: string | null;
  invoice_number: string | null;
  reference: string | null;
  currency: string;
  gst_applicable: boolean;
  gst_rate: number;
};

export type LineItemForXero = {
  description: string;
  quantity: number;
  unit_price: number;
};

// A small tolerance for float comparison, not a meaningful business rule.
const GST_RATE_TOLERANCE = 0.01;

// Pure function: no I/O, so it's testable with plain fixture data. Throws
// (rather than returning a Xero-rejectable payload) on any mismatch between
// this app's data and how the shared Xero connection is configured — a
// silently-wrong tax amount landing in the user's real accounting system is
// worse than a blocked push.
export function buildInvoicePayload(
  invoice: InvoiceForXero,
  lineItems: LineItemForXero[],
  contactId: string,
  connection: XeroConnectionRow
): Invoice {
  if (invoice.currency.toUpperCase() !== "SGD") {
    throw new Error(
      `Xero push is limited to SGD invoices for now (this invoice is ${invoice.currency}).`
    );
  }
  if (!connection.default_account_code) {
    throw new Error("Xero isn't fully configured yet — set a default account code in Settings.");
  }

  let taxType: string;
  if (invoice.gst_applicable) {
    if (!connection.gst_tax_type || connection.gst_tax_rate == null) {
      throw new Error("Xero isn't fully configured yet — set a GST tax rate in Settings.");
    }
    if (Math.abs(invoice.gst_rate - connection.gst_tax_rate) > GST_RATE_TOLERANCE) {
      throw new Error(
        `This invoice's GST rate (${invoice.gst_rate}%) doesn't match the configured Xero tax rate (${connection.gst_tax_rate}%). Fix the mismatch before pushing — it would otherwise silently push a Xero invoice whose tax doesn't match this app's own totals.`
      );
    }
    taxType = connection.gst_tax_type;
  } else {
    if (!connection.no_gst_tax_type) {
      throw new Error("Xero isn't fully configured yet — set a \"no GST\" tax rate in Settings.");
    }
    taxType = connection.no_gst_tax_type;
  }

  const payload: Invoice = {
    type: Invoice.TypeEnum.ACCREC,
    contact: { contactID: contactId },
    lineItems: lineItems.map((li) => ({
      description: li.description,
      quantity: li.quantity,
      unitAmount: li.unit_price,
      taxType,
      accountCode: connection.default_account_code!,
    })),
    date: invoice.invoice_date,
    dueDate: invoice.due_date ?? undefined,
    invoiceNumber: invoice.invoice_number ?? undefined,
    reference: invoice.reference ?? undefined,
    currencyCode: CurrencyCode.SGD,
    lineAmountTypes: LineAmountTypes.Exclusive,
    status: Invoice.StatusEnum.DRAFT,
  };

  return payload;
}

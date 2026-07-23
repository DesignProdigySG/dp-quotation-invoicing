import type { Invoice as XeroInvoice } from "xero-node";
import { nextAppStatus, type AppStatus } from "./nextAppStatus";

export type InvoiceRowUpdate = {
  xero_status: string | null;
  invoice_number: string;
  xero_push_error: null;
  status?: AppStatus;
};

// Shared by the single-invoice refresh and the bulk check — given the
// invoice's current local state and a freshly-fetched Xero invoice, what
// should change on the local row.
export function computeInvoiceUpdateFromXero(
  current: { status: AppStatus; invoice_number: string },
  fetched: Pick<XeroInvoice, "status" | "invoiceNumber">
): InvoiceRowUpdate {
  const xeroStatus = fetched.status ? String(fetched.status) : null;
  const update: InvoiceRowUpdate = {
    xero_status: xeroStatus,
    // Xero often doesn't assign a real invoice number until the draft is
    // authorised there — don't blank out a number this app already has.
    invoice_number: fetched.invoiceNumber || current.invoice_number,
    xero_push_error: null,
  };
  const target = nextAppStatus(current.status, xeroStatus);
  if (target) update.status = target;
  return update;
}

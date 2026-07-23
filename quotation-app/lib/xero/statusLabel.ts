// Xero's own web UI doesn't show ACCREC invoices using its raw API enum
// values — an AUTHORISED invoice is labeled "Awaiting Payment" to end users,
// for example. This maps the raw `Invoice.status` string (confirmed to be a
// genuine string enum at runtime, e.g. "DRAFT"/"AUTHORISED"/"PAID") to the
// vocabulary Xero itself uses, so the app's UI matches what the user would
// see if they opened the invoice in Xero directly.
const XERO_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Awaiting Approval",
  AUTHORISED: "Awaiting Payment",
  PAID: "Paid",
  VOIDED: "Voided",
  DELETED: "Deleted",
};

export function xeroStatusLabel(status: string | null | undefined): string {
  if (!status) return "Draft";
  return XERO_STATUS_LABELS[status] ?? status;
}

import type { ExtractedPo } from "./extractPoFromEmail";

export type InvoiceForPoMatching = {
  id: string;
  invoice_number: string | null;
  reference: string | null;
};

// Deterministic string match only — no AI tier here. Client identification
// (findClientByEmail / fuzzyMatchClient, reused from lib/email-quote/) already
// does the fuzzy work of narrowing down to one client; once a client is
// known, matching a stated PO/invoice number against that client's own
// invoices is a small enough list that a plain case-insensitive comparison is
// enough — no match just means a manual pick in the review queue.
export function matchInvoiceForPo(
  extracted: ExtractedPo,
  invoices: InvoiceForPoMatching[]
): InvoiceForPoMatching | null {
  const candidates = [extracted.referenced_invoice_number, extracted.po_number]
    .filter((v): v is string => !!v && v.trim() !== "")
    .map((v) => v.trim().toLowerCase());

  if (candidates.length === 0) return null;

  for (const candidate of candidates) {
    const match = invoices.find(
      (inv) =>
        (inv.invoice_number && inv.invoice_number.trim().toLowerCase() === candidate) ||
        (inv.reference && inv.reference.trim().toLowerCase() === candidate)
    );
    if (match) return match;
  }

  return null;
}

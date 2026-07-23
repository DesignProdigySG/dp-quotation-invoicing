"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resolveUnmatchedEmailPo, dismissUnmatchedEmailPo } from "./actions";
import { formatMoney } from "@/lib/format";

type ClientOption = {
  id: string;
  name: string;
};

type InvoiceOption = {
  id: string;
  invoice_number: string | null;
  client_id: string;
  status: string;
  reference: string | null;
  notes: string | null;
  currency: string;
  total: number;
};

type QuotationOption = {
  id: string;
  quote_number: string | null;
  client_id: string;
};

type UnmatchedItem = {
  id: string;
  sender_email: string;
  sender_name: string | null;
  subject: string | null;
  created_at: string;
  parsed_data: unknown;
  suggested_client_id: string | null;
  suggested_client_source: string | null;
  suggested_invoice_id: string | null;
  suggested_invoice_source: string | null;
  suggested_quotation_id: string | null;
};

type ParsedData = {
  client_name?: string;
  po_number?: string;
  description?: string;
  amount?: number;
  notes?: string;
};

export default function PoReviewQueue({
  items,
  clients,
  invoices,
  quotations,
}: {
  items: UnmatchedItem[];
  clients: ClientOption[];
  invoices: InvoiceOption[];
  quotations: QuotationOption[];
}) {
  if (items.length === 0) {
    return <div className="card empty">Nothing waiting on review right now.</div>;
  }

  return (
    <div className="review-queue">
      {items.map((item) => (
        <PoReviewItemCard
          key={item.id}
          item={item}
          clients={clients}
          invoices={invoices}
          quotations={quotations}
        />
      ))}
    </div>
  );
}

function defaultNote(parsed: ParsedData): string {
  const parts: string[] = [];
  if (parsed.po_number) parts.push(`PO ${parsed.po_number}`);
  if (parsed.description) parts.push(parsed.description);
  if (parsed.amount) parts.push(`amount stated: ${parsed.amount}`);
  if (parsed.notes) parts.push(parsed.notes);
  return parts.join(" — ");
}

function matchSourceLabel(source: string | null): string | null {
  if (source === "ai_amount_match") return "Matched by amount/description";
  if (source === "ai_match_via_quotation") return "Matched via linked quotation";
  return null;
}

function PoReviewItemCard({
  item,
  clients,
  invoices,
  quotations,
}: {
  item: UnmatchedItem;
  clients: ClientOption[];
  invoices: InvoiceOption[];
  quotations: QuotationOption[];
}) {
  const router = useRouter();
  const parsed = (item.parsed_data || {}) as ParsedData;

  const [clientId, setClientId] = useState(
    (item.suggested_client_id && clients.some((c) => c.id === item.suggested_client_id)
      ? item.suggested_client_id
      : clients[0]?.id) || ""
  );

  const clientInvoices = invoices.filter((inv) => inv.client_id === clientId);

  const [invoiceId, setInvoiceId] = useState(
    (item.suggested_invoice_id &&
    clientInvoices.some((inv) => inv.id === item.suggested_invoice_id)
      ? item.suggested_invoice_id
      : clientInvoices[0]?.id) || ""
  );
  const [reference, setReference] = useState(parsed.po_number || "");
  const [note, setNote] = useState(defaultNote(parsed));
  const [saving, setSaving] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unconvertedQuotation =
    !item.suggested_invoice_id && item.suggested_quotation_id
      ? quotations.find((q) => q.id === item.suggested_quotation_id)
      : null;

  function handleClientChange(id: string) {
    setClientId(id);
    const firstInvoice = invoices.find((inv) => inv.client_id === id);
    setInvoiceId(firstInvoice?.id || "");
  }

  async function handleAttach() {
    if (!invoiceId) {
      setError("Pick an invoice first");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await resolveUnmatchedEmailPo(item.id, { invoiceId, reference, note });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setSaving(false);
    }
  }

  async function handleDismiss() {
    setDismissing(true);
    setError(null);
    try {
      await dismissUnmatchedEmailPo(item.id);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setDismissing(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <strong>{parsed.client_name || item.sender_name || item.sender_email}</strong>
          <div className="subtitle">
            From {item.sender_email}
            {item.subject ? ` — "${item.subject}"` : ""} ·{" "}
            {new Date(item.created_at).toLocaleString()}
          </div>
        </div>
        <button
          className="btn btn-sm btn-danger"
          onClick={handleDismiss}
          disabled={dismissing || saving}
          type="button"
        >
          {dismissing ? "Dismissing..." : "Dismiss"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {unconvertedQuotation && (
        <div className="notice">
          Matches Quote {unconvertedQuotation.quote_number || unconvertedQuotation.id} — not yet
          invoiced.{" "}
          <a href={`/quotes/${unconvertedQuotation.id}`}>Convert it to an invoice</a>, then come
          back to attach this PO.
        </div>
      )}

      {clients.length === 0 ? (
        <p>You need at least one client to match this PO against an invoice.</p>
      ) : (
        <>
          <div className="row">
            <div>
              <label>Client</label>
              <select value={clientId} onChange={(e) => handleClientChange(e.target.value)}>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {item.suggested_client_id === clientId && item.suggested_client_source && (
                <p className="subtitle" style={{ margin: "4px 0 0" }}>
                  {item.suggested_client_source === "exact_email" && "Matched by email"}
                  {item.suggested_client_source === "email_domain" && "Matched by domain"}
                  {item.suggested_client_source === "ai_fuzzy" && "AI best guess"}
                </p>
              )}
            </div>
            <div>
              <label>Invoice</label>
              {clientInvoices.length > 0 ? (
                <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
                  {clientInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoice_number || inv.id} ({inv.status}) —{" "}
                      {formatMoney(inv.total, inv.currency)}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="subtitle">This client has no invoices yet.</p>
              )}
              {item.suggested_invoice_id === invoiceId && item.suggested_invoice_id && (
                <p className="subtitle" style={{ margin: "4px 0 0" }}>
                  {matchSourceLabel(item.suggested_invoice_source)}
                </p>
              )}
            </div>
          </div>

          <label>Reference (only written onto the invoice if it doesn&apos;t already have one)</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} />

          <label>Note to add to the invoice</label>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />

          <div className="actions" style={{ marginTop: 18 }}>
            <button
              className="btn btn-primary"
              disabled={saving || !invoiceId}
              onClick={handleAttach}
            >
              {saving ? "Attaching..." : "Attach to invoice"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

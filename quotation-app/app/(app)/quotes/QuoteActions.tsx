"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  setQuotationStatus,
  deleteQuotation,
  convertQuotationToInvoice,
  pushQuotationToSalesforce,
} from "./actions";

export default function QuoteActions({
  quoteId,
  status,
  salesforceQuoteId,
  salesforceQuoteNumber,
  salesforcePushError,
}: {
  quoteId: string;
  status: string;
  salesforceQuoteId: string | null;
  salesforceQuoteNumber: string | null;
  salesforcePushError: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(salesforcePushError);

  async function markSent() {
    setBusy(true);
    setError(null);
    try {
      await setQuotationStatus(quoteId, "Sent");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function markAccepted() {
    setBusy(true);
    setError(null);
    try {
      await setQuotationStatus(quoteId, "Accepted");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function convert() {
    setBusy(true);
    setError(null);
    try {
      const invoice = await convertQuotationToInvoice(quoteId);
      router.push(`/invoices/${invoice.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this quotation? This cannot be undone.")) return;
    setBusy(true);
    try {
      await deleteQuotation(quoteId);
      router.push("/quotes");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  async function pushToSalesforce() {
    setBusy(true);
    setError(null);
    try {
      const result = await pushQuotationToSalesforce(quoteId);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <div className="error">{error}</div>}
      <div className="actions">
        <a className="btn" href={`/api/quotes/${quoteId}/pdf`} target="_blank">
          Download PDF
        </a>
        {status === "Draft" && (
          <button className="btn" disabled={busy} onClick={markSent}>
            Mark as sent
          </button>
        )}
        {status === "Sent" && (
          <button className="btn" disabled={busy} onClick={markAccepted}>
            Mark as accepted
          </button>
        )}
        {status !== "Invoiced" && (
          <button className="btn btn-primary" disabled={busy} onClick={convert}>
            Convert to invoice
          </button>
        )}
        {!salesforceQuoteId && (
          <button className="btn" disabled={busy} onClick={pushToSalesforce}>
            Push to Salesforce
          </button>
        )}
        <button className="btn btn-danger" disabled={busy} onClick={remove}>
          Delete
        </button>
      </div>
      {salesforceQuoteId && (
        <p className="subtitle" style={{ marginTop: 8 }}>
          Pushed to Salesforce (Quote #{salesforceQuoteNumber || "—"}).
        </p>
      )}
    </div>
  );
}

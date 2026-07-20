"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setInvoiceStatus, deleteInvoice } from "./actions";

export default function InvoiceActions({
  invoiceId,
  status,
}: {
  invoiceId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markSent() {
    setBusy(true);
    setError(null);
    try {
      await setInvoiceStatus(invoiceId, "Sent");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function markPaid() {
    setBusy(true);
    setError(null);
    try {
      await setInvoiceStatus(invoiceId, "Paid");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this invoice? This cannot be undone.")) return;
    setBusy(true);
    try {
      await deleteInvoice(invoiceId);
      router.push("/invoices");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <div className="error">{error}</div>}
      <div className="actions">
        <a className="btn" href={`/api/invoices/${invoiceId}/pdf`} target="_blank">
          Download PDF
        </a>
        {status === "Draft" && (
          <button className="btn" disabled={busy} onClick={markSent}>
            Mark as sent
          </button>
        )}
        {status === "Sent" && (
          <button className="btn btn-primary" disabled={busy} onClick={markPaid}>
            Mark as paid
          </button>
        )}
        <button className="btn btn-danger" disabled={busy} onClick={remove}>
          Delete
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setInvoiceStatus, deleteInvoice, pushInvoiceToXero, refreshInvoiceFromXero } from "./actions";
import { xeroStatusLabel } from "@/lib/xero/statusLabel";
import { useFormDirty } from "@/lib/forms/FormDirtyContext";

export default function InvoiceActions({
  invoiceId,
  status,
  xeroInvoiceId,
  xeroStatus,
  xeroPushedAt,
  xeroPushError,
}: {
  invoiceId: string;
  status: string;
  xeroInvoiceId: string | null;
  xeroStatus: string | null;
  xeroPushedAt: string | null;
  xeroPushError: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(xeroPushError);
  const [showDirtyConfirm, setShowDirtyConfirm] = useState(false);
  const { isDirty } = useFormDirty();

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

  async function pushToXero() {
    if (isDirty) {
      setShowDirtyConfirm(true);
      return;
    }
    await doPushToXero();
  }

  async function doPushToXero() {
    setShowDirtyConfirm(false);
    setBusy(true);
    setError(null);
    try {
      const result = await pushInvoiceToXero(invoiceId);
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

  async function refreshFromXero() {
    setBusy(true);
    setError(null);
    try {
      const result = await refreshInvoiceFromXero(invoiceId);
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
        {xeroInvoiceId ? (
          <button className="btn" disabled={busy} onClick={refreshFromXero}>
            Refresh from Xero
          </button>
        ) : (
          <button className="btn" disabled={busy} onClick={pushToXero}>
            Push to Xero
          </button>
        )}
        <button className="btn btn-danger" disabled={busy} onClick={remove}>
          Delete
        </button>
      </div>
      {xeroInvoiceId && (
        <p className="subtitle" style={{ marginTop: 8 }}>
          Pushed to Xero (
          <span className={xeroStatus === "VOIDED" ? "xero-voided" : undefined}>
            {xeroStatusLabel(xeroStatus)}
          </span>
          ) on {xeroPushedAt ? new Date(xeroPushedAt).toLocaleDateString() : "—"}. This is
          independent of this app's own status above — mark it paid in Xero separately.
        </p>
      )}

      {showDirtyConfirm && (
        <div className="modal-overlay">
          <div className="modal-content card">
            <div className="page-header">
              <h2>Unsaved changes</h2>
            </div>
            <p>
              This invoice has unsaved changes in the form below that won&apos;t be reflected in
              Xero. Save your changes first if you want them included, or push anyway to send
              what's currently saved.
            </p>
            <div className="actions" style={{ marginTop: 18 }}>
              <button className="btn" type="button" onClick={() => setShowDirtyConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" type="button" onClick={doPushToXero}>
                Push anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

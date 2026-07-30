"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewInvoiceButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function choose(externalQuote: "yes" | "no") {
    setOpen(false);
    if (externalQuote === "yes") {
      // Scan the external quotation into a real quotation record instead of
      // typing its number/line items by hand — convert to an invoice from
      // there via the normal "Convert to invoice" button.
      router.push("/quotes/import");
      return;
    }
    router.push(`/invoices/new?externalQuote=${externalQuote}`);
  }

  return (
    <>
      <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>
        + New invoice
      </button>

      {open && (
        <div className="modal-overlay">
          <div className="modal-content card">
            <div className="page-header">
              <h2>Before you start</h2>
            </div>
            <p>Was a quotation for this invoice generated outside the app?</p>
            <div className="actions" style={{ marginTop: 18 }}>
              <button className="btn" type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn" type="button" onClick={() => choose("no")}>
                No
              </button>
              <button className="btn btn-primary" type="button" onClick={() => choose("yes")}>
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

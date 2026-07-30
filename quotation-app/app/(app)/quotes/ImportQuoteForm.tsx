"use client";

import { useState } from "react";
import QuoteForm from "./QuoteForm";
import { extractQuotationFromUpload, type ExtractedQuotationForImport } from "./actions";

type ClientOption = {
  id: string;
  name: string;
  default_currency: string;
  default_gst_rate: number;
  display_currency_preference: string;
  billing_address: string | null;
};

type BillingAddressOption = {
  id: string;
  client_id: string;
  label: string;
  address: string;
};

export default function ImportQuoteForm({
  clients,
  billingAddresses,
}: {
  clients: ClientOption[];
  billingAddresses: BillingAddressOption[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedQuotationForImport | null>(null);

  async function handleExtract() {
    if (!file) return;
    setExtracting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const result = await extractQuotationFromUpload(formData);
      if (result.error) setError(result.error);
      else if (result.data) setExtracted(result.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to extract the file");
    } finally {
      setExtracting(false);
    }
  }

  if (extracted) {
    return (
      <>
        <p className="notice">
          Extracted from your file — review everything below before saving.
        </p>
        <QuoteForm
          clients={clients}
          billingAddresses={billingAddresses}
          initial={{
            client_id: extracted.suggested_client_id || clients[0]?.id || "",
            quote_date: extracted.quote_date || new Date().toISOString().slice(0, 10),
            currency: extracted.currency || clients[0]?.default_currency || "SGD",
            gst_rate: extracted.gst_rate ?? clients[0]?.default_gst_rate ?? 9,
            gst_applicable: extracted.gst_applicable ?? true,
            display_currency: "original",
            notes: extracted.notes || "",
            valid_until: extracted.valid_until || null,
            title: extracted.client_name ? `Imported — ${extracted.client_name}` : null,
            line_items: extracted.line_items,
          }}
        />
      </>
    );
  }

  return (
    <div className="card">
      {error && <div className="error">{error}</div>}
      <label htmlFor="import-file">Upload a quotation PDF or image built outside the app</label>
      <input
        id="import-file"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
      <div className="actions" style={{ marginTop: 18 }}>
        <button
          className="btn btn-primary"
          type="button"
          disabled={!file || extracting}
          onClick={handleExtract}
        >
          {extracting ? "Extracting…" : "Extract"}
        </button>
      </div>
    </div>
  );
}

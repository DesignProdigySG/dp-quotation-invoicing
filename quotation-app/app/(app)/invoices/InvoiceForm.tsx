"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateInvoice, createInvoice, uploadExternalQuoteFile } from "./actions";
import { formatMoney, computeTotals } from "@/lib/format";
import type { LineItemInput } from "../quotes/actions";
import { useFormDirty } from "@/lib/forms/FormDirtyContext";

type BillingAddressOption = { id: string; client_id?: string; label: string; address: string };

type ClientOption = {
  id: string;
  name: string;
  default_currency: string;
  default_gst_rate: number;
  display_currency_preference: string;
  billing_address: string | null;
};

const ALLOWED_EXTERNAL_QUOTE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
];

export default function InvoiceForm({
  invoiceId,
  currency: initialCurrency,
  gstRate: initialGstRate,
  gstApplicable: initialGstApplicable,
  clientDefaultBillingAddress,
  billingAddresses,
  initial,
  clients,
  externalQuoteStatus,
}: {
  invoiceId?: string;
  currency: string;
  gstRate: number;
  gstApplicable: boolean;
  clientDefaultBillingAddress: string | null;
  billingAddresses: BillingAddressOption[];
  initial?: {
    due_date: string | null;
    reference: string | null;
    exchange_rate: number | null;
    display_currency: "original" | "sgd";
    billing_address_id: string | null;
    billing_address: string | null;
    notes: string;
    line_items: LineItemInput[];
  };
  clients?: ClientOption[];
  externalQuoteStatus?: "has_external_quote" | "no_quote";
}) {
  const router = useRouter();
  const isCreating = !invoiceId;

  const [clientId, setClientId] = useState(clients?.[0]?.id || "");
  const [currency, setCurrency] = useState(initialCurrency);
  const [gstRate, setGstRate] = useState(initialGstRate);
  const [gstApplicable, setGstApplicable] = useState(initialGstApplicable);
  const [dueDate, setDueDate] = useState(initial?.due_date || "");
  const [reference, setReference] = useState(initial?.reference || "");
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number | "">(
    initial?.exchange_rate ?? ""
  );
  const [displayCurrency, setDisplayCurrency] = useState<"original" | "sgd">(
    initial?.display_currency || "original"
  );
  const [billingAddressSelection, setBillingAddressSelection] = useState(
    initial?.billing_address_id ?? (initial?.billing_address ? "__custom__" : "__default__")
  );
  const [billingAddressText, setBillingAddressText] = useState(
    initial?.billing_address ?? clientDefaultBillingAddress ?? ""
  );
  const [notes, setNotes] = useState(initial?.notes || "");
  const [lineItems, setLineItems] = useState<LineItemInput[]>(
    initial?.line_items?.length
      ? initial.line_items
      : [{ description: "", quantity: 1, unit_price: 0 }]
  );
  const [externalQuoteNumber, setExternalQuoteNumber] = useState("");
  const [externalQuoteFile, setExternalQuoteFile] = useState<File | null>(null);
  const [externalQuoteFileError, setExternalQuoteFileError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { setDirty } = useFormDirty();
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setDirty(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    clientId,
    currency,
    gstRate,
    gstApplicable,
    dueDate,
    reference,
    exchangeRate,
    displayCurrency,
    billingAddressSelection,
    billingAddressText,
    notes,
    lineItems,
    externalQuoteNumber,
  ]);

  function handleClientChange(id: string) {
    setClientId(id);
    const c = clients?.find((c) => c.id === id);
    if (c) {
      setCurrency(c.default_currency);
      setGstRate(c.default_gst_rate);
      setDisplayCurrency((c.display_currency_preference as "original" | "sgd") || "original");
      setBillingAddressSelection("__default__");
      setBillingAddressText(c.billing_address || "");
    }
  }

  function handleFileSelected(file: File | null) {
    setExternalQuoteFileError(null);
    if (!file) {
      setExternalQuoteFile(null);
      return;
    }
    if (!ALLOWED_EXTERNAL_QUOTE_TYPES.includes(file.type)) {
      setExternalQuoteFileError("The quotation file must be a PNG, JPG, GIF, WEBP, or PDF");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setExternalQuoteFileError("The quotation file must be under 10MB");
      return;
    }
    setExternalQuoteFile(file);
  }

  function updateLine(idx: number, patch: Partial<LineItemInput>) {
    setLineItems((items) => items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function addLine() {
    setLineItems((items) => [...items, { description: "", quantity: 1, unit_price: 0 }]);
  }

  function removeLine(idx: number) {
    setLineItems((items) => items.filter((_, i) => i !== idx));
  }

  function handleBillingAddressSelect(value: string) {
    setBillingAddressSelection(value);
    if (value === "__default__") {
      setBillingAddressText(clientDefaultBillingAddress || "");
    } else if (value !== "__custom__") {
      const addr = billingAddresses.find((a) => a.id === value);
      if (addr) setBillingAddressText(addr.address);
    }
  }

  const isForeignCurrency = currency.toUpperCase() !== "SGD";
  const effectiveExchangeRate = exchangeRate === "" ? null : Number(exchangeRate);
  const { subtotal, gstAmount, total } = computeTotals(
    lineItems,
    gstApplicable ? gstRate : 0
  );
  const showDualCurrency = isForeignCurrency && !!effectiveExchangeRate;
  const sgdSubtotal = showDualCurrency ? subtotal * effectiveExchangeRate! : 0;
  const sgdGstAmount = showDualCurrency ? gstAmount * effectiveExchangeRate! : 0;
  const sgdTotal = showDualCurrency ? total * effectiveExchangeRate! : 0;
  const showSgdAsPrimary = showDualCurrency && displayCurrency === "sgd";
  const primaryCurrency = showSgdAsPrimary ? "SGD" : currency;
  const displaySubtotal = showSgdAsPrimary ? sgdSubtotal : subtotal;
  const displayGstAmount = showSgdAsPrimary ? sgdGstAmount : gstAmount;
  const displayTotal = showSgdAsPrimary ? sgdTotal : total;

  async function handleSave() {
    if (isCreating && !clientId) {
      setError("Pick a client first");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const billingAddressIdValue = billingAddressSelection.startsWith("__")
        ? null
        : billingAddressSelection;

      if (isCreating) {
        const created = await createInvoice({
          client_id: clientId,
          due_date: dueDate || null,
          reference: reference || null,
          currency,
          gst_rate: gstRate,
          gst_applicable: gstApplicable,
          exchange_rate: isForeignCurrency ? effectiveExchangeRate : null,
          display_currency: isForeignCurrency ? displayCurrency : "original",
          billing_address_id: billingAddressIdValue,
          billing_address: billingAddressText || null,
          notes,
          external_quote_status: externalQuoteStatus!,
          external_quote_number: externalQuoteNumber || null,
          line_items: lineItems.filter((li) => li.description.trim() !== ""),
        });

        if (externalQuoteFile) {
          const formData = new FormData();
          formData.set("file", externalQuoteFile);
          const uploadResult = await uploadExternalQuoteFile(created.id, formData);
          if (uploadResult.error) {
            setError(`Invoice created, but the file upload failed: ${uploadResult.error}`);
          }
        }

        setDirty(false);
        router.push(`/invoices/${created.id}`);
        router.refresh();
        return;
      }

      await updateInvoice(invoiceId!, {
        due_date: dueDate || null,
        reference: reference || null,
        exchange_rate: isForeignCurrency ? effectiveExchangeRate : null,
        display_currency: isForeignCurrency ? displayCurrency : "original",
        billing_address_id: billingAddressIdValue,
        billing_address: billingAddressText || null,
        notes,
        line_items: lineItems.filter((li) => li.description.trim() !== ""),
      });
      setDirty(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (isCreating && (!clients || clients.length === 0)) {
    return (
      <div className="card">
        <p>You need at least one client before creating an invoice.</p>
        <a className="btn btn-primary" href="/clients/new">
          + New client
        </a>
      </div>
    );
  }

  return (
    <div className="card">
      {error && <div className="error">{error}</div>}

      {!reference && !warningDismissed && (
        <div className="warning">
          No reference number set.
          <button
            className="btn btn-sm"
            type="button"
            onClick={() => setWarningDismissed(true)}
            style={{ marginLeft: 8 }}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="row">
        {isCreating && (
          <div>
            <label htmlFor="client">Client</label>
            <select id="client" value={clientId} onChange={(e) => handleClientChange(e.target.value)}>
              {clients!.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="due_date">Due date</label>
          <input
            id="due_date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="reference">Reference</label>
          <input
            id="reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="currency">Currency</label>
          <input
            id="currency"
            value={currency}
            disabled={!isCreating}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          />
        </div>
        <div>
          <label htmlFor="gst_rate">GST %</label>
          <input
            id="gst_rate"
            type="number"
            step="0.01"
            value={gstRate}
            disabled={!isCreating || !gstApplicable}
            onChange={(e) => setGstRate(Number(e.target.value))}
          />
        </div>
      </div>

      {isCreating && (
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={gstApplicable}
            onChange={(e) => setGstApplicable(e.target.checked)}
          />
          Apply GST
        </label>
      )}

      {isCreating && externalQuoteStatus === "has_external_quote" && (
        <>
          <label htmlFor="external_quote_number">External quotation number</label>
          <input
            id="external_quote_number"
            value={externalQuoteNumber}
            onChange={(e) => setExternalQuoteNumber(e.target.value)}
            placeholder="e.g. Q-1234"
          />

          <label htmlFor="external_quote_file">Upload the quotation (image or PDF)</label>
          <input
            id="external_quote_file"
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => handleFileSelected(e.target.files?.[0] || null)}
          />
          {externalQuoteFileError && <div className="error">{externalQuoteFileError}</div>}
          {externalQuoteFile && <p className="subtitle">{externalQuoteFile.name}</p>}
        </>
      )}

      <label htmlFor="billing_address_select">Bill-to address</label>
      <select
        id="billing_address_select"
        value={billingAddressSelection}
        onChange={(e) => handleBillingAddressSelect(e.target.value)}
      >
        <option value="__default__">Client default</option>
        {billingAddresses
          .filter((a) => !isCreating || a.client_id === clientId)
          .map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        <option value="__custom__">Custom…</option>
      </select>
      <textarea
        rows={3}
        value={billingAddressText}
        onChange={(e) => setBillingAddressText(e.target.value)}
      />

      {isForeignCurrency && (
        <div className="row">
          <div>
            <label htmlFor="exchange_rate">Exchange rate (1 {currency} = ? SGD)</label>
            <input
              id="exchange_rate"
              type="number"
              step="0.0001"
              value={exchangeRate}
              onChange={(e) =>
                setExchangeRate(e.target.value === "" ? "" : Number(e.target.value))
              }
              placeholder="e.g. 1.34"
            />
          </div>
          <div>
            <label htmlFor="display_currency">Document shows</label>
            <select
              id="display_currency"
              value={displayCurrency}
              onChange={(e) => setDisplayCurrency(e.target.value as "original" | "sgd")}
            >
              <option value="original">Original currency ({currency})</option>
              <option value="sgd">SGD equivalent</option>
            </select>
          </div>
        </div>
      )}

      <label>Line items</label>
      <table className="line-items-table">
        <thead>
          <tr>
            <th style={{ width: "50%" }}>Description</th>
            <th>Qty</th>
            <th>Unit price</th>
            <th>Line total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((li, idx) => (
            <tr key={idx}>
              <td>
                <input
                  value={li.description}
                  onChange={(e) => updateLine(idx, { description: e.target.value })}
                  placeholder="Description"
                />
              </td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  value={li.quantity}
                  onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })}
                />
              </td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  value={li.unit_price}
                  onChange={(e) => updateLine(idx, { unit_price: Number(e.target.value) })}
                />
              </td>
              <td>{formatMoney(li.quantity * li.unit_price, currency)}</td>
              <td>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => removeLine(idx)}
                  type="button"
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn btn-sm" onClick={addLine} type="button" style={{ marginTop: 8 }}>
        + Add line
      </button>

      <div className="totals">
        <div>Subtotal: {formatMoney(displaySubtotal, primaryCurrency)}</div>
        {showDualCurrency && showSgdAsPrimary && (
          <div className="subtitle">({formatMoney(subtotal, currency)})</div>
        )}
        {gstApplicable && (
          <>
            <div>
              GST ({gstRate}%): {formatMoney(displayGstAmount, primaryCurrency)}
            </div>
            {showDualCurrency && (
              <div className="subtitle">
                {showSgdAsPrimary
                  ? `(${formatMoney(gstAmount, currency)})`
                  : `SGD equivalent: ${formatMoney(sgdGstAmount, "SGD")}`}
              </div>
            )}
          </>
        )}
        <div className="grand">Total: {formatMoney(displayTotal, primaryCurrency)}</div>
        {showDualCurrency && (
          <div className="subtitle">
            {showSgdAsPrimary
              ? `(${formatMoney(total, currency)})`
              : `SGD equivalent: ${formatMoney(sgdTotal, "SGD")}`}
          </div>
        )}
      </div>

      <label htmlFor="notes">Notes</label>
      <textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />

      <div className="actions" style={{ marginTop: 18 }}>
        <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
          {saving ? "Saving..." : isCreating ? "Create invoice" : "Save invoice"}
        </button>
      </div>
    </div>
  );
}

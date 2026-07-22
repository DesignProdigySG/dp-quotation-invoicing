"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createQuotation, updateQuotation, type LineItemInput } from "./actions";
import { formatMoney, computeTotals } from "@/lib/format";

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

export default function QuoteForm({
  quoteId,
  clients,
  billingAddresses,
  initial,
}: {
  quoteId?: string;
  clients: ClientOption[];
  billingAddresses: BillingAddressOption[];
  initial?: {
    client_id: string;
    quote_date: string;
    currency: string;
    gst_rate: number;
    gst_applicable: boolean;
    exchange_rate?: number | null;
    display_currency: "original" | "sgd";
    billing_address_id?: string | null;
    billing_address?: string | null;
    notes: string;
    valid_until?: string | null;
    line_items: LineItemInput[];
  };
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(initial?.client_id || clients[0]?.id || "");
  const [quoteDate, setQuoteDate] = useState(
    initial?.quote_date || new Date().toISOString().slice(0, 10)
  );
  const [currency, setCurrency] = useState(
    initial?.currency ||
      clients.find((c) => c.id === clientId)?.default_currency ||
      "SGD"
  );
  const [gstRate, setGstRate] = useState(
    initial?.gst_rate ??
      clients.find((c) => c.id === clientId)?.default_gst_rate ??
      9
  );
  const [gstApplicable, setGstApplicable] = useState(initial?.gst_applicable ?? true);
  const [exchangeRate, setExchangeRate] = useState<number | "">(
    initial?.exchange_rate ?? ""
  );
  const [displayCurrency, setDisplayCurrency] = useState<"original" | "sgd">(
    initial?.display_currency ||
      (clients.find((c) => c.id === clientId)?.display_currency_preference as
        | "original"
        | "sgd") ||
      "original"
  );
  const [notes, setNotes] = useState(initial?.notes || "");
  const [validUntil, setValidUntil] = useState(initial?.valid_until || "");
  const [billingAddressSelection, setBillingAddressSelection] = useState(
    initial?.billing_address_id ?? (initial?.billing_address ? "__custom__" : "__default__")
  );
  const [billingAddressText, setBillingAddressText] = useState(
    initial?.billing_address ?? clients.find((c) => c.id === clientId)?.billing_address ?? ""
  );
  const [lineItems, setLineItems] = useState<LineItemInput[]>(
    initial?.line_items?.length
      ? initial.line_items
      : [{ description: "", quantity: 1, unit_price: 0 }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClientChange(id: string) {
    setClientId(id);
    if (!quoteId) {
      const c = clients.find((c) => c.id === id);
      if (c) {
        setCurrency(c.default_currency);
        setGstRate(c.default_gst_rate);
        setDisplayCurrency(
          (c.display_currency_preference as "original" | "sgd") || "original"
        );
        setBillingAddressSelection("__default__");
        setBillingAddressText(c.billing_address || "");
      }
    }
  }

  function handleBillingAddressSelect(value: string) {
    setBillingAddressSelection(value);
    if (value === "__default__") {
      setBillingAddressText(clients.find((c) => c.id === clientId)?.billing_address || "");
    } else if (value !== "__custom__") {
      const addr = billingAddresses.find((a) => a.id === value);
      if (addr) setBillingAddressText(addr.address);
    }
  }

  function updateLine(idx: number, patch: Partial<LineItemInput>) {
    setLineItems((items) =>
      items.map((it, i) => (i === idx ? { ...it, ...patch } : it))
    );
  }

  function addLine() {
    setLineItems((items) => [...items, { description: "", quantity: 1, unit_price: 0 }]);
  }

  function removeLine(idx: number) {
    setLineItems((items) => items.filter((_, i) => i !== idx));
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
    setSaving(true);
    setError(null);
    try {
      const input = {
        client_id: clientId,
        quote_date: quoteDate,
        currency,
        gst_rate: gstRate,
        gst_applicable: gstApplicable,
        exchange_rate: isForeignCurrency ? effectiveExchangeRate : null,
        display_currency: isForeignCurrency ? displayCurrency : ("original" as const),
        billing_address_id: billingAddressSelection.startsWith("__")
          ? null
          : billingAddressSelection,
        billing_address: billingAddressText || null,
        notes,
        valid_until: validUntil || null,
        line_items: lineItems.filter((li) => li.description.trim() !== ""),
      };
      if (quoteId) {
        await updateQuotation(quoteId, input);
        router.push(`/quotes/${quoteId}`);
      } else {
        const created = await createQuotation(input);
        router.push(`/quotes/${created.id}`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (clients.length === 0) {
    return (
      <div className="card">
        <p>You need at least one client before creating a quotation.</p>
        <a className="btn btn-primary" href="/clients/new">
          + New client
        </a>
      </div>
    );
  }

  return (
    <div className="card">
      {error && <div className="error">{error}</div>}

      <div className="row">
        <div>
          <label htmlFor="client">Client</label>
          <select
            id="client"
            value={clientId}
            onChange={(e) => handleClientChange(e.target.value)}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="quote_date">Quote date</label>
          <input
            id="quote_date"
            type="date"
            value={quoteDate}
            onChange={(e) => setQuoteDate(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="valid_until">
            Expiration date{!quoteId && " (defaults to 20 days if left blank)"}
          </label>
          <input
            id="valid_until"
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="currency">Currency</label>
          <input
            id="currency"
            value={currency}
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
            onChange={(e) => setGstRate(Number(e.target.value))}
            disabled={!gstApplicable}
          />
        </div>
      </div>

      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={gstApplicable}
          onChange={(e) => setGstApplicable(e.target.checked)}
        />
        Apply GST
      </label>

      <label htmlFor="billing_address_select">Bill-to address</label>
      <select
        id="billing_address_select"
        value={billingAddressSelection}
        onChange={(e) => handleBillingAddressSelect(e.target.value)}
      >
        <option value="__default__">Client default</option>
        {billingAddresses
          .filter((a) => a.client_id === clientId)
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
      <textarea
        id="notes"
        rows={3}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <div className="actions" style={{ marginTop: 18 }}>
        <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
          {saving ? "Saving..." : "Save quotation"}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resolveUnmatchedEmailQuote, dismissUnmatchedEmailQuote } from "./actions";
import type { LineItemInput } from "../quotes/actions";
import { formatMoney, computeTotals } from "@/lib/format";

type ClientOption = {
  id: string;
  name: string;
  default_currency: string;
  default_gst_rate: number;
  display_currency_preference: string;
};

type UnmatchedItem = {
  id: string;
  sender_email: string;
  sender_name: string | null;
  subject: string | null;
  created_at: string;
  parsed_data: unknown;
};

type ParsedData = {
  client_name?: string;
  items?: { description?: string; quantity?: number }[];
  notes?: string;
};

export default function ReviewQueue({
  items,
  clients,
}: {
  items: UnmatchedItem[];
  clients: ClientOption[];
}) {
  if (items.length === 0) {
    return <div className="card empty">Nothing waiting on review right now.</div>;
  }

  return (
    <div className="review-queue">
      {items.map((item) => (
        <ReviewItemCard key={item.id} item={item} clients={clients} />
      ))}
    </div>
  );
}

function ReviewItemCard({
  item,
  clients,
}: {
  item: UnmatchedItem;
  clients: ClientOption[];
}) {
  const router = useRouter();
  const parsed = (item.parsed_data || {}) as ParsedData;

  const [clientId, setClientId] = useState(clients[0]?.id || "");
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState(
    clients.find((c) => c.id === clientId)?.default_currency || "SGD"
  );
  const [gstRate, setGstRate] = useState(
    clients.find((c) => c.id === clientId)?.default_gst_rate ?? 9
  );
  const [gstApplicable, setGstApplicable] = useState(true);
  const [exchangeRate, setExchangeRate] = useState<number | "">("");
  const [displayCurrency, setDisplayCurrency] = useState<"original" | "sgd">(
    (clients.find((c) => c.id === clientId)?.display_currency_preference as
      | "original"
      | "sgd") || "original"
  );
  const [notes, setNotes] = useState(parsed.notes || "");
  const [lineItems, setLineItems] = useState<LineItemInput[]>(
    parsed.items && parsed.items.length > 0
      ? parsed.items.map((li) => ({
          description: li.description || "",
          quantity: li.quantity || 1,
          unit_price: 0,
        }))
      : [{ description: "", quantity: 1, unit_price: 0 }]
  );
  const [saving, setSaving] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClientChange(id: string) {
    setClientId(id);
    const c = clients.find((c) => c.id === id);
    if (c) {
      setCurrency(c.default_currency);
      setGstRate(c.default_gst_rate);
      setDisplayCurrency(
        (c.display_currency_preference as "original" | "sgd") || "original"
      );
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

  async function handleCreate() {
    if (!clientId) {
      setError("Pick a client first");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await resolveUnmatchedEmailQuote(item.id, {
        client_id: clientId,
        quote_date: quoteDate,
        currency,
        gst_rate: gstRate,
        gst_applicable: gstApplicable,
        exchange_rate: isForeignCurrency ? effectiveExchangeRate : null,
        display_currency: isForeignCurrency ? displayCurrency : "original",
        notes,
        line_items: lineItems.filter((li) => li.description.trim() !== ""),
      });
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
      await dismissUnmatchedEmailQuote(item.id);
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

      {clients.length === 0 ? (
        <p>
          You need at least one client before creating a quotation.{" "}
          <a href="/clients/new">+ New client</a>
        </p>
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
            </div>
            <div>
              <label>Quote date</label>
              <input
                type="date"
                value={quoteDate}
                onChange={(e) => setQuoteDate(e.target.value)}
              />
            </div>
            <div>
              <label>Currency</label>
              <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
            </div>
            <div>
              <label>GST %</label>
              <input
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

          {isForeignCurrency && (
            <div className="row">
              <div>
                <label>Exchange rate (1 {currency} = ? SGD)</label>
                <input
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
                <label>Document shows</label>
                <select
                  value={displayCurrency}
                  onChange={(e) =>
                    setDisplayCurrency(e.target.value as "original" | "sgd")
                  }
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

          <label>Notes</label>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />

          <div className="actions" style={{ marginTop: 18 }}>
            <button className="btn btn-primary" disabled={saving} onClick={handleCreate}>
              {saving ? "Creating..." : "Create draft quotation"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

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
};

export default function QuoteForm({
  quoteId,
  clients,
  initial,
}: {
  quoteId?: string;
  clients: ClientOption[];
  initial?: {
    client_id: string;
    quote_date: string;
    currency: string;
    gst_rate: number;
    notes: string;
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
  const [notes, setNotes] = useState(initial?.notes || "");
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
      }
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

  const { subtotal, gstAmount, total } = computeTotals(lineItems, gstRate);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const input = {
        client_id: clientId,
        quote_date: quoteDate,
        currency,
        gst_rate: gstRate,
        notes,
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
          />
        </div>
      </div>

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
        <div>Subtotal: {formatMoney(subtotal, currency)}</div>
        <div>
          GST ({gstRate}%): {formatMoney(gstAmount, currency)}
        </div>
        <div className="grand">Total: {formatMoney(total, currency)}</div>
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

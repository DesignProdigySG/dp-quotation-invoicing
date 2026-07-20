"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateInvoice } from "./actions";
import { formatMoney, computeTotals } from "@/lib/format";
import type { LineItemInput } from "../quotes/actions";

export default function InvoiceForm({
  invoiceId,
  currency,
  gstRate,
  initial,
}: {
  invoiceId: string;
  currency: string;
  gstRate: number;
  initial: {
    due_date: string | null;
    notes: string;
    line_items: LineItemInput[];
  };
}) {
  const router = useRouter();
  const [dueDate, setDueDate] = useState(initial.due_date || "");
  const [notes, setNotes] = useState(initial.notes || "");
  const [lineItems, setLineItems] = useState<LineItemInput[]>(
    initial.line_items.length
      ? initial.line_items
      : [{ description: "", quantity: 1, unit_price: 0 }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateLine(idx: number, patch: Partial<LineItemInput>) {
    setLineItems((items) => items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
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
      await updateInvoice(invoiceId, {
        due_date: dueDate || null,
        notes,
        line_items: lineItems.filter((li) => li.description.trim() !== ""),
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      {error && <div className="error">{error}</div>}

      <div className="row">
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
          <label>Currency</label>
          <input value={currency} disabled />
        </div>
        <div>
          <label>GST %</label>
          <input value={gstRate} disabled />
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
      <textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />

      <div className="actions" style={{ marginTop: 18 }}>
        <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
          {saving ? "Saving..." : "Save invoice"}
        </button>
      </div>
    </div>
  );
}

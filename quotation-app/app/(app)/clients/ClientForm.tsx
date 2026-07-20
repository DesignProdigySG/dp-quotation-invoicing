"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createClientRecord,
  updateClientRecord,
  deleteClientRecord,
  type ClientInput,
} from "./actions";

export default function ClientForm({
  clientId,
  initial,
}: {
  clientId?: string;
  initial?: Partial<Omit<ClientInput, "display_currency_preference">> & {
    display_currency_preference?: string;
  };
}) {
  const router = useRouter();
  type FormState = {
    name: string;
    contact_name: string;
    contact_email: string;
    contact_phone: string;
    billing_address: string;
    default_currency: string;
    default_gst_rate: number;
    display_currency_preference: "original" | "sgd";
  };
  const [form, setForm] = useState<FormState>({
    name: initial?.name || "",
    contact_name: initial?.contact_name || "",
    contact_email: initial?.contact_email || "",
    contact_phone: initial?.contact_phone || "",
    billing_address: initial?.billing_address || "",
    default_currency: initial?.default_currency || "SGD",
    default_gst_rate: initial?.default_gst_rate ?? 9,
    display_currency_preference:
      (initial?.display_currency_preference as "original" | "sgd") || "original",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (clientId) {
        await updateClientRecord(clientId, form);
        router.push("/clients");
      } else {
        const created = await createClientRecord(form);
        router.push(`/clients/${created.id}`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!clientId) return;
    if (!confirm("Delete this client? This cannot be undone.")) return;
    setSaving(true);
    try {
      await deleteClientRecord(clientId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete client");
      setSaving(false);
    }
  }

  return (
    <div className="card">
      {error && <div className="error">{error}</div>}

      <label htmlFor="name">Client name</label>
      <input
        id="name"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />

      <div className="row">
        <div>
          <label htmlFor="contact_name">Contact name</label>
          <input
            id="contact_name"
            value={form.contact_name}
            onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="contact_email">Contact email</label>
          <input
            id="contact_email"
            type="email"
            value={form.contact_email}
            onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
          />
        </div>
      </div>

      <div className="row">
        <div>
          <label htmlFor="contact_phone">Contact phone</label>
          <input
            id="contact_phone"
            value={form.contact_phone}
            onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="default_currency">Default currency</label>
          <input
            id="default_currency"
            value={form.default_currency}
            onChange={(e) =>
              setForm({ ...form, default_currency: e.target.value.toUpperCase() })
            }
          />
        </div>
        <div>
          <label htmlFor="default_gst_rate">Default GST %</label>
          <input
            id="default_gst_rate"
            type="number"
            step="0.01"
            value={form.default_gst_rate}
            onChange={(e) =>
              setForm({ ...form, default_gst_rate: Number(e.target.value) })
            }
          />
        </div>
      </div>

      <label htmlFor="billing_address">Bill-to address</label>
      <textarea
        id="billing_address"
        rows={3}
        value={form.billing_address}
        onChange={(e) => setForm({ ...form, billing_address: e.target.value })}
      />

      <label htmlFor="display_currency_preference">
        Document currency display (for non-SGD quotes/invoices)
      </label>
      <select
        id="display_currency_preference"
        value={form.display_currency_preference}
        onChange={(e) =>
          setForm({
            ...form,
            display_currency_preference: e.target.value as "original" | "sgd",
          })
        }
      >
        <option value="original">Show original currency</option>
        <option value="sgd">Show SGD equivalent</option>
      </select>

      <div className="actions" style={{ marginTop: 18 }}>
        <button
          className="btn btn-primary"
          disabled={saving || !form.name}
          onClick={handleSave}
        >
          {saving ? "Saving..." : "Save client"}
        </button>
        {clientId && (
          <button className="btn btn-danger" disabled={saving} onClick={handleDelete}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

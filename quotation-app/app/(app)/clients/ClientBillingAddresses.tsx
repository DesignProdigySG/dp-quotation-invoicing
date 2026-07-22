"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createBillingAddress,
  updateBillingAddress,
  deleteBillingAddress,
} from "./billingAddressActions";

type Address = { id: string; label: string; address: string };

export default function ClientBillingAddresses({
  clientId,
  initialAddresses,
}: {
  clientId: string;
  initialAddresses: Address[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startAdd() {
    setEditingId("new");
    setLabel("");
    setAddress("");
    setError(null);
  }

  function startEdit(a: Address) {
    setEditingId(a.id);
    setLabel(a.label);
    setAddress(a.address);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function handleSave() {
    if (!label.trim() || !address.trim()) {
      setError("Label and address are both required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result =
        editingId === "new"
          ? await createBillingAddress(clientId, { label, address })
          : await updateBillingAddress(editingId as string, clientId, { label, address });
      if (result.error) {
        setError(result.error);
      } else {
        setEditingId(null);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this billing address?")) return;
    setSaving(true);
    setError(null);
    try {
      const result = await deleteBillingAddress(id, clientId);
      if (result.error) setError(result.error);
      else router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h2>Additional billing addresses</h2>
      <p className="subtitle">
        Named entities/addresses that can be selected instead of the default bill-to
        address when creating a quotation or invoice.
      </p>
      {error && <div className="error">{error}</div>}

      {initialAddresses.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Label</th>
              <th>Address</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {initialAddresses.map((a) => (
              <tr key={a.id}>
                <td>{a.label}</td>
                <td className="subtitle">{a.address}</td>
                <td>
                  <div className="actions">
                    <button className="btn btn-sm" type="button" onClick={() => startEdit(a)}>
                      Edit
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      type="button"
                      onClick={() => handleDelete(a.id)}
                      disabled={saving}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editingId ? (
        <div style={{ marginTop: 14 }}>
          <label htmlFor="addr_label">Label</label>
          <input
            id="addr_label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. APAC entity"
          />
          <label htmlFor="addr_address">Address</label>
          <textarea id="addr_address" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} />
          <div className="actions" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" type="button" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button className="btn" type="button" onClick={cancelEdit} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="btn btn-sm" type="button" onClick={startAdd} style={{ marginTop: 12 }}>
          + Add address
        </button>
      )}
    </div>
  );
}

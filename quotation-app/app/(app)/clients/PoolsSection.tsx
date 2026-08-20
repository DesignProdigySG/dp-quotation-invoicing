"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPool, deletePool } from "./poolActions";
import { formatMoney } from "@/lib/format";

type PoolNode = {
  id: string;
  name: string;
  parent_pool_id: string | null;
  balance: number;
};

export default function PoolsSection({
  clientId,
  currency,
  initialPools,
}: {
  clientId: string;
  currency: string;
  initialPools: PoolNode[];
}) {
  const router = useRouter();
  const [addingUnder, setAddingUnder] = useState<string | "root" | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startAdd(parentId: string | "root") {
    setAddingUnder(parentId);
    setName("");
    setError(null);
  }

  function cancelAdd() {
    setAddingUnder(null);
  }

  async function handleAdd() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createPool({
        client_id: clientId,
        parent_pool_id: addingUnder === "root" ? null : (addingUnder as string),
        name,
      });
      setAddingUnder(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(pool: PoolNode) {
    if (
      !confirm(
        `Delete pool "${pool.name}"? This only works if it has no sub-pools or recorded transactions.`
      )
    )
      return;
    setSaving(true);
    setError(null);
    try {
      await deletePool(pool.id, clientId);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    } finally {
      setSaving(false);
    }
  }

  function childrenOf(parentId: string | null) {
    return initialPools
      .filter((p) => p.parent_pool_id === parentId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function renderRows(parentId: string | null, depth: number): React.ReactNode[] {
    return childrenOf(parentId).flatMap((pool) => [
      <tr key={pool.id}>
        <td style={{ paddingLeft: depth * 20 }}>
          <Link href={`/clients/${clientId}/pools/${pool.id}`}>{pool.name}</Link>
        </td>
        <td>{formatMoney(pool.balance, currency)}</td>
        <td>
          <div className="actions">
            <button className="btn btn-sm" type="button" onClick={() => startAdd(pool.id)}>
              + Sub-pool
            </button>
            <button
              className="btn btn-sm btn-danger"
              type="button"
              onClick={() => handleDelete(pool)}
              disabled={saving}
            >
              Delete
            </button>
          </div>
        </td>
      </tr>,
      ...renderRows(pool.id, depth + 1),
    ]);
  }

  return (
    <div className="card">
      <h2>Pools</h2>
      <p className="subtitle">
        Client-funds ledger — deposits, drawdowns, and transfers are recorded per pool. Each
        department (and any further nesting) is its own pool with its own balance.
      </p>
      {error && <div className="error">{error}</div>}

      {initialPools.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Pool</th>
              <th>Balance</th>
              <th></th>
            </tr>
          </thead>
          <tbody>{renderRows(null, 0)}</tbody>
        </table>
      ) : (
        <p className="empty">No pools yet.</p>
      )}

      {addingUnder ? (
        <div style={{ marginTop: 14 }}>
          <label htmlFor="pool_name">
            {addingUnder === "root" ? "New pool name" : "New sub-pool name"}
          </label>
          <input
            id="pool_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Media Budget"
          />
          <div className="actions" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" type="button" onClick={handleAdd} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button className="btn" type="button" onClick={cancelAdd} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn btn-sm"
          type="button"
          onClick={() => startAdd("root")}
          style={{ marginTop: 12 }}
        >
          + Add pool
        </button>
      )}
    </div>
  );
}

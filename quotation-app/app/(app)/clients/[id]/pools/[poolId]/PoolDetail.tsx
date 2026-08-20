"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatMoney, formatDisplayDate } from "@/lib/format";
import { createPool, confirmDeposit } from "../../../poolActions";
import RecordTransactionModal from "./RecordTransactionModal";

type Deposit = {
  id: string;
  amount: number;
  currency: string;
  sgd_amount: number;
  exchange_rate: number | null;
  fee_rate: number;
  fee_amount: number;
  net_amount: number;
  purpose: string | null;
  deposit_date: string;
  status: string;
};

type Drawdown = {
  id: string;
  vendor_name: string;
  is_internal: boolean;
  amount: number;
  currency: string;
  sgd_amount: number;
  description: string | null;
  drawdown_date: string;
};

type TransferOut = {
  id: string;
  to_pool_id: string;
  amount: number;
  reason: string | null;
  transfer_date: string;
  to_pool: { name: string } | null;
};

type TransferIn = {
  id: string;
  from_pool_id: string;
  amount: number;
  reason: string | null;
  transfer_date: string;
  from_pool: { name: string } | null;
};

type Adjustment = {
  id: string;
  amount: number;
  reason: string;
  related_deposit_id: string | null;
  related_drawdown_id: string | null;
  created_at: string;
};

type SubPool = { id: string; name: string; balance: number };
type OtherPool = { id: string; name: string };

type LedgerEntry = {
  id: string;
  date: string;
  type: string;
  detail: string;
  amount: number;
};

export default function PoolDetail({
  clientId,
  pool,
  balance,
  currency,
  defaultFeeRate,
  subPools,
  otherPools,
  deposits,
  drawdowns,
  transfersOut,
  transfersIn,
  adjustments,
}: {
  clientId: string;
  pool: { id: string; name: string };
  balance: number;
  currency: string;
  defaultFeeRate: number | null;
  subPools: SubPool[];
  otherPools: OtherPool[];
  deposits: Deposit[];
  drawdowns: Drawdown[];
  transfersOut: TransferOut[];
  transfersIn: TransferIn[];
  adjustments: Adjustment[];
}) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [addingSubPool, setAddingSubPool] = useState(false);
  const [subPoolName, setSubPoolName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendingDeposits = deposits.filter((d) => d.status !== "confirmed");
  const confirmedDeposits = deposits.filter((d) => d.status === "confirmed");

  const ledger: LedgerEntry[] = [
    ...confirmedDeposits.map((d) => ({
      id: `deposit-${d.id}`,
      date: d.deposit_date,
      type: "Deposit",
      detail: d.purpose || "Deposit",
      amount: d.net_amount,
    })),
    ...drawdowns.map((d) => ({
      id: `drawdown-${d.id}`,
      date: d.drawdown_date,
      type: "Drawdown",
      detail: d.vendor_name + (d.is_internal ? " (internal)" : ""),
      amount: -d.sgd_amount,
    })),
    ...transfersOut.map((t) => ({
      id: `transfer-out-${t.id}`,
      date: t.transfer_date,
      type: "Transfer",
      detail: `To ${t.to_pool?.name ?? "another pool"}${t.reason ? ` — ${t.reason}` : ""}`,
      amount: -t.amount,
    })),
    ...transfersIn.map((t) => ({
      id: `transfer-in-${t.id}`,
      date: t.transfer_date,
      type: "Transfer",
      detail: `From ${t.from_pool?.name ?? "another pool"}${t.reason ? ` — ${t.reason}` : ""}`,
      amount: t.amount,
    })),
    ...adjustments.map((a) => ({
      id: `adjustment-${a.id}`,
      date: a.created_at,
      type: "Adjustment",
      detail: a.reason,
      amount: a.amount,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  async function handleAddSubPool() {
    if (!subPoolName.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createPool({ client_id: clientId, parent_pool_id: pool.id, name: subPoolName });
      setAddingSubPool(false);
      setSubPoolName("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDeposit(depositId: string) {
    setSaving(true);
    setError(null);
    try {
      await confirmDeposit(depositId, clientId, pool.id);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not confirm deposit");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="card">
        <h2>Balance</h2>
        <p className="grand">{formatMoney(balance, currency)}</p>
        {error && <div className="error">{error}</div>}
        <div className="actions" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" type="button" onClick={() => setShowModal(true)}>
            + Record transaction
          </button>
        </div>
      </div>

      {pendingDeposits.length > 0 && (
        <div className="card">
          <h2>Pending deposits</h2>
          <p className="subtitle">Not yet counted toward the balance above.</p>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Purpose</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pendingDeposits.map((d) => (
                <tr key={d.id}>
                  <td>{formatDisplayDate(d.deposit_date)}</td>
                  <td>{formatMoney(d.amount, d.currency)}</td>
                  <td className="subtitle">{d.purpose || ""}</td>
                  <td>
                    <button
                      className="btn btn-sm"
                      type="button"
                      disabled={saving}
                      onClick={() => handleConfirmDeposit(d.id)}
                    >
                      Mark confirmed
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2>Sub-pools</h2>
        {subPools.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Pool</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {subPools.map((sub) => (
                <tr key={sub.id}>
                  <td>
                    <Link href={`/clients/${clientId}/pools/${sub.id}`}>{sub.name}</Link>
                  </td>
                  <td>{formatMoney(sub.balance, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty">No sub-pools yet.</p>
        )}

        {addingSubPool ? (
          <div style={{ marginTop: 14 }}>
            <label htmlFor="sub_pool_name">New sub-pool name</label>
            <input
              id="sub_pool_name"
              value={subPoolName}
              onChange={(e) => setSubPoolName(e.target.value)}
              placeholder="e.g. Partner"
            />
            <div className="actions" style={{ marginTop: 12 }}>
              <button
                className="btn btn-primary"
                type="button"
                onClick={handleAddSubPool}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => setAddingSubPool(false)}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn btn-sm"
            type="button"
            onClick={() => setAddingSubPool(true)}
            style={{ marginTop: 12 }}
          >
            + Add sub-pool
          </button>
        )}
      </div>

      <div className="card">
        <h2>Transactions</h2>
        {ledger.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Detail</th>
                <th>Amount (SGD)</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDisplayDate(entry.date.slice(0, 10))}</td>
                  <td>{entry.type}</td>
                  <td className="subtitle">{entry.detail}</td>
                  <td>
                    {entry.amount > 0 ? "+" : ""}
                    {formatMoney(entry.amount, "SGD")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty">No transactions recorded yet.</p>
        )}
      </div>

      {showModal && (
        <RecordTransactionModal
          clientId={clientId}
          poolId={pool.id}
          currency={currency}
          defaultFeeRate={defaultFeeRate}
          otherPools={otherPools}
          deposits={confirmedDeposits}
          drawdowns={drawdowns}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

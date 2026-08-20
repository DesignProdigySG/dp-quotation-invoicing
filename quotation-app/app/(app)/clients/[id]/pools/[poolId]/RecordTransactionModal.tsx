"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordDeposit, recordDrawdown, recordTransfer, recordAdjustment } from "../../../poolActions";

type OtherPool = { id: string; name: string };
type Deposit = { id: string; deposit_date: string; amount: number; currency: string };
type Drawdown = { id: string; drawdown_date: string; vendor_name: string; amount: number };

type TransactionType = "deposit" | "drawdown" | "transfer" | "adjustment";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function RecordTransactionModal({
  clientId,
  poolId,
  currency: defaultCurrency,
  defaultFeeRate,
  otherPools,
  deposits,
  drawdowns,
  onClose,
}: {
  clientId: string;
  poolId: string;
  currency: string;
  defaultFeeRate: number | null;
  otherPools: OtherPool[];
  deposits: Deposit[];
  drawdowns: Drawdown[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [type, setType] = useState<TransactionType>("deposit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Deposit fields
  const [depAmount, setDepAmount] = useState<number | "">("");
  const [depCurrency, setDepCurrency] = useState(defaultCurrency);
  const [depExchangeRate, setDepExchangeRate] = useState<number | "">("");
  const [depFeeRate, setDepFeeRate] = useState<number | "">(defaultFeeRate ?? "");
  const [depPurpose, setDepPurpose] = useState("");
  const [depDate, setDepDate] = useState(today());
  const [depStatus, setDepStatus] = useState<"confirmed" | "pending">("confirmed");

  // Drawdown fields
  const [drawVendor, setDrawVendor] = useState("");
  const [drawInternal, setDrawInternal] = useState(false);
  const [drawAmount, setDrawAmount] = useState<number | "">("");
  const [drawCurrency, setDrawCurrency] = useState(defaultCurrency);
  const [drawExchangeRate, setDrawExchangeRate] = useState<number | "">("");
  const [drawDescription, setDrawDescription] = useState("");
  const [drawDate, setDrawDate] = useState(today());
  const [drawNotes, setDrawNotes] = useState("");

  // Transfer fields
  const [toPoolId, setToPoolId] = useState(otherPools[0]?.id || "");
  const [transferAmount, setTransferAmount] = useState<number | "">("");
  const [transferReason, setTransferReason] = useState("");
  const [transferDate, setTransferDate] = useState(today());

  // Adjustment fields
  const [adjDirection, setAdjDirection] = useState<"credit" | "debit">("credit");
  const [adjAmount, setAdjAmount] = useState<number | "">("");
  const [adjReason, setAdjReason] = useState("");
  const [adjRelatedDeposit, setAdjRelatedDeposit] = useState("");
  const [adjRelatedDrawdown, setAdjRelatedDrawdown] = useState("");

  const depIsForeign = depCurrency.toUpperCase() !== "SGD";
  const drawIsForeign = drawCurrency.toUpperCase() !== "SGD";

  async function handleSave() {
    setError(null);
    try {
      if (type === "deposit") {
        if (depAmount === "" || depAmount <= 0) return setError("Enter a deposit amount");
        if (depIsForeign && (depExchangeRate === "" || depExchangeRate <= 0)) {
          return setError("Enter an exchange rate for a non-SGD deposit");
        }
        if (depFeeRate === "") return setError("Enter a management fee rate (0 if none)");
        setSaving(true);
        await recordDeposit({
          pool_id: poolId,
          client_id: clientId,
          amount: depAmount,
          currency: depCurrency,
          exchange_rate: depIsForeign ? (depExchangeRate as number) : null,
          fee_rate: depFeeRate as number,
          purpose: depPurpose || null,
          deposit_date: depDate,
          status: depStatus,
        });
      } else if (type === "drawdown") {
        if (!drawVendor.trim()) return setError("Enter a vendor name");
        if (drawAmount === "" || drawAmount <= 0) return setError("Enter a drawdown amount");
        if (drawIsForeign && (drawExchangeRate === "" || drawExchangeRate <= 0)) {
          return setError("Enter an exchange rate for a non-SGD drawdown");
        }
        setSaving(true);
        await recordDrawdown({
          pool_id: poolId,
          client_id: clientId,
          vendor_name: drawVendor,
          is_internal: drawInternal,
          amount: drawAmount,
          currency: drawCurrency,
          exchange_rate: drawIsForeign ? (drawExchangeRate as number) : null,
          description: drawDescription || null,
          drawdown_date: drawDate,
          notes: drawNotes || null,
        });
      } else if (type === "transfer") {
        if (!toPoolId) return setError("Pick a destination pool");
        if (transferAmount === "" || transferAmount <= 0) return setError("Enter a transfer amount");
        setSaving(true);
        await recordTransfer({
          from_pool_id: poolId,
          to_pool_id: toPoolId,
          client_id: clientId,
          amount: transferAmount,
          reason: transferReason || null,
          transfer_date: transferDate,
        });
      } else {
        if (adjAmount === "" || adjAmount <= 0) return setError("Enter an adjustment amount");
        if (!adjReason.trim()) return setError("Enter a reason");
        setSaving(true);
        await recordAdjustment({
          pool_id: poolId,
          client_id: clientId,
          amount: adjDirection === "credit" ? (adjAmount as number) : -(adjAmount as number),
          reason: adjReason,
          related_deposit_id: adjRelatedDeposit || null,
          related_drawdown_id: adjRelatedDrawdown || null,
        });
      }

      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content card">
        <div className="page-header">
          <h2>Record transaction</h2>
        </div>
        {error && <div className="error">{error}</div>}

        <label htmlFor="txn_type">Type</label>
        <select
          id="txn_type"
          value={type}
          onChange={(e) => setType(e.target.value as TransactionType)}
        >
          <option value="deposit">Deposit</option>
          <option value="drawdown">Drawdown</option>
          <option value="transfer">Transfer to another pool</option>
          <option value="adjustment">Adjustment</option>
        </select>

        {type === "deposit" && (
          <>
            <div className="row">
              <div>
                <label htmlFor="dep_amount">Amount</label>
                <input
                  id="dep_amount"
                  type="number"
                  step="0.01"
                  value={depAmount}
                  onChange={(e) => setDepAmount(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>
              <div>
                <label htmlFor="dep_currency">Currency</label>
                <input
                  id="dep_currency"
                  value={depCurrency}
                  onChange={(e) => setDepCurrency(e.target.value.toUpperCase())}
                />
              </div>
              <div>
                <label htmlFor="dep_date">Date</label>
                <input
                  id="dep_date"
                  type="date"
                  value={depDate}
                  onChange={(e) => setDepDate(e.target.value)}
                />
              </div>
            </div>

            {depIsForeign && (
              <div>
                <label htmlFor="dep_exchange_rate">Exchange rate (1 {depCurrency} = ? SGD)</label>
                <input
                  id="dep_exchange_rate"
                  type="number"
                  step="0.0001"
                  value={depExchangeRate}
                  onChange={(e) =>
                    setDepExchangeRate(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  placeholder="e.g. 1.34"
                />
              </div>
            )}

            <div className="row">
              <div>
                <label htmlFor="dep_fee_rate">Management fee %</label>
                <input
                  id="dep_fee_rate"
                  type="number"
                  step="0.01"
                  value={depFeeRate}
                  onChange={(e) => setDepFeeRate(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>
              <div>
                <label htmlFor="dep_status">Status</label>
                <select
                  id="dep_status"
                  value={depStatus}
                  onChange={(e) => setDepStatus(e.target.value as "confirmed" | "pending")}
                >
                  <option value="confirmed">Confirmed (counts toward balance)</option>
                  <option value="pending">Pending (not yet paid)</option>
                </select>
              </div>
            </div>

            <label htmlFor="dep_purpose">Purpose</label>
            <input
              id="dep_purpose"
              value={depPurpose}
              onChange={(e) => setDepPurpose(e.target.value)}
              placeholder="e.g. Q3 paid media budget"
            />
          </>
        )}

        {type === "drawdown" && (
          <>
            <label htmlFor="draw_vendor">Vendor</label>
            <input
              id="draw_vendor"
              value={drawVendor}
              onChange={(e) => setDrawVendor(e.target.value)}
            />
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={drawInternal}
                onChange={(e) => setDrawInternal(e.target.checked)}
              />
              Internal — funding DP&apos;s own work, not an external vendor
            </label>

            <div className="row">
              <div>
                <label htmlFor="draw_amount">Amount</label>
                <input
                  id="draw_amount"
                  type="number"
                  step="0.01"
                  value={drawAmount}
                  onChange={(e) =>
                    setDrawAmount(e.target.value === "" ? "" : Number(e.target.value))
                  }
                />
              </div>
              <div>
                <label htmlFor="draw_currency">Currency</label>
                <input
                  id="draw_currency"
                  value={drawCurrency}
                  onChange={(e) => setDrawCurrency(e.target.value.toUpperCase())}
                />
              </div>
              <div>
                <label htmlFor="draw_date">Date</label>
                <input
                  id="draw_date"
                  type="date"
                  value={drawDate}
                  onChange={(e) => setDrawDate(e.target.value)}
                />
              </div>
            </div>

            {drawIsForeign && (
              <div>
                <label htmlFor="draw_exchange_rate">Exchange rate (1 {drawCurrency} = ? SGD)</label>
                <input
                  id="draw_exchange_rate"
                  type="number"
                  step="0.0001"
                  value={drawExchangeRate}
                  onChange={(e) =>
                    setDrawExchangeRate(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  placeholder="e.g. 1.34"
                />
              </div>
            )}

            <label htmlFor="draw_description">Description</label>
            <input
              id="draw_description"
              value={drawDescription}
              onChange={(e) => setDrawDescription(e.target.value)}
            />
            <label htmlFor="draw_notes">Notes</label>
            <textarea
              id="draw_notes"
              rows={2}
              value={drawNotes}
              onChange={(e) => setDrawNotes(e.target.value)}
            />
          </>
        )}

        {type === "transfer" && (
          <>
            {otherPools.length === 0 ? (
              <p className="empty">
                This client has no other pools to transfer to yet — add one first.
              </p>
            ) : (
              <>
                <label htmlFor="transfer_to">Transfer to</label>
                <select
                  id="transfer_to"
                  value={toPoolId}
                  onChange={(e) => setToPoolId(e.target.value)}
                >
                  {otherPools.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>

                <div className="row">
                  <div>
                    <label htmlFor="transfer_amount">Amount (SGD)</label>
                    <input
                      id="transfer_amount"
                      type="number"
                      step="0.01"
                      value={transferAmount}
                      onChange={(e) =>
                        setTransferAmount(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor="transfer_date">Date</label>
                    <input
                      id="transfer_date"
                      type="date"
                      value={transferDate}
                      onChange={(e) => setTransferDate(e.target.value)}
                    />
                  </div>
                </div>

                <label htmlFor="transfer_reason">Reason</label>
                <input
                  id="transfer_reason"
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  placeholder="e.g. Budget transfer to Osman"
                />
              </>
            )}
          </>
        )}

        {type === "adjustment" && (
          <>
            <div className="row">
              <div>
                <label htmlFor="adj_direction">Direction</label>
                <select
                  id="adj_direction"
                  value={adjDirection}
                  onChange={(e) => setAdjDirection(e.target.value as "credit" | "debit")}
                >
                  <option value="credit">Credit (adds to balance)</option>
                  <option value="debit">Debit (subtracts from balance)</option>
                </select>
              </div>
              <div>
                <label htmlFor="adj_amount">Amount (SGD)</label>
                <input
                  id="adj_amount"
                  type="number"
                  step="0.01"
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>
            </div>

            <label htmlFor="adj_reason">Reason</label>
            <input
              id="adj_reason"
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
              placeholder="e.g. Fee refund — deposit redirected to DP-run work"
            />

            {deposits.length > 0 && (
              <>
                <label htmlFor="adj_related_deposit">Related deposit (optional)</label>
                <select
                  id="adj_related_deposit"
                  value={adjRelatedDeposit}
                  onChange={(e) => setAdjRelatedDeposit(e.target.value)}
                >
                  <option value="">None</option>
                  {deposits.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.deposit_date} — {d.amount} {d.currency}
                    </option>
                  ))}
                </select>
              </>
            )}

            {drawdowns.length > 0 && (
              <>
                <label htmlFor="adj_related_drawdown">Related drawdown (optional)</label>
                <select
                  id="adj_related_drawdown"
                  value={adjRelatedDrawdown}
                  onChange={(e) => setAdjRelatedDrawdown(e.target.value)}
                >
                  <option value="">None</option>
                  {drawdowns.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.drawdown_date} — {d.vendor_name} ({d.amount})
                    </option>
                  ))}
                </select>
              </>
            )}
          </>
        )}

        <div className="actions" style={{ marginTop: 18 }}>
          <button className="btn" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

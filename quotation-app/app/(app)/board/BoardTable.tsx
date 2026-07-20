"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";

type Row = {
  id: string;
  type: "Quote" | "Invoice";
  number: string;
  clientName: string;
  date: string;
  total: number;
  currency: string;
  status: string;
  href: string;
};

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{status}</span>;
}

export default function BoardTable({ rows }: { rows: Row[] }) {
  const clients = useMemo(
    () => Array.from(new Set(rows.map((r) => r.clientName))).sort(),
    [rows]
  );
  const statuses = useMemo(
    () => Array.from(new Set(rows.map((r) => r.status))).sort(),
    [rows]
  );

  const [clientFilter, setClientFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const filtered = rows.filter(
    (r) =>
      (!clientFilter || r.clientName === clientFilter) &&
      (!statusFilter || r.status === statusFilter) &&
      (!typeFilter || r.type === typeFilter)
  );

  return (
    <>
      <div className="filters">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          <option value="Quote">Quotes</option>
          <option value="Invoice">Invoices</option>
        </select>
        <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty">Nothing matches those filters.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Number</th>
                <th>Client</th>
                <th>Date</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={`${r.type}-${r.id}`}>
                  <td>{r.type}</td>
                  <td>
                    <Link href={r.href}>{r.number}</Link>
                  </td>
                  <td>{r.clientName}</td>
                  <td>{r.date}</td>
                  <td>{formatMoney(r.total, r.currency)}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

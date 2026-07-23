import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, computeTotals } from "@/lib/format";
import { xeroStatusLabel } from "@/lib/xero/statusLabel";
import CheckXeroStatusButton from "./CheckXeroStatusButton";

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{status}</span>;
}

export default async function InvoicesPage() {
  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("invoices")
    .select("*, clients(name), invoice_line_items(quantity, unit_price)")
    .order("created_at", { ascending: false });

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Invoices</h1>
          <p className="subtitle">
            Invoices are created by converting a quotation. Go to a quote to convert it.
          </p>
        </div>
        <CheckXeroStatusButton />
      </div>

      <div className="card">
        {!invoices || invoices.length === 0 ? (
          <div className="empty">No invoices yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Client</th>
                <th>Due date</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv: any) => {
                const { total } = computeTotals(
                  inv.invoice_line_items || [],
                  inv.gst_rate
                );
                return (
                  <tr key={inv.id}>
                    <td>
                      <Link href={`/invoices/${inv.id}`}>{inv.invoice_number}</Link>
                    </td>
                    <td>{inv.clients?.name}</td>
                    <td>{inv.due_date || "—"}</td>
                    <td>{formatMoney(total, inv.currency)}</td>
                    <td>
                      <StatusBadge status={inv.status} />
                      {inv.xero_invoice_id && (
                        <span className="subtitle" style={{ marginLeft: 6 }}>
                          ({xeroStatusLabel(inv.xero_status)})
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, computeTotals } from "@/lib/format";
import { getSalesforceInstanceUrl } from "@/lib/salesforce/instanceUrl";

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{status}</span>;
}

export default async function QuotesPage() {
  const supabase = await createClient();
  const [{ data: quotations }, instanceUrl] = await Promise.all([
    supabase
      .from("quotations")
      .select("*, clients(name), quotation_line_items(quantity, unit_price)")
      .order("created_at", { ascending: false }),
    getSalesforceInstanceUrl(),
  ]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Quotations</h1>
          <p className="subtitle">Create a quote, then send it or convert it to an invoice.</p>
        </div>
        <Link className="btn btn-primary" href="/quotes/new">
          + New quotation
        </Link>
      </div>

      <div className="card">
        {!quotations || quotations.length === 0 ? (
          <div className="empty">No quotations yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Quote #</th>
                <th>Client</th>
                <th>Date</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {quotations.map((q: any) => {
                const { total } = computeTotals(q.quotation_line_items || [], q.gst_rate);
                const salesforceUrl =
                  instanceUrl && q.salesforce_opportunity_id
                    ? `${instanceUrl}/${q.salesforce_opportunity_id}`
                    : null;
                return (
                  <tr key={q.id}>
                    <td>
                      <Link href={`/quotes/${q.id}`}>{q.quote_number}</Link>
                      {salesforceUrl && (
                        <>
                          {" "}
                          <a href={salesforceUrl} target="_blank" rel="noreferrer" title="View in Salesforce">
                            ↗
                          </a>
                        </>
                      )}
                    </td>
                    <td>{q.clients?.name}</td>
                    <td>{q.quote_date}</td>
                    <td>{formatMoney(total, q.currency)}</td>
                    <td>
                      <StatusBadge status={q.status} />
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

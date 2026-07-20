import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { computeTotals } from "@/lib/format";
import BoardTable from "./BoardTable";

export default async function BoardPage() {
  const supabase = await createClient();

  const [{ data: quotations }, { data: invoices }] = await Promise.all([
    supabase
      .from("quotations")
      .select("*, clients(name), quotation_line_items(quantity, unit_price)")
      .order("created_at", { ascending: false }),
    supabase
      .from("invoices")
      .select("*, clients(name), invoice_line_items(quantity, unit_price)")
      .order("created_at", { ascending: false }),
  ]);

  const quoteRows = (quotations || []).map((q: any) => {
    const { total } = computeTotals(q.quotation_line_items || [], q.gst_rate);
    return {
      id: q.id,
      type: "Quote" as const,
      number: q.quote_number,
      clientName: q.clients?.name || "—",
      date: q.quote_date,
      total,
      currency: q.currency,
      status: q.status,
      href: `/quotes/${q.id}`,
    };
  });

  const invoiceRows = (invoices || []).map((inv: any) => {
    const { total } = computeTotals(inv.invoice_line_items || [], inv.gst_rate);
    return {
      id: inv.id,
      type: "Invoice" as const,
      number: inv.invoice_number,
      clientName: inv.clients?.name || "—",
      date: inv.invoice_date,
      total,
      currency: inv.currency,
      status: inv.status,
      href: `/invoices/${inv.id}`,
    };
  });

  const rows = [...quoteRows, ...invoiceRows].sort((a, b) =>
    a.date < b.date ? 1 : -1
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Status board</h1>
          <p className="subtitle">Every quote and invoice you own, in one place.</p>
        </div>
        <Link className="btn btn-primary" href="/quotes/new">
          + New quotation
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <div className="empty">
            Nothing yet. <Link href="/clients/new">Add a client</Link> and{" "}
            <Link href="/quotes/new">create your first quotation</Link>.
          </div>
        </div>
      ) : (
        <BoardTable rows={rows} />
      )}
    </>
  );
}

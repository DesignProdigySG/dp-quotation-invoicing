import { createClient } from "@/lib/supabase/server";
import { computeTotals } from "@/lib/format";
import PoReviewQueue from "./PoReviewQueue";

export default async function PoReviewPage() {
  const supabase = await createClient();

  const [{ data: pending }, { data: clients }, { data: invoicesData }, { data: quotations }] =
    await Promise.all([
      supabase
        .from("unmatched_email_pos")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase.from("clients").select("id, name").order("name"),
      supabase
        .from("invoices")
        .select(
          "id, invoice_number, client_id, status, reference, notes, currency, gst_rate, invoice_line_items(quantity, unit_price)"
        )
        .order("invoice_date", { ascending: false }),
      supabase.from("quotations").select("id, quote_number, client_id").order("quote_date", { ascending: false }),
    ]);

  const invoices = (invoicesData || []).map((inv) => {
    const { total } = computeTotals(inv.invoice_line_items || [], inv.gst_rate);
    return {
      id: inv.id,
      invoice_number: inv.invoice_number,
      client_id: inv.client_id,
      status: inv.status,
      reference: inv.reference,
      notes: inv.notes,
      currency: inv.currency,
      total,
    };
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Needs review — Purchase orders</h1>
          <p className="subtitle">
            PO emails our AI parsed — pick the invoice each one belongs to.
          </p>
        </div>
      </div>
      <PoReviewQueue
        items={pending || []}
        clients={clients || []}
        invoices={invoices}
        quotations={quotations || []}
      />
    </>
  );
}

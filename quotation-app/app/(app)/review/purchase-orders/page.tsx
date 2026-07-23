import { createClient } from "@/lib/supabase/server";
import PoReviewQueue from "./PoReviewQueue";

export default async function PoReviewPage() {
  const supabase = await createClient();

  const [{ data: pending }, { data: clients }, { data: invoices }] = await Promise.all([
    supabase
      .from("unmatched_email_pos")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase.from("clients").select("id, name").order("name"),
    supabase
      .from("invoices")
      .select("id, invoice_number, client_id, status, reference, notes, currency")
      .order("invoice_date", { ascending: false }),
  ]);

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
      <PoReviewQueue items={pending || []} clients={clients || []} invoices={invoices || []} />
    </>
  );
}

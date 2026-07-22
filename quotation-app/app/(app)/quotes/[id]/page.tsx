import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import QuoteForm from "../QuoteForm";
import QuoteActions from "../QuoteActions";

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{status}</span>;
}

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: quotation }, { data: clients }, { data: billingAddresses }] = await Promise.all([
    supabase
      .from("quotations")
      .select("*, quotation_line_items(*)")
      .eq("id", id)
      .single(),
    supabase
      .from("clients")
      .select(
        "id, name, default_currency, default_gst_rate, display_currency_preference, billing_address"
      )
      .order("name"),
    supabase.from("client_billing_addresses").select("id, client_id, label, address"),
  ]);

  if (!quotation) notFound();

  const lineItems = ((quotation as any).quotation_line_items || [])
    .sort((a: any, b: any) => a.sort_order - b.sort_order)
    .map((li: any) => ({
      description: li.description,
      quantity: li.quantity,
      unit_price: li.unit_price,
    }));

  return (
    <>
      <div className="page-header">
        <div>
          <h1>
            {quotation.quote_number} <StatusBadge status={quotation.status} />
          </h1>
          <p className="subtitle">
            Created {new Date(quotation.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="card">
        <QuoteActions quoteId={quotation.id} status={quotation.status} />
      </div>

      <QuoteForm
        quoteId={quotation.id}
        clients={clients || []}
        billingAddresses={billingAddresses || []}
        initial={{
          client_id: quotation.client_id,
          quote_date: quotation.quote_date,
          currency: quotation.currency,
          gst_rate: quotation.gst_rate,
          gst_applicable: quotation.gst_applicable,
          exchange_rate: quotation.exchange_rate,
          display_currency: quotation.display_currency as "original" | "sgd",
          billing_address_id: quotation.billing_address_id,
          billing_address: quotation.billing_address,
          notes: quotation.notes || "",
          line_items: lineItems,
        }}
      />
    </>
  );
}

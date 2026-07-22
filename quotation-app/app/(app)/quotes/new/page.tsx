import { createClient } from "@/lib/supabase/server";
import QuoteForm from "../QuoteForm";

export default async function NewQuotePage() {
  const supabase = await createClient();
  const [{ data: clients }, { data: billingAddresses }] = await Promise.all([
    supabase
      .from("clients")
      .select(
        "id, name, default_currency, default_gst_rate, display_currency_preference, billing_address"
      )
      .order("name"),
    supabase.from("client_billing_addresses").select("id, client_id, label, address"),
  ]);

  return (
    <>
      <div className="page-header">
        <h1>New quotation</h1>
      </div>
      <QuoteForm clients={clients || []} billingAddresses={billingAddresses || []} />
    </>
  );
}

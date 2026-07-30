import { createClient } from "@/lib/supabase/server";
import ImportQuoteForm from "../ImportQuoteForm";

export default async function ImportQuotePage() {
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
        <h1>Import quotation from file</h1>
      </div>
      <ImportQuoteForm clients={clients || []} billingAddresses={billingAddresses || []} />
    </>
  );
}

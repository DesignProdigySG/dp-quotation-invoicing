import { createClient } from "@/lib/supabase/server";
import QuoteForm from "../QuoteForm";

export default async function NewQuotePage() {
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, default_currency, default_gst_rate")
    .order("name");

  return (
    <>
      <div className="page-header">
        <h1>New quotation</h1>
      </div>
      <QuoteForm clients={clients || []} />
    </>
  );
}

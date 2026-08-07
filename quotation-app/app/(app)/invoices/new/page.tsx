import { createClient } from "@/lib/supabase/server";
import InvoiceForm from "../InvoiceForm";
import { FormDirtyProvider } from "@/lib/forms/FormDirtyContext";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ externalQuote?: string }>;
}) {
  const { externalQuote } = await searchParams;
  const externalQuoteStatus = externalQuote === "yes" ? "has_external_quote" : "no_quote";

  const supabase = await createClient();
  const [{ data: clients }, { data: billingAddresses }] = await Promise.all([
    supabase
      .from("clients")
      .select(
        "id, name, default_currency, default_gst_rate, default_payment_terms_days, default_management_fee_rate, display_currency_preference, billing_address"
      )
      .order("name"),
    supabase.from("client_billing_addresses").select("id, client_id, label, address"),
  ]);

  const firstClient = clients?.[0];

  return (
    <>
      <div className="page-header">
        <h1>New invoice</h1>
      </div>
      <FormDirtyProvider>
        <InvoiceForm
          currency={firstClient?.default_currency || "SGD"}
          gstRate={firstClient?.default_gst_rate ?? 9}
          gstApplicable={true}
          clientDefaultBillingAddress={firstClient?.billing_address ?? null}
          billingAddresses={billingAddresses || []}
          clients={clients || []}
          externalQuoteStatus={externalQuoteStatus}
        />
      </FormDirtyProvider>
    </>
  );
}

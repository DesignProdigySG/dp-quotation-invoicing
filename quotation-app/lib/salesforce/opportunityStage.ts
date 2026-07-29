import { createClient } from "@/lib/supabase/server";
import { getSalesforceClientForConnection } from "./client";

// Flips a quotation's linked Salesforce Opportunity to Closed Won once BOTH
// of these become true for its invoice: a PO has been confirmed-matched to
// it (a resolved row in unmatched_email_pos) AND the invoice has been sent.
// Neither side of that check lives in one place today (PO match confirm is
// one action, "became Sent" happens from three independent invoice actions),
// so this is called from all of them rather than hooked into a single
// chokepoint — see docs/DECISIONS.md for the Phase B write-up.
//
// Never throws and never surfaces a UI error directly — this is a
// best-effort enrichment that must not block marking an invoice sent or
// confirming a PO match. Failures are instead written onto the linked
// quotation's salesforce_push_error, visible on the quote page. Idempotent:
// safe to call redundantly (e.g. after every relevant status change) since
// re-setting an already-Closed-Won Opportunity to Closed Won is a no-op.
export async function syncOpportunityStageForInvoice(invoiceId: string): Promise<void> {
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("quotation_id, status")
    .eq("id", invoiceId)
    .maybeSingle();

  if (!invoice?.quotation_id) return;
  if (invoice.status !== "Sent" && invoice.status !== "Paid") return;

  const { data: quotation } = await supabase
    .from("quotations")
    .select("id, salesforce_opportunity_id")
    .eq("id", invoice.quotation_id)
    .maybeSingle();

  if (!quotation?.salesforce_opportunity_id) return;

  const { data: resolvedPo } = await supabase
    .from("unmatched_email_pos")
    .select("id")
    .eq("resolved_invoice_id", invoiceId)
    .eq("status", "resolved")
    .limit(1)
    .maybeSingle();

  if (!resolvedPo) return;

  try {
    const { conn } = await getSalesforceClientForConnection();
    await conn.sobject("Opportunity").update({
      Id: quotation.salesforce_opportunity_id,
      StageName: "Closed Won",
      CloseDate: new Date().toISOString().slice(0, 10),
    });
    await supabase
      .from("quotations")
      .update({ salesforce_push_error: null })
      .eq("id", quotation.id);
  } catch (e) {
    await supabase
      .from("quotations")
      .update({
        salesforce_push_error: `Failed to close Opportunity: ${
          e instanceof Error ? e.message : "unknown error"
        }`,
      })
      .eq("id", quotation.id);
  }
}

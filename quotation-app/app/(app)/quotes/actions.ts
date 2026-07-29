"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addDaysToDateString } from "@/lib/format";
import { BRAND } from "@/lib/pdf/brand";
import { getSalesforceClientForConnection } from "@/lib/salesforce/client";
import { findOrCreateSalesforceAccount } from "@/lib/salesforce/accounts";
import { findOpportunityFieldByLabel } from "@/lib/salesforce/opportunityFields";

export type LineItemInput = {
  description: string;
  quantity: number;
  unit_price: number;
};

export type QuotationInput = {
  client_id: string;
  quote_date: string;
  currency: string;
  gst_rate: number;
  gst_applicable: boolean;
  exchange_rate?: number | null;
  display_currency: "original" | "sgd";
  billing_address_id?: string | null;
  billing_address?: string | null;
  notes?: string;
  valid_until?: string | null;
  line_items: LineItemInput[];
};

export async function createQuotation(input: QuotationInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const validUntil =
    input.valid_until || addDaysToDateString(input.quote_date, BRAND.quoteValidityDays);

  const { data: quotation, error } = await supabase
    .from("quotations")
    .insert({
      owner_id: user.id,
      client_id: input.client_id,
      quote_date: input.quote_date,
      currency: input.currency,
      gst_rate: input.gst_rate,
      gst_applicable: input.gst_applicable,
      exchange_rate: input.exchange_rate ?? null,
      display_currency: input.display_currency,
      billing_address_id: input.billing_address_id ?? null,
      billing_address: input.billing_address ?? null,
      notes: input.notes || null,
      valid_until: validUntil,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  if (input.line_items.length > 0) {
    const { error: liError } = await supabase.from("quotation_line_items").insert(
      input.line_items.map((li, idx) => ({
        quotation_id: quotation.id,
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unit_price,
        sort_order: idx,
      }))
    );
    if (liError) throw new Error(liError.message);
  }

  revalidatePath("/quotes");
  revalidatePath("/board");
  return quotation;
}

export async function updateQuotation(id: string, input: QuotationInput) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("quotations")
    .update({
      client_id: input.client_id,
      quote_date: input.quote_date,
      currency: input.currency,
      gst_rate: input.gst_rate,
      gst_applicable: input.gst_applicable,
      exchange_rate: input.exchange_rate ?? null,
      display_currency: input.display_currency,
      billing_address_id: input.billing_address_id ?? null,
      billing_address: input.billing_address ?? null,
      notes: input.notes || null,
      valid_until: input.valid_until ?? null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  const { error: delError } = await supabase
    .from("quotation_line_items")
    .delete()
    .eq("quotation_id", id);
  if (delError) throw new Error(delError.message);

  if (input.line_items.length > 0) {
    const { error: liError } = await supabase.from("quotation_line_items").insert(
      input.line_items.map((li, idx) => ({
        quotation_id: id,
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unit_price,
        sort_order: idx,
      }))
    );
    if (liError) throw new Error(liError.message);
  }

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);
  revalidatePath("/board");
}

export async function setQuotationStatus(
  id: string,
  status: "Draft" | "Sent" | "Accepted" | "Invoiced"
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("quotations")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);
  revalidatePath("/board");
}

export async function deleteQuotation(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("quotations").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/quotes");
  revalidatePath("/board");
}

export async function convertQuotationToInvoice(quotationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: quotation, error: qError } = await supabase
    .from("quotations")
    .select("*, quotation_line_items(*)")
    .eq("id", quotationId)
    .single();

  if (qError || !quotation) throw new Error(qError?.message || "Quote not found");

  const { data: invoice, error: invError } = await supabase
    .from("invoices")
    .insert({
      owner_id: user.id,
      quotation_id: quotation.id,
      client_id: quotation.client_id,
      currency: quotation.currency,
      gst_rate: quotation.gst_rate,
      gst_applicable: quotation.gst_applicable,
      exchange_rate: quotation.exchange_rate,
      display_currency: quotation.display_currency,
      billing_address_id: quotation.billing_address_id,
      billing_address: quotation.billing_address,
      notes: quotation.notes,
    })
    .select()
    .single();

  if (invError) throw new Error(invError.message);

  const lineItems = (quotation as any).quotation_line_items as {
    description: string;
    quantity: number;
    unit_price: number;
    sort_order: number;
  }[];

  if (lineItems.length > 0) {
    const { error: liError } = await supabase.from("invoice_line_items").insert(
      lineItems.map((li) => ({
        invoice_id: invoice.id,
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unit_price,
        sort_order: li.sort_order,
      }))
    );
    if (liError) throw new Error(liError.message);
  }

  await supabase
    .from("quotations")
    .update({ status: "Invoiced" })
    .eq("id", quotationId);

  revalidatePath("/quotes");
  revalidatePath("/invoices");
  revalidatePath("/board");

  return invoice;
}

// Never throws — same convention as pushInvoiceToXero: failures are returned
// as { error } and also persisted onto the quotation row
// (salesforce_push_error) so the state survives a page refresh. Pushes an
// empty Quote (no QuoteLineItem rows) under a newly-created Opportunity in
// an open stage — confirmed with the user that Salesforce is used purely as
// a quote-number generator here, matching their own existing manual
// convention of unlined "Quote 1" records. The Opportunity is deliberately
// left open; it only flips to Closed Won later via
// syncOpportunityStageForInvoice, once a PO is matched AND the invoice is
// sent (see lib/salesforce/opportunityStage.ts).
const OPPORTUNITY_OWNER_FIELD_LABEL = "Opportunity Owner (Custom)";
const CROSS_SELL_FIELD_LABEL = "Cross-sell Opportunity?";

export async function pushQuotationToSalesforce(
  quotationId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: quotation, error: fetchError } = await supabase
    .from("quotations")
    .select("*, clients(id, name, salesforce_account_id), quotation_line_items(*)")
    .eq("id", quotationId)
    .single();

  if (fetchError || !quotation) {
    return { error: "Quotation not found" };
  }

  const client = (quotation as any).clients as {
    id: string;
    name: string;
    salesforce_account_id: string | null;
  } | null;
  if (!client) {
    return { error: "This quotation has no client on record" };
  }

  const lineItems = ((quotation as any).quotation_line_items || []) as {
    quantity: number;
    unit_price: number;
  }[];
  const amount = lineItems.reduce((sum, li) => sum + li.quantity * li.unit_price, 0);

  async function recordFailure(message: string) {
    await supabase
      .from("quotations")
      .update({ salesforce_push_error: message })
      .eq("id", quotationId);
    return { error: message };
  }

  const { data: pusherProfile } = await supabase
    .from("profiles")
    .select("dp_bubble")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!pusherProfile?.dp_bubble) {
    return await recordFailure("Set your DP Bubble in Settings before pushing to Salesforce");
  }
  const dpBubble = pusherProfile.dp_bubble;

  try {
    const { conn } = await getSalesforceClientForConnection();

    const accountId = await findOrCreateSalesforceAccount(conn, client);

    const ownerField = await findOpportunityFieldByLabel(conn, OPPORTUNITY_OWNER_FIELD_LABEL);
    if (!ownerField) {
      return await recordFailure(
        `Could not find the "${OPPORTUNITY_OWNER_FIELD_LABEL}" field in Salesforce`
      );
    }

    const crossSellField = await findOpportunityFieldByLabel(conn, CROSS_SELL_FIELD_LABEL);
    if (!crossSellField) {
      return await recordFailure(
        `Could not find the "${CROSS_SELL_FIELD_LABEL}" field in Salesforce`
      );
    }
    let crossSellNoValue: string | boolean;
    if (crossSellField.type === "boolean") {
      crossSellNoValue = false;
    } else {
      const noOption = crossSellField.picklistValues.find(
        (pv) => pv.label.trim().toLowerCase() === "no"
      );
      if (!noOption) {
        return await recordFailure(
          `Could not determine the "No" value for "${CROSS_SELL_FIELD_LABEL}"`
        );
      }
      crossSellNoValue = noOption.value;
    }

    const opportunity = await conn.sobject("Opportunity").create({
      Name: `${client.name} - Quotation`,
      AccountId: accountId,
      // Left open on purpose — see function comment above. "Proposal/Price
      // Quote" is a standard picklist value; if this org uses a different
      // set of stage names, the real Salesforce error will name the valid
      // ones and this is a one-line fix.
      StageName: "Proposal/Price Quote",
      CloseDate: quotation.valid_until ?? quotation.quote_date,
      Amount: amount,
      [ownerField.name]: dpBubble,
      [crossSellField.name]: crossSellNoValue,
    });
    if (!opportunity.success) {
      return await recordFailure(
        opportunity.errors[0]?.message || "Salesforce rejected the Opportunity"
      );
    }

    const quote = await conn.sobject("Quote").create({
      Name: "Quote 1",
      OpportunityId: opportunity.id,
    });
    if (!quote.success) {
      return await recordFailure(quote.errors[0]?.message || "Salesforce rejected the Quote");
    }

    const created = await conn.sobject("Quote").retrieve(quote.id);
    const quoteNumber = (created as { QuoteNumber?: string }).QuoteNumber ?? null;

    const { error: updateError } = await supabase
      .from("quotations")
      .update({
        salesforce_quote_id: quote.id,
        salesforce_quote_number: quoteNumber,
        salesforce_opportunity_id: opportunity.id,
        salesforce_pushed_at: new Date().toISOString(),
        salesforce_push_error: null,
      })
      .eq("id", quotationId);
    if (updateError) return { error: updateError.message };

    revalidatePath(`/quotes/${quotationId}`);
    revalidatePath("/quotes");
    return {};
  } catch (e) {
    return await recordFailure(e instanceof Error ? e.message : "Failed to push to Salesforce");
  }
}

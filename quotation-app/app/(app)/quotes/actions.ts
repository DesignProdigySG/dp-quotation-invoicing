"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
  notes?: string;
  line_items: LineItemInput[];
};

export async function createQuotation(input: QuotationInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

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
      notes: input.notes || null,
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
      notes: input.notes || null,
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

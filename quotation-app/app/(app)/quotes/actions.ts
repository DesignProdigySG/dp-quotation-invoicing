"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addDaysToDateString } from "@/lib/format";
import { BRAND } from "@/lib/pdf/brand";
import {
  extractQuotationFromDocument,
  type ExtractedQuotationDocument,
} from "@/lib/email-quote/extractQuotationFromDocument";
import type { AttachmentContentBlock } from "@/lib/email-quote/gmailAttachments";

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
  internal_notes?: string | null;
  valid_until?: string | null;
  title?: string | null;
  // Only relevant for a quotation imported from an externally-built
  // document (see extractQuotationFromUpload below) — normal create/edit
  // flows never set this, since quote_number self-generates on insert via
  // trg_set_quote_number.
  quote_number?: string | null;
  external_quote_file_path?: string | null;
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
      internal_notes: input.internal_notes || null,
      valid_until: validUntil,
      title: input.title || null,
      quote_number: input.quote_number || null,
      external_quote_file_path: input.external_quote_file_path || null,
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
      internal_notes: input.internal_notes || null,
      valid_until: input.valid_until ?? null,
      title: input.title || null,
      quote_number: input.quote_number || null,
      external_quote_file_path: input.external_quote_file_path || null,
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

// Never throws — a thrown Server Action error is redacted to a generic
// message in production, so failures are returned as { error } instead.
export async function deleteQuotation(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  // Two FKs into quotations default to NO ACTION rather than SET NULL like
  // invoices.quotation_id already does (confirmed directly against the live
  // schema), so they'd otherwise block this delete outright. Null them out
  // rather than deleting those rows — preserves the historical email-intake
  // record (status/resolved_at stay intact), just detaches the now-deleted
  // quotation reference.
  await supabase
    .from("unmatched_email_quotes")
    .update({ resolved_quotation_id: null })
    .eq("resolved_quotation_id", id);
  await supabase
    .from("unmatched_email_pos")
    .update({ suggested_quotation_id: null })
    .eq("suggested_quotation_id", id);

  const { error } = await supabase.from("quotations").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/quotes");
  revalidatePath("/board");
  return {};
}

export async function convertQuotationToInvoice(quotationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: quotation, error: qError } = await supabase
    .from("quotations")
    .select("*, quotation_line_items(*), clients(default_payment_terms_days)")
    .eq("id", quotationId)
    .single();

  if (qError || !quotation) throw new Error(qError?.message || "Quote not found");

  const client = (quotation as any).clients as {
    default_payment_terms_days: number | null;
  } | null;
  const dueDate = client?.default_payment_terms_days
    ? addDaysToDateString(quotation.quote_date, client.default_payment_terms_days)
    : null;

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
      internal_notes: quotation.internal_notes,
      due_date: dueDate,
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

const ALLOWED_IMPORT_FILE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
];
const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

export type ExtractedQuotationForImport = ExtractedQuotationDocument & {
  suggested_client_id: string | null;
  source_file_path: string;
};

// Never throws — same convention as the other Settings/quote actions.
// Extracts a priced quotation document (built outside this app) into a
// prefill for the "new quotation" form. Nothing is written to the database
// here — the user still reviews and explicitly saves via the normal
// createQuotation path, same as every other quotation creation route.
export async function extractQuotationFromUpload(
  formData: FormData
): Promise<{ error?: string; data?: ExtractedQuotationForImport }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not signed in" };

    const file = formData.get("file");
    if (!(file instanceof File)) return { error: "No file provided" };
    if (!ALLOWED_IMPORT_FILE_TYPES.includes(file.type)) {
      return { error: "The file must be a PNG, JPG, GIF, WEBP, or PDF" };
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      return { error: "The file must be under 10MB" };
    }

    // Keep the original file on record — this quotation is sourced from an
    // externally-built document, so the document itself is the closest
    // thing to a "quote number of record" it has. Same bucket and path
    // convention as invoices/actions.ts's uploadExternalQuoteFile.
    const sourceFilePath = `${user.id}/${randomUUID()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("external-quotes")
      .upload(sourceFilePath, file, { contentType: file.type });
    if (uploadError) return { error: uploadError.message };

    const bytes = Buffer.from(await file.arrayBuffer()).toString("base64");
    const attachment: AttachmentContentBlock =
      file.type === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes } }
        : {
            type: "image",
            source: {
              type: "base64",
              media_type: file.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: bytes,
            },
          };

    const extracted = await extractQuotationFromDocument(attachment);
    if (!extracted) {
      return { error: "Could not extract a quotation from this file — try a clearer copy." };
    }

    let suggestedClientId: string | null = null;
    if (extracted.client_name) {
      const { data: clients } = await supabase.from("clients").select("id, name");
      const normalized = extracted.client_name.trim().toLowerCase();
      const match = (clients || []).find((c) => c.name.trim().toLowerCase() === normalized);
      suggestedClientId = match?.id ?? null;
    }

    return {
      data: {
        ...extracted,
        suggested_client_id: suggestedClientId,
        source_file_path: sourceFilePath,
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to extract the file" };
  }
}

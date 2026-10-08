"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function resolveUnmatchedEmailPo(
  id: string,
  input: { invoiceId: string; reference: string; note: string }
) {
  const supabase = await createClient();

  const { data: invoice, error: fetchError } = await supabase
    .from("invoices")
    .select("reference, notes")
    .eq("id", input.invoiceId)
    .single();
  if (fetchError || !invoice) throw new Error(fetchError?.message || "Invoice not found");

  const update: { reference?: string; notes?: string } = {};
  if (!invoice.reference && input.reference.trim()) {
    update.reference = input.reference.trim();
  }
  if (input.note.trim()) {
    update.notes = invoice.notes ? `${invoice.notes}\n${input.note.trim()}` : input.note.trim();
  }

  if (Object.keys(update).length > 0) {
    const { error: updateError } = await supabase
      .from("invoices")
      .update(update)
      .eq("id", input.invoiceId);
    if (updateError) throw new Error(updateError.message);
  }

  const { error } = await supabase
    .from("unmatched_email_pos")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_invoice_id: input.invoiceId,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/review/purchase-orders");
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${input.invoiceId}`);
}

export async function dismissUnmatchedEmailPo(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("unmatched_email_pos")
    .update({ status: "dismissed" })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/review/purchase-orders");
}

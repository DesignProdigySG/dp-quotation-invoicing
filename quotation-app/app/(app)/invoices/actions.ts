"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { LineItemInput } from "../quotes/actions";

export type InvoiceInput = {
  due_date: string | null;
  reference?: string | null;
  exchange_rate?: number | null;
  display_currency: "original" | "sgd";
  billing_address_id?: string | null;
  billing_address?: string | null;
  notes?: string;
  line_items: LineItemInput[];
};

export async function updateInvoice(id: string, input: InvoiceInput) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("invoices")
    .update({
      due_date: input.due_date,
      reference: input.reference || null,
      exchange_rate: input.exchange_rate ?? null,
      display_currency: input.display_currency,
      billing_address_id: input.billing_address_id ?? null,
      billing_address: input.billing_address ?? null,
      notes: input.notes || null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  const { error: delError } = await supabase
    .from("invoice_line_items")
    .delete()
    .eq("invoice_id", id);
  if (delError) throw new Error(delError.message);

  if (input.line_items.length > 0) {
    const { error: liError } = await supabase.from("invoice_line_items").insert(
      input.line_items.map((li, idx) => ({
        invoice_id: id,
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unit_price,
        sort_order: idx,
      }))
    );
    if (liError) throw new Error(liError.message);
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/board");
}

export async function setInvoiceStatus(id: string, status: "Draft" | "Sent" | "Paid") {
  const supabase = await createClient();
  const { error } = await supabase.from("invoices").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/board");
}

export async function deleteInvoice(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("invoices").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/invoices");
  revalidatePath("/board");
}

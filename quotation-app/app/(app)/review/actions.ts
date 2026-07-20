"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createQuotation, type QuotationInput } from "../quotes/actions";

export async function resolveUnmatchedEmailQuote(id: string, input: QuotationInput) {
  const quotation = await createQuotation(input);

  const supabase = await createClient();
  const { error } = await supabase
    .from("unmatched_email_quotes")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_quotation_id: quotation.id,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/review");
  return quotation;
}

export async function dismissUnmatchedEmailQuote(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("unmatched_email_quotes")
    .update({ status: "dismissed" })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/review");
}

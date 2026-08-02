"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSalesforceClientForConnection } from "@/lib/salesforce/client";

export type ClientInput = {
  name: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  billing_address?: string | null;
  ai_instructions?: string | null;
  default_currency: string;
  default_gst_rate: number;
  default_payment_terms_days?: number | null;
  display_currency_preference: "original" | "sgd";
  salesforce_account_id?: string | null;
};

export async function createClientRecord(input: ClientInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data, error } = await supabase
    .from("clients")
    .insert({ ...input, owner_id: user.id })
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/clients");
  return data;
}

export async function updateClientRecord(id: string, input: ClientInput) {
  const supabase = await createClient();
  const { error } = await supabase.from("clients").update(input).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
}

export async function deleteClientRecord(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/clients");
  redirect("/clients");
}

// Escapes SOQL LIKE wildcard characters in freeform user input before it's
// interpolated into a $like condition.
function escapeForSoqlLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// Never throws — returns { accounts: [], error } on failure so the picker
// UI can show a message instead of crashing. Skips searching on very short
// input to avoid firing on the first keystroke.
export async function searchSalesforceAccounts(
  query: string
): Promise<{ accounts: { id: string; name: string }[]; error?: string }> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { accounts: [] };

  try {
    const { conn } = await getSalesforceClientForConnection();
    const results = await conn
      .sobject("Account")
      .find({ Name: { $like: `%${escapeForSoqlLike(trimmed)}%` } }, "Id, Name")
      .limit(20);
    return {
      accounts: (results as unknown as { Id: string; Name: string }[]).map((r) => ({
        id: r.Id,
        name: r.Name,
      })),
    };
  } catch (e) {
    return { accounts: [], error: e instanceof Error ? e.message : "Search failed" };
  }
}

// Best-effort lookup of an already-matched Account's name, for display only
// — clients.salesforce_account_id only stores the ID. Never throws; a
// failure here (e.g. Salesforce disconnected) shouldn't break the client
// edit page, which isn't fundamentally about Salesforce.
export async function getSalesforceAccountName(
  accountId: string
): Promise<{ name?: string; error?: string }> {
  try {
    const { conn } = await getSalesforceClientForConnection();
    const record = await conn.sobject("Account").retrieve(accountId);
    return { name: (record as { Name?: string }).Name };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lookup failed" };
  }
}

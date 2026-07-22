"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createBillingAddress(
  clientId: string,
  input: { label: string; address: string }
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await supabase.from("client_billing_addresses").insert({
    owner_id: user.id,
    client_id: clientId,
    label: input.label,
    address: input.address,
  });
  if (error) return { error: error.message };

  revalidatePath(`/clients/${clientId}`);
  return {};
}

export async function updateBillingAddress(
  id: string,
  clientId: string,
  input: { label: string; address: string }
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("client_billing_addresses")
    .update({
      label: input.label,
      address: input.address,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/clients/${clientId}`);
  return {};
}

export async function deleteBillingAddress(
  id: string,
  clientId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("client_billing_addresses").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/clients/${clientId}`);
  return {};
}

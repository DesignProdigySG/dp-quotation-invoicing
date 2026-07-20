"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ClientInput = {
  name: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  billing_address?: string | null;
  default_currency: string;
  default_gst_rate: number;
  display_currency_preference: "original" | "sgd";
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

import { createServiceClient } from "@/lib/supabase/service";

export async function matchClient(ownerId: string, contactEmail: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, default_currency, default_gst_rate, display_currency_preference")
    .eq("owner_id", ownerId)
    .eq("contact_email", contactEmail)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

import { createClient } from "@/lib/supabase/server";

// A cheap, OAuth-refresh-free read of the connected org's instance URL, for
// building links to Salesforce records — unlike getSalesforceClientForConnection,
// this doesn't need a working access token, just the stored instance_url.
export async function getSalesforceInstanceUrl(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("salesforce_connections")
    .select("instance_url")
    .eq("id", 1)
    .maybeSingle();
  return data?.instance_url ?? null;
}

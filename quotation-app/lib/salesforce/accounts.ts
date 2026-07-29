import type { Connection } from "jsforce";
import { createClient } from "@/lib/supabase/server";

export type ClientForSalesforce = {
  id: string;
  name: string;
  salesforce_account_id: string | null;
};

export async function findOrCreateSalesforceAccount(
  conn: Connection,
  client: ClientForSalesforce
): Promise<string> {
  if (client.salesforce_account_id) return client.salesforce_account_id;

  const existing = await conn.sobject("Account").findOne({ Name: client.name });
  let accountId: string | undefined = (existing as { Id?: string } | null)?.Id;

  if (!accountId) {
    const created = await conn.sobject("Account").create({ Name: client.name });
    accountId = created.success ? created.id : undefined;
  }

  if (!accountId) {
    throw new Error("Could not find or create a Salesforce Account for this client");
  }

  const supabase = await createClient();
  await supabase.from("clients").update({ salesforce_account_id: accountId }).eq("id", client.id);

  return accountId;
}

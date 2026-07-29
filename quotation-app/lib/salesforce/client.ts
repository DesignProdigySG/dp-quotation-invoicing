import { Connection } from "jsforce";
import { createClient } from "@/lib/supabase/server";
import { encrypt, decrypt } from "@/lib/crypto";
import { getSalesforceOAuth2 } from "./oauthClient";

const SALESFORCE_KEY_ENV = "SALESFORCE_TOKEN_ENCRYPTION_KEY";

export async function getSalesforceClientForConnection(): Promise<{
  conn: Connection;
  instanceUrl: string;
}> {
  const supabase = await createClient();
  const { data: connection } = await supabase
    .from("salesforce_connections")
    .select("instance_url, refresh_token_encrypted")
    .eq("id", 1)
    .maybeSingle();

  if (!connection?.refresh_token_encrypted || !connection.instance_url) {
    throw new Error("Salesforce is not connected. Connect it in Settings first.");
  }

  const oauth2 = getSalesforceOAuth2();
  const refreshToken = decrypt(connection.refresh_token_encrypted, SALESFORCE_KEY_ENV);

  let tokenResponse;
  try {
    tokenResponse = await oauth2.refreshToken(refreshToken);
  } catch {
    throw new Error("Salesforce session expired or was revoked. Reconnect in Settings.");
  }

  // Salesforce doesn't rotate refresh tokens by default the way Xero does,
  // but an org's Connected App policy can enable rotation — persist
  // defensively whenever a (possibly new) refresh token comes back, rather
  // than assuming it never changes.
  if (tokenResponse.refresh_token) {
    const { error: saveError } = await supabase
      .from("salesforce_connections")
      .update({
        refresh_token_encrypted: encrypt(tokenResponse.refresh_token, SALESFORCE_KEY_ENV),
        instance_url: tokenResponse.instance_url,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (saveError) {
      throw new Error(`Failed to persist refreshed Salesforce token: ${saveError.message}`);
    }
  }

  const conn = new Connection({
    instanceUrl: tokenResponse.instance_url,
    accessToken: tokenResponse.access_token,
  });

  return { conn, instanceUrl: tokenResponse.instance_url };
}

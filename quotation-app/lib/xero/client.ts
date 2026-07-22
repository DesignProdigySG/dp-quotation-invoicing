import { XeroClient } from "xero-node";
import { createClient } from "@/lib/supabase/server";
import { encrypt, decrypt } from "@/lib/crypto";

const XERO_KEY_ENV = "XERO_TOKEN_ENCRYPTION_KEY";

export type XeroConnectionRow = {
  tenant_id: string | null;
  gst_tax_type: string | null;
  gst_tax_rate: number | null;
  no_gst_tax_type: string | null;
  default_account_code: string | null;
};

export async function getXeroClientForConnection(): Promise<{
  xero: XeroClient;
  tenantId: string;
  connection: XeroConnectionRow;
}> {
  const supabase = await createClient();
  const { data: connection } = await supabase
    .from("xero_connections")
    .select(
      "tenant_id, refresh_token_encrypted, gst_tax_type, gst_tax_rate, no_gst_tax_type, default_account_code"
    )
    .eq("id", 1)
    .maybeSingle();

  if (!connection?.refresh_token_encrypted || !connection.tenant_id) {
    throw new Error("Xero is not connected. Connect it in Settings first.");
  }

  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Xero OAuth env vars are not configured");
  }

  const refreshToken = decrypt(connection.refresh_token_encrypted, XERO_KEY_ENV);
  const xero = new XeroClient({ clientId, clientSecret });

  let tokenSet;
  try {
    tokenSet = await xero.refreshWithRefreshToken(clientId, clientSecret, refreshToken);
  } catch {
    throw new Error("Xero session expired or was revoked. Reconnect in Settings.");
  }

  // Xero rotates the refresh token on every use (unlike Google's reusable
  // ones) — the new token must be persisted before any other Xero API call,
  // or a failure downstream leaves the stored token pointing at one Xero no
  // longer honors.
  if (tokenSet.refresh_token) {
    const { error: saveError } = await supabase
      .from("xero_connections")
      .update({
        refresh_token_encrypted: encrypt(tokenSet.refresh_token, XERO_KEY_ENV),
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (saveError) {
      throw new Error(`Failed to persist refreshed Xero token: ${saveError.message}`);
    }
  }

  return {
    xero,
    tenantId: connection.tenant_id,
    connection,
  };
}

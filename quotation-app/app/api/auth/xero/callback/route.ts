import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getXeroClient } from "@/lib/xero/oauthClient";
import { encrypt } from "@/lib/crypto";

// This route does an OIDC discovery round-trip (a fresh XeroClient here has
// no cached issuer metadata from the /start request), the token exchange, a
// connected-tenants lookup, and a Supabase write — all sequential. That's
// comfortably past Vercel's 10s default function timeout on some invocations,
// and if the function is killed after Xero has already consumed the one-time
// authorization code but before the connection is saved, the result looks
// exactly like a hung request followed by "invalid_grant" on retry.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const expectedState = request.cookies.get("xero_oauth_state")?.value;
  if (!expectedState) {
    return NextResponse.redirect(
      new URL("/settings?xero_error=invalid_state", request.url)
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const xero = getXeroClient(expectedState);

  let refreshToken: string | undefined;
  try {
    const tokenSet = await xero.apiCallback(request.url);
    refreshToken = tokenSet.refresh_token;
  } catch (e) {
    // Surface the real error rather than a hardcoded label — this call can
    // fail for reasons other than a state mismatch (discovery/network
    // errors, a rejected token exchange, etc.), and guessing the cause from
    // a generic message wastes a debugging round trip.
    return NextResponse.redirect(
      new URL(
        `/settings?xero_error=${encodeURIComponent(
          e instanceof Error ? e.message : "token_exchange_failed"
        )}`,
        request.url
      )
    );
  }

  if (!refreshToken) {
    return NextResponse.redirect(
      new URL("/settings?xero_error=no_refresh_token", request.url)
    );
  }

  let tenantId: string | undefined;
  let tenantName: string | undefined;
  try {
    const tenants = await xero.updateTenants(false);
    tenantId = tenants[0]?.tenantId;
    tenantName = tenants[0]?.tenantName;
  } catch (e) {
    return NextResponse.redirect(
      new URL(
        `/settings?xero_error=${encodeURIComponent(
          e instanceof Error ? e.message : "no_tenant"
        )}`,
        request.url
      )
    );
  }

  if (!tenantId) {
    return NextResponse.redirect(
      new URL("/settings?xero_error=no_tenant", request.url)
    );
  }

  // Deliberately omits gst_tax_type/no_gst_tax_type/default_account_code so a
  // reconnect doesn't clear an already-saved mapping.
  const { error } = await supabase.from("xero_connections").upsert(
    {
      id: 1,
      tenant_id: tenantId,
      tenant_name: tenantName ?? null,
      refresh_token_encrypted: encrypt(refreshToken, "XERO_TOKEN_ENCRYPTION_KEY"),
      connected_by: user.id,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?xero_error=${encodeURIComponent(error.message)}`, request.url)
    );
  }

  const response = NextResponse.redirect(
    new URL("/settings?xero_connected=1", request.url)
  );
  response.cookies.delete("xero_oauth_state");
  return response;
}

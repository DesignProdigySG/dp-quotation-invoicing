import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSalesforceOAuth2 } from "@/lib/salesforce/oauthClient";
import { encrypt } from "@/lib/crypto";

// Same reasoning as the Xero callback: the token exchange + Supabase write
// are sequential and can comfortably exceed Vercel's 10s default, and once
// Salesforce's one-time authorization code has been exchanged it cannot be
// retried — everything after that point redirects with a real error instead
// of throwing, so a crash never looks like a silent hang followed by a
// confusing retry failure.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const expectedState = request.cookies.get("salesforce_oauth_state")?.value;
  const returnedState = request.nextUrl.searchParams.get("state");
  if (!expectedState || !returnedState || expectedState !== returnedState) {
    return NextResponse.redirect(
      new URL("/settings?salesforce_error=invalid_state", request.url)
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(
      new URL("/settings?salesforce_error=no_code", request.url)
    );
  }

  const codeVerifier = request.cookies.get("salesforce_oauth_verifier")?.value;
  if (!codeVerifier) {
    return NextResponse.redirect(
      new URL("/settings?salesforce_error=missing_verifier", request.url)
    );
  }

  let oauth2;
  try {
    oauth2 = getSalesforceOAuth2({ pkce: true });
    // getSalesforceOAuth2({ pkce: true }) builds a fresh instance with its
    // own random PKCE verifier — overwrite it with the one actually used to
    // build the authorization URL the user was redirected to, carried via
    // cookie.
    oauth2.codeVerifier = codeVerifier;
  } catch (e) {
    return NextResponse.redirect(
      new URL(
        `/settings?salesforce_error=${encodeURIComponent(
          e instanceof Error ? e.message : "salesforce_client_config_error"
        )}`,
        request.url
      )
    );
  }

  let refreshToken: string | undefined;
  let instanceUrl: string | undefined;
  try {
    const tokenResponse = await oauth2.requestToken(code);
    refreshToken = tokenResponse.refresh_token;
    instanceUrl = tokenResponse.instance_url;
  } catch (e) {
    // Surface the real error rather than a hardcoded label — this call can
    // fail for reasons other than a state mismatch (a rejected token
    // exchange, network errors, etc.), and guessing the cause from a
    // generic message wastes a debugging round trip.
    return NextResponse.redirect(
      new URL(
        `/settings?salesforce_error=${encodeURIComponent(
          e instanceof Error ? e.message : "token_exchange_failed"
        )}`,
        request.url
      )
    );
  }

  if (!refreshToken || !instanceUrl) {
    return NextResponse.redirect(
      new URL("/settings?salesforce_error=no_refresh_token", request.url)
    );
  }

  // By this point Salesforce's one-time authorization code has already been
  // successfully exchanged — it cannot be retried. Everything from here on
  // MUST redirect with an error rather than throw.
  try {
    const { error } = await supabase.from("salesforce_connections").upsert(
      {
        id: 1,
        instance_url: instanceUrl,
        refresh_token_encrypted: encrypt(refreshToken, "SALESFORCE_TOKEN_ENCRYPTION_KEY"),
        connected_by: user.id,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (error) {
      return NextResponse.redirect(
        new URL(`/settings?salesforce_error=${encodeURIComponent(error.message)}`, request.url)
      );
    }
  } catch (e) {
    return NextResponse.redirect(
      new URL(
        `/settings?salesforce_error=${encodeURIComponent(
          e instanceof Error ? e.message : "save_failed"
        )}`,
        request.url
      )
    );
  }

  const response = NextResponse.redirect(
    new URL("/settings?salesforce_connected=1", request.url)
  );
  response.cookies.delete("salesforce_oauth_state");
  response.cookies.delete("salesforce_oauth_verifier");
  return response;
}

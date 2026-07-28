import { OAuth2 } from "jsforce";

// "refresh_token" and "offline_access" are a single combined scope in
// Salesforce's picklist ("refresh_token, offline_access"); "api" grants
// REST API access; "id" lets the callback look up the connected org/user
// during token exchange, mirroring what the Gmail/Xero callbacks already
// do with their own profile-lookup calls.
export const SALESFORCE_SCOPES = "api refresh_token id";

export function getSalesforceOAuth2(opts: { pkce?: boolean } = {}) {
  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
  const redirectUri = process.env.SALESFORCE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Salesforce OAuth env vars are not configured");
  }
  // Defaults to the production login host; set SALESFORCE_LOGIN_URL to
  // https://test.salesforce.com if the connected org is a sandbox.
  const loginUrl = process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com";
  // useVerifier makes jsforce generate a PKCE code_verifier/code_challenge —
  // required by Salesforce's External Client App OAuth policy on the
  // authorization_code grant only. Only the start/callback routes opt in
  // (via opts.pkce); the refresh_token grant used by lib/salesforce/client.ts
  // must NOT carry a code_verifier, so it keeps the default (no PKCE). Each
  // call to this function produces its own random verifier, so the start
  // route's instance and the callback route's instance never share one
  // automatically — the verifier has to be carried across via a cookie (see
  // start/callback routes) and reapplied to the callback's instance before
  // requestToken().
  return new OAuth2({
    clientId,
    clientSecret,
    redirectUri,
    loginUrl,
    useVerifier: opts.pkce ?? false,
  });
}

import { XeroClient } from "xero-node";

// `accounting.settings` is required for the Settings page to list tax rates
// and accounts (GET /TaxRates, GET /Accounts) — without it those calls 403
// even though the OAuth handshake itself succeeds. `openid profile email` is
// required by xero-node's identity layer (apiCallback/updateTenants).
export const XERO_SCOPES = [
  "openid",
  "profile",
  "email",
  "accounting.transactions",
  "accounting.contacts",
  "accounting.settings",
  "offline_access",
];

export function getXeroClient(state?: string): XeroClient {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  const redirectUri = process.env.XERO_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Xero OAuth env vars are not configured");
  }
  return new XeroClient({
    clientId,
    clientSecret,
    redirectUris: [redirectUri],
    scopes: XERO_SCOPES,
    state,
  });
}

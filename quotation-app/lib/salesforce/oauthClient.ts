import { OAuth2 } from "jsforce";

// "refresh_token" and "offline_access" are a single combined scope in
// Salesforce's picklist ("refresh_token, offline_access"); "api" grants
// REST API access; "id" lets the callback look up the connected org/user
// during token exchange, mirroring what the Gmail/Xero callbacks already
// do with their own profile-lookup calls.
export const SALESFORCE_SCOPES = "api refresh_token id";

export function getSalesforceOAuth2() {
  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
  const redirectUri = process.env.SALESFORCE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Salesforce OAuth env vars are not configured");
  }
  // Defaults to the production login host; set SALESFORCE_LOGIN_URL to
  // https://test.salesforce.com if the connected org is a sandbox.
  const loginUrl = process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com";
  return new OAuth2({ clientId, clientSecret, redirectUri, loginUrl });
}

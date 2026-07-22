import { google } from "googleapis";

// `gmail.labels` only covers managing label *definitions* (create/list/delete a
// label) — it does NOT allow applying a label to a message. Since we need
// `messages.modify` to mark processed emails, `gmail.modify` (a superset that
// also covers label management) is required instead.
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
];

export function getOAuthClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth env vars are not configured");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

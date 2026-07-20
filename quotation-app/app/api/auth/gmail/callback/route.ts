import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient } from "@/lib/supabase/server";
import { getOAuthClient } from "@/lib/google/oauthClient";
import { encrypt } from "@/lib/crypto";

const PROCESSED_LABEL_NAME = "Quotation Bot Processed";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get("gmail_oauth_state")?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(
      new URL("/settings?gmail_error=invalid_state", request.url)
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const oauth2Client = getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    return NextResponse.redirect(
      new URL("/settings?gmail_error=no_refresh_token", request.url)
    );
  }
  oauth2Client.setCredentials(tokens);

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const email = profile.data.emailAddress;
  if (!email) {
    return NextResponse.redirect(
      new URL("/settings?gmail_error=no_profile", request.url)
    );
  }

  const labelsRes = await gmail.users.labels.list({ userId: "me" });
  let processedLabel = labelsRes.data.labels?.find(
    (l) => l.name === PROCESSED_LABEL_NAME
  );
  if (!processedLabel) {
    const created = await gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name: PROCESSED_LABEL_NAME,
        labelListVisibility: "labelHide",
        messageListVisibility: "show",
      },
    });
    processedLabel = created.data;
  }

  const { error } = await supabase.from("gmail_connections").upsert(
    {
      owner_id: user.id,
      email,
      refresh_token_encrypted: encrypt(tokens.refresh_token),
      processed_label_id: processedLabel.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id" }
  );

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?gmail_error=${encodeURIComponent(error.message)}`, request.url)
    );
  }

  const response = NextResponse.redirect(
    new URL("/settings?gmail_connected=1", request.url)
  );
  response.cookies.delete("gmail_oauth_state");
  return response;
}

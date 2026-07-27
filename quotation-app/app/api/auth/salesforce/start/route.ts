import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSalesforceOAuth2, SALESFORCE_SCOPES } from "@/lib/salesforce/oauthClient";

export const maxDuration = 60;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let url: string;
  try {
    const oauth2 = getSalesforceOAuth2();
    const state = randomBytes(16).toString("hex");
    url = oauth2.getAuthorizationUrl({ scope: SALESFORCE_SCOPES, state });

    const response = NextResponse.redirect(url);
    response.cookies.set("salesforce_oauth_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
    return response;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "salesforce_client_config_error" },
      { status: 500 }
    );
  }
}

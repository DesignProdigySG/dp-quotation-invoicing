import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getXeroClient } from "@/lib/xero/oauthClient";

// buildConsentUrl() does an OIDC discovery round-trip to Xero before it can
// build the URL — cheap insurance against the same class of timeout as the
// callback route, even though this route is normally faster.
export const maxDuration = 60;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = randomBytes(16).toString("hex");
  const xero = getXeroClient(state);
  const url = await xero.buildConsentUrl();

  const response = NextResponse.redirect(url);
  response.cookies.set("xero_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}

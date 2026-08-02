import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // api/cron and api/slack authenticate themselves (a bearer secret, an
    // HMAC signature) rather than via a browser session cookie — GitHub
    // Actions and Slack have no session to send, so subjecting them to the
    // login-redirect below would just bounce every legitimate call to /login.
    "/((?!_next/static|_next/image|favicon.ico|api/cron|api/slack|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

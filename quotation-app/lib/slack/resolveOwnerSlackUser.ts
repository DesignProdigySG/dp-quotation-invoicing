import { createServiceClient } from "@/lib/supabase/service";
import { lookupSlackUserIdByEmail } from "./client";

// DMs the Gmail connection's owner directly rather than posting to a shared
// channel — resolved dynamically from their Supabase Auth email rather than
// a hardcoded Slack user id, so nothing needs reconfiguring if the app is
// ever used by someone else. Requires the Slack app's users:read.email scope.
export async function resolveOwnerSlackUserId(ownerId: string): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.admin.getUserById(ownerId);
  if (error || !data.user?.email) {
    throw new Error(`Could not look up an email for owner ${ownerId}`);
  }

  const slackUserId = await lookupSlackUserIdByEmail(data.user.email);
  if (!slackUserId) {
    throw new Error(
      `No Slack account found for ${data.user.email} — the Slack workspace member's email must match this app's login email.`
    );
  }
  return slackUserId;
}

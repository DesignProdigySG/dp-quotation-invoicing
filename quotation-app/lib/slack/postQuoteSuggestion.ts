import { postSlackMessage } from "./client";
import { resolveOwnerSlackUserId } from "./resolveOwnerSlackUser";
import { buildSuggestionText, buildSuggestionBlocks } from "./blocks";
import { createServiceClient } from "@/lib/supabase/service";

// DMs the Gmail connection's owner (resolved via resolveOwnerSlackUserId)
// about one newly-inserted unmatched_email_quotes row, then stores the
// resulting DM-conversation id/ts back onto that row so the interactions
// route (app/api/slack/interactions/route.ts) can edit the message in place
// once someone confirms or corrects the suggestion.
export async function postQuoteSuggestion(params: {
  quoteId: string;
  ownerId: string;
  senderEmail: string;
  senderName: string | null;
  suggestedClientId: string | null;
  suggestedClientName: string | null;
  matchSource: string | null;
  allClients: { id: string; name: string }[];
}): Promise<void> {
  const slackUserId = await resolveOwnerSlackUserId(params.ownerId);
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("APP_URL is not set");

  const text = buildSuggestionText({
    senderEmail: params.senderEmail,
    senderName: params.senderName,
    suggestedClientName: params.suggestedClientName,
    matchSource: params.matchSource,
  });
  const blocks = buildSuggestionBlocks({
    text,
    reviewUrl: `${appUrl.replace(/\/$/, "")}/review`,
    quoteId: params.quoteId,
    suggestedClientId: params.suggestedClientId,
    clients: params.allClients,
  });

  const { channel, ts } = await postSlackMessage(slackUserId, text, blocks);

  const supabase = createServiceClient();
  await supabase
    .from("unmatched_email_quotes")
    .update({ slack_channel_id: channel, slack_message_ts: ts })
    .eq("id", params.quoteId);
}

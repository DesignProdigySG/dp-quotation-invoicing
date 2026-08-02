import { postSlackMessage } from "./client";
import { buildSuggestionText, buildSuggestionBlocks } from "./blocks";
import { createServiceClient } from "@/lib/supabase/service";

// Posts the Slack notification for one newly-inserted unmatched_email_quotes
// row, then stores the resulting channel/ts back onto that row so the
// interactions route (app/api/slack/interactions/route.ts) can edit the
// message in place once someone confirms or corrects the suggestion.
export async function postQuoteSuggestion(params: {
  quoteId: string;
  senderEmail: string;
  senderName: string | null;
  suggestedClientId: string | null;
  suggestedClientName: string | null;
  matchSource: string | null;
  allClients: { id: string; name: string }[];
}): Promise<void> {
  const channel = process.env.SLACK_CHANNEL_ID;
  if (!channel) throw new Error("SLACK_CHANNEL_ID is not set");
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

  const { ts } = await postSlackMessage(channel, text, blocks);

  const supabase = createServiceClient();
  await supabase
    .from("unmatched_email_quotes")
    .update({ slack_channel_id: channel, slack_message_ts: ts })
    .eq("id", params.quoteId);
}

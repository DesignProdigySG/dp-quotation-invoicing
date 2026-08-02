import type { SlackBlock } from "./client";

const MATCH_SOURCE_LABEL: Record<string, string> = {
  correction: "remembered from a previous correction",
  exact_email: "exact email match",
  email_domain: "same-domain match",
  ai_fuzzy: "AI best guess",
};

// Slack action_ids this app's interactions route (app/api/slack/interactions/
// route.ts) recognizes. The quote id travels differently per element: a
// button carries it in `value` (JSON), the client-picker select carries it in
// its own action_id suffix since Slack's static_select has no free-form
// `value` field of its own.
export const CONFIRM_ACTION_ID = "confirm_client";
export const CORRECT_ACTION_ID_PREFIX = "correct_client:";

export function buildSuggestionText(params: {
  senderEmail: string;
  senderName?: string | null;
  suggestedClientName: string | null;
  matchSource: string | null;
}): string {
  const from = params.senderName ? `${params.senderName} <${params.senderEmail}>` : params.senderEmail;
  if (!params.suggestedClientName) {
    return `📨 New quote request from *${from}* — couldn't suggest a client, needs a look in the app.`;
  }
  const sourceLabel = params.matchSource ? MATCH_SOURCE_LABEL[params.matchSource] ?? params.matchSource : "guess";
  return `📨 New quote request from *${from}* — looks like *${params.suggestedClientName}* (${sourceLabel}).`;
}

export function buildSuggestionBlocks(params: {
  text: string;
  reviewUrl: string;
  quoteId: string;
  suggestedClientId: string | null;
  clients: { id: string; name: string }[];
}): SlackBlock[] {
  const blocks: SlackBlock[] = [
    { type: "section", text: { type: "mrkdwn", text: params.text } },
  ];

  if (params.suggestedClientId) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          style: "primary",
          text: { type: "plain_text", text: "✅ Correct" },
          action_id: CONFIRM_ACTION_ID,
          value: JSON.stringify({ quoteId: params.quoteId, clientId: params.suggestedClientId }),
        },
        {
          type: "static_select",
          placeholder: { type: "plain_text", text: "Actually it's..." },
          action_id: `${CORRECT_ACTION_ID_PREFIX}${params.quoteId}`,
          options: params.clients.slice(0, 100).map((c) => ({
            text: { type: "plain_text", text: c.name },
            value: c.id,
          })),
        },
      ],
    });
  }

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `<${params.reviewUrl}|Open in app →>` }],
  });

  return blocks;
}

export function buildResolvedText(clientName: string): string {
  return `✅ Confirmed — *${clientName}*. Finish pricing and send in the app.`;
}

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifySlackRequest } from "@/lib/slack/verifyRequest";
import { updateSlackMessage } from "@/lib/slack/client";
import { buildResolvedText, CONFIRM_ACTION_ID, CORRECT_ACTION_ID_PREFIX } from "@/lib/slack/blocks";

type SlackBlockAction = {
  type: string;
  action_id: string;
  value?: string;
  selected_option?: { value: string };
};

type SlackInteractionPayload = {
  type: string;
  actions?: SlackBlockAction[];
  channel?: { id: string };
  message?: { ts: string };
};

// Records the confirmed/corrected client on the unmatched_email_quotes row
// and upserts email_client_corrections (Tier 0 for future matching) — same
// handling whether the person clicked "Correct" (confirming the suggestion)
// or picked a different client from the dropdown, since both produce an
// equally trustworthy sender→client mapping going forward.
async function applyClientDecision(
  quoteId: string,
  clientId: string,
  source: "slack_confirmed" | "slack_corrected"
): Promise<{ clientName: string } | null> {
  const supabase = createServiceClient();

  const { data: quote } = await supabase
    .from("unmatched_email_quotes")
    .select("owner_id, sender_email")
    .eq("id", quoteId)
    .single();
  const { data: client } = await supabase.from("clients").select("id, name").eq("id", clientId).single();
  if (!quote || !client) return null;

  await supabase
    .from("unmatched_email_quotes")
    .update({ suggested_client_id: clientId, suggested_client_source: source })
    .eq("id", quoteId);

  await supabase.from("email_client_corrections").upsert(
    {
      owner_id: quote.owner_id,
      sender_email: quote.sender_email.trim().toLowerCase(),
      client_id: clientId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,sender_email" }
  );

  return { clientName: client.name };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const verified = verifySlackRequest({
    rawBody,
    timestampHeader: req.headers.get("x-slack-request-timestamp"),
    signatureHeader: req.headers.get("x-slack-signature"),
  });
  if (!verified) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const payloadRaw = params.get("payload");
  if (!payloadRaw) return NextResponse.json({});

  const payload = JSON.parse(payloadRaw) as SlackInteractionPayload;
  const action = payload.actions?.[0];
  if (!action || !payload.channel || !payload.message) return NextResponse.json({});

  let outcome: { quoteId: string; clientId: string; source: "slack_confirmed" | "slack_corrected" } | null = null;

  if (action.action_id === CONFIRM_ACTION_ID && action.value) {
    const { quoteId, clientId } = JSON.parse(action.value) as { quoteId: string; clientId: string };
    outcome = { quoteId, clientId, source: "slack_confirmed" };
  } else if (action.action_id.startsWith(CORRECT_ACTION_ID_PREFIX) && action.selected_option) {
    const quoteId = action.action_id.slice(CORRECT_ACTION_ID_PREFIX.length);
    outcome = { quoteId, clientId: action.selected_option.value, source: "slack_corrected" };
  }

  if (!outcome) return NextResponse.json({});

  const result = await applyClientDecision(outcome.quoteId, outcome.clientId, outcome.source);
  if (result) {
    const text = buildResolvedText(result.clientName);
    const appUrl = process.env.APP_URL?.replace(/\/$/, "");
    await updateSlackMessage(payload.channel.id, payload.message.ts, text, [
      { type: "section", text: { type: "mrkdwn", text } },
      ...(appUrl
        ? [{ type: "context", elements: [{ type: "mrkdwn", text: `<${appUrl}/review|Open in app →>` }] }]
        : []),
    ]);
  }

  return NextResponse.json({});
}

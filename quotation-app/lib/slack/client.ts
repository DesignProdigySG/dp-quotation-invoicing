// Plain fetch() against Slack's Web API — it's just JSON-over-HTTPS with a
// Bearer token, not worth a new SDK dependency for two calls.

export type SlackBlock = Record<string, unknown>;

type SlackApiResponse = {
  ok: boolean;
  ts?: string;
  channel?: string;
  error?: string;
  user?: { id: string };
};

function getBotToken(): string {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN is not set");
  return token;
}

async function callSlack(
  method: string,
  init: { query: Record<string, string> } | { body: Record<string, unknown> }
): Promise<SlackApiResponse> {
  const res =
    "query" in init
      ? await fetch(`https://slack.com/api/${method}?${new URLSearchParams(init.query)}`, {
          headers: { Authorization: `Bearer ${getBotToken()}` },
        })
      : await fetch(`https://slack.com/api/${method}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${getBotToken()}`,
            "Content-Type": "application/json; charset=utf-8",
          },
          body: JSON.stringify(init.body),
        });
  const data = (await res.json()) as SlackApiResponse;
  if (!data.ok) throw new Error(`Slack API error (${method}): ${data.error || "unknown"}`);
  return data;
}

// `channel` here can be a real channel id OR a user id — Slack treats both
// the same way in chat.postMessage, auto-opening a DM for a user id. Its
// response's own `channel` field is what must be used for any later
// chat.update, since for a DM that's the D-prefixed conversation id, not the
// U-prefixed user id that was passed in.
export async function postSlackMessage(
  channel: string,
  text: string,
  blocks: SlackBlock[]
): Promise<{ channel: string; ts: string }> {
  const data = await callSlack("chat.postMessage", { body: { channel, text, blocks } });
  if (!data.ts) throw new Error("Slack didn't return a message timestamp");
  return { channel: data.channel ?? channel, ts: data.ts };
}

// Requires the users:read.email bot scope. Returns null (not an error) for
// "no Slack account uses this email" — a normal, expected outcome the caller
// should handle gracefully, not a failure.
export async function lookupSlackUserIdByEmail(email: string): Promise<string | null> {
  try {
    const data = await callSlack("users.lookupByEmail", { query: { email } });
    return data.user?.id ?? null;
  } catch (e) {
    if (e instanceof Error && e.message.includes("users_not_found")) return null;
    throw e;
  }
}

export async function updateSlackMessage(
  channel: string,
  ts: string,
  text: string,
  blocks: SlackBlock[]
): Promise<void> {
  await callSlack("chat.update", { body: { channel, ts, text, blocks } });
}

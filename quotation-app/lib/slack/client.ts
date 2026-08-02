// Plain fetch() against Slack's Web API — it's just JSON-over-HTTPS with a
// Bearer token, not worth a new SDK dependency for two calls.

export type SlackBlock = Record<string, unknown>;

type SlackApiResponse = { ok: boolean; ts?: string; error?: string };

function getBotToken(): string {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN is not set");
  return token;
}

async function callSlack(method: string, body: Record<string, unknown>): Promise<SlackApiResponse> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getBotToken()}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as SlackApiResponse;
  if (!data.ok) throw new Error(`Slack API error (${method}): ${data.error || "unknown"}`);
  return data;
}

export async function postSlackMessage(
  channel: string,
  text: string,
  blocks: SlackBlock[]
): Promise<{ channel: string; ts: string }> {
  const data = await callSlack("chat.postMessage", { channel, text, blocks });
  if (!data.ts) throw new Error("Slack didn't return a message timestamp");
  return { channel, ts: data.ts };
}

export async function updateSlackMessage(
  channel: string,
  ts: string,
  text: string,
  blocks: SlackBlock[]
): Promise<void> {
  await callSlack("chat.update", { channel, ts, text, blocks });
}

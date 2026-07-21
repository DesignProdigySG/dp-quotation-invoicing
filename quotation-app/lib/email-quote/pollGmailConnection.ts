import { google } from "googleapis";
import { getOAuthClient } from "@/lib/google/oauthClient";
import { decrypt } from "@/lib/crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { extractQuoteFromEmail } from "./extractQuoteFromEmail";
import { matchClient } from "./matchClient";
import { createQuoteFromEmailData } from "./createQuoteFromEmailData";
import { insertUnmatchedQuote } from "./insertUnmatchedQuote";
import type { Tables, Json } from "@/types/database.types";

type GmailConnection = Tables<"gmail_connections">;

type GmailMessagePart = {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: GmailMessagePart[] | null;
};

function decodeBody(payload?: GmailMessagePart | null): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = decodeBody(part);
      if (text) return text;
    }
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    const html = Buffer.from(payload.body.data, "base64url").toString("utf8");
    return html.replace(/<[^>]+>/g, " ");
  }
  return "";
}

export type PollResult = {
  processed: number;
  matched: number;
  unmatched: number;
  failed: number;
  errors: string[];
};

export async function pollGmailConnection(connection: GmailConnection): Promise<PollResult> {
  if (!connection.watched_label_id) {
    return { processed: 0, matched: 0, unmatched: 0, failed: 0, errors: [] };
  }

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ refresh_token: decrypt(connection.refresh_token_encrypted) });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // Gmail's `q: "label:..."` search syntax expects a label *name*, not the
  // internal label ID we store — so filtering must go through the `labelIds`
  // list param (ID-based) instead, with the "already processed" exclusion
  // checked against each fetched message's own labelIds.
  const listRes = await gmail.users.messages.list({
    userId: "me",
    labelIds: [connection.watched_label_id],
    maxResults: 25,
  });
  const messageRefs = listRes.data.messages || [];

  let processed = 0;
  let matched = 0;
  let unmatched = 0;
  let failed = 0;
  const errors: string[] = [];
  const service = createServiceClient();

  for (const messageRef of messageRefs) {
    if (!messageRef.id) continue;

    try {
      const messageRes = await gmail.users.messages.get({
        userId: "me",
        id: messageRef.id,
        format: "full",
      });
      const message = messageRes.data;

      if (
        connection.processed_label_id &&
        message.labelIds?.includes(connection.processed_label_id)
      ) {
        continue;
      }
      processed++;

      const headers = message.payload?.headers || [];
      const subject = headers.find((h) => h.name === "Subject")?.value || "";
      const from = headers.find((h) => h.name === "From")?.value || "";
      const bodyText = decodeBody(message.payload);

      const extracted = await extractQuoteFromEmail({ subject, from, body: bodyText });
      const client = await matchClient(connection.owner_id, extracted.client_email);

      if (client) {
        await createQuoteFromEmailData({
          owner_id: connection.owner_id,
          client_id: client.id,
          items: extracted.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unit_price: 0,
          })),
          notes: extracted.notes,
          currency: client.default_currency,
          gst_rate: client.default_gst_rate,
        });
        matched++;
      } else {
        await insertUnmatchedQuote({
          owner_id: connection.owner_id,
          sender_email: extracted.client_email,
          sender_name: extracted.client_name ?? null,
          subject,
          parsed_data: extracted as unknown as Json,
        });
        unmatched++;
      }

      if (connection.processed_label_id) {
        await gmail.users.messages.modify({
          userId: "me",
          id: messageRef.id,
          requestBody: { addLabelIds: [connection.processed_label_id] },
        });
      }
    } catch (e) {
      failed++;
      errors.push(e instanceof Error ? e.message : "Unknown error processing a message");
    }
  }

  await service
    .from("gmail_connections")
    .update({ last_checked_at: new Date().toISOString() })
    .eq("owner_id", connection.owner_id);

  return { processed, matched, unmatched, failed, errors };
}

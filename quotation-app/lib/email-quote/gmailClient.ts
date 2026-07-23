import { google, gmail_v1 } from "googleapis";
import { getOAuthClient } from "@/lib/google/oauthClient";
import { decrypt } from "@/lib/crypto";
import type { Tables } from "@/types/database.types";

type GmailConnection = Tables<"gmail_connections">;

export function getGmailClientForConnection(connection: GmailConnection): gmail_v1.Gmail {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ refresh_token: decrypt(connection.refresh_token_encrypted) });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

type GmailMessagePart = {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: GmailMessagePart[] | null;
};

export function decodeBody(payload?: GmailMessagePart | null): string {
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

export type GmailCandidate = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
  internalDate: string;
};

const MAX_CANDIDATE_MESSAGES = 200;
const METADATA_FETCH_CONCURRENCY = 10;

export async function listCandidateMessages(
  connection: GmailConnection,
  watchedLabelId: string,
  processedLabelId: string | null
): Promise<GmailCandidate[]> {
  const gmail = getGmailClientForConnection(connection);

  const messageRefs: { id: string; threadId: string }[] = [];
  let pageToken: string | undefined;
  do {
    const listRes = await gmail.users.messages.list({
      userId: "me",
      labelIds: [watchedLabelId],
      maxResults: 100,
      pageToken,
    });
    for (const m of listRes.data.messages || []) {
      if (m.id && m.threadId) messageRefs.push({ id: m.id, threadId: m.threadId });
    }
    pageToken = listRes.data.nextPageToken ?? undefined;
  } while (pageToken && messageRefs.length < MAX_CANDIDATE_MESSAGES);

  const capped = messageRefs.slice(0, MAX_CANDIDATE_MESSAGES);

  const candidates: GmailCandidate[] = [];
  for (let i = 0; i < capped.length; i += METADATA_FETCH_CONCURRENCY) {
    const chunk = capped.slice(i, i + METADATA_FETCH_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async ({ id, threadId }) => {
        const res = await gmail.users.messages.get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: ["Subject", "From"],
        });
        return { id, threadId, message: res.data };
      })
    );
    for (const { id, threadId, message } of results) {
      if (processedLabelId && message.labelIds?.includes(processedLabelId)) {
        continue;
      }
      const headers = message.payload?.headers || [];
      candidates.push({
        id,
        threadId,
        subject: headers.find((h) => h.name === "Subject")?.value || "(no subject)",
        from: headers.find((h) => h.name === "From")?.value || "",
        snippet: message.snippet || "",
        internalDate: message.internalDate || "0",
      });
    }
  }

  candidates.sort((a, b) => Number(b.internalDate) - Number(a.internalDate));
  return candidates;
}

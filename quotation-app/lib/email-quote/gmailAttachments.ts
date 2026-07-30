import type { gmail_v1 } from "googleapis";

// Kept in step with the manual external-quote-file upload allow-list
// (app/(app)/invoices/actions.ts's ALLOWED_EXTERNAL_QUOTE_TYPES) rather than
// inventing a different list for the same underlying purpose.
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

// Caps chosen to bound extraction cost/latency per email, not because Claude
// or Gmail need them this low — an email with more than a few genuinely
// distinct attachments is unusual for a quote request.
const MAX_ATTACHMENTS_PER_MESSAGE = 3;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

type GmailMessagePart = {
  mimeType?: string | null;
  filename?: string | null;
  body?: { attachmentId?: string | null; data?: string | null; size?: number | null } | null;
  parts?: GmailMessagePart[] | null;
};

export type CandidateAttachment = {
  // Gmail gives you exactly one of these per part, never both, never
  // neither: an attachmentId to fetch separately, or the bytes already
  // inlined in body.data (its own docs confirm small attachments often skip
  // attachmentId entirely and inline instead) — confirmed directly in
  // node_modules/googleapis/build/src/apis/gmail/v1.d.ts's
  // Schema$MessagePartBody comment, not guessed.
  attachmentId?: string | null;
  inlineData?: string | null;
  mimeType: string;
  filename: string;
  size: number;
};

// Walks the MIME tree of an already-fetched (format: "full") message payload
// collecting attachment parts of an allowed type/size — discovering these
// costs no extra Gmail API call, since format: "full" already returns the
// part metadata (mimeType/filename/attachmentId or inline data), it's just
// discarded today by decodeBody()'s text-only walk.
export function collectAttachmentParts(payload?: GmailMessagePart | null): CandidateAttachment[] {
  const found: CandidateAttachment[] = [];

  function walk(part?: GmailMessagePart | null) {
    if (!part) return;
    if (part.mimeType && ALLOWED_ATTACHMENT_MIME_TYPES.has(part.mimeType) && part.body) {
      if (part.body.attachmentId) {
        found.push({
          attachmentId: part.body.attachmentId,
          mimeType: part.mimeType,
          filename: part.filename || "attachment",
          size: part.body.size ?? 0,
        });
      } else if (part.body.data) {
        found.push({
          inlineData: part.body.data,
          mimeType: part.mimeType,
          filename: part.filename || "attachment",
          size: part.body.size ?? 0,
        });
      }
    }
    if (part.parts) {
      for (const child of part.parts) walk(child);
    }
  }

  walk(payload);
  return found.filter((a) => a.size <= MAX_ATTACHMENT_BYTES).slice(0, MAX_ATTACHMENTS_PER_MESSAGE);
}

export type AttachmentContentBlock =
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
        data: string;
      };
    }
  | {
      type: "document";
      source: { type: "base64"; media_type: "application/pdf"; data: string };
    };

// Fetches attachment bytes and converts them into Anthropic image/document
// content blocks ready to append to a Messages API call's content array.
// Only the attachmentId case needs a separate Gmail API call — an inline
// part already has its bytes in hand from the original format: "full" fetch.
export async function fetchAttachmentContentBlocks(
  gmail: gmail_v1.Gmail,
  messageId: string,
  attachments: CandidateAttachment[]
): Promise<AttachmentContentBlock[]> {
  const blocks: AttachmentContentBlock[] = [];

  for (const att of attachments) {
    let data: string | null | undefined;
    if (att.attachmentId) {
      const res = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId,
        id: att.attachmentId,
      });
      data = res.data.data;
    } else {
      data = att.inlineData;
    }
    if (!data) continue;

    // Gmail returns base64url — Anthropic expects standard base64 (same
    // re-encoding gmailClient.ts's decodeBody() already does for text parts).
    const standardBase64 = Buffer.from(data, "base64url").toString("base64");

    if (att.mimeType === "application/pdf") {
      blocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: standardBase64 },
      });
    } else {
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: att.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: standardBase64,
        },
      });
    }
  }

  return blocks;
}

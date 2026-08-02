import { createServiceClient } from "@/lib/supabase/service";
import {
  getGmailClientForConnection,
  decodeBody,
  type GmailConnection,
} from "./gmailClient";
import { parseSenderEmail } from "./parseSenderEmail";
import { findClientByEmail, type ClientForMatching } from "./matchClient";
import { fuzzyMatchClient } from "./fuzzyMatchClient";
import { extractQuoteFromEmail } from "./extractQuoteFromEmail";
import { extractQuoteWithClientContext } from "./extractQuoteWithClientContext";
import { insertUnmatchedQuote } from "./insertUnmatchedQuote";
import { collectAttachmentParts, fetchAttachmentContentBlocks } from "./gmailAttachments";
import type { Json } from "@/types/database.types";

export type CreatedQuoteSummary = {
  id: string;
  sender_email: string;
  sender_name: string | null;
  suggested_client_id: string | null;
  suggested_client_source: string | null;
};

export type ProcessSelectedResult = {
  processed: number;
  quotesExtracted: number;
  suggested: number;
  unmatched: number;
  failed: number;
  errors: string[];
  // Populated for every row inserted into unmatched_email_quotes this run —
  // callers with a notification channel (the cron route → Slack) use this to
  // know exactly what to announce without a second query. The existing
  // "Check now" UI flow ignores it.
  createdQuotes: CreatedQuoteSummary[];
};

type ClientMatch = {
  client: ClientForMatching;
  source: "correction" | "exact_email" | "email_domain" | "ai_fuzzy";
};

// Tier 0: a sender this app has been corrected about before (via Slack or the
// review page) is strictly more trustworthy than a fresh exact-email/domain
// guess — short-circuits the rest of the matcher the same way Tier 1 already
// does for a real exact-email hit.
async function findClientByPriorCorrection(
  ownerId: string,
  senderEmail: string,
  clients: ClientForMatching[]
): Promise<ClientMatch | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("email_client_corrections")
    .select("client_id")
    .eq("owner_id", ownerId)
    .eq("sender_email", senderEmail.trim().toLowerCase())
    .maybeSingle();
  if (!data) return null;
  const client = clients.find((c) => c.id === data.client_id);
  return client ? { client, source: "correction" } : null;
}

// Session-independent core of the Gmail quote-intake pipeline: matching,
// extraction, and insertion into unmatched_email_quotes for a given list of
// already-selected message ids. Deliberately takes the connection/client list
// as plain data rather than deriving them from a signed-in session, so it can
// be called both from the "Check now" Server Action (settings/actions.ts,
// wrapped in requireUser()) and from the scheduled cron route (no session at
// all) without duplicating this logic in two places.
export async function processGmailMessagesForConnection(
  connection: GmailConnection,
  clients: ClientForMatching[],
  messageIds: string[]
): Promise<ProcessSelectedResult> {
  const result: ProcessSelectedResult = {
    processed: 0,
    quotesExtracted: 0,
    suggested: 0,
    unmatched: 0,
    failed: 0,
    errors: [],
    createdQuotes: [],
  };

  const gmail = getGmailClientForConnection(connection);

  for (const messageId of messageIds) {
    try {
      const messageRes = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
      });
      const message = messageRes.data;
      const headers = message.payload?.headers || [];
      const subject = headers.find((h) => h.name === "Subject")?.value || "";
      const from = headers.find((h) => h.name === "From")?.value || "";
      const bodyText = decodeBody(message.payload);

      const attachmentParts = collectAttachmentParts(message.payload);
      const attachments =
        attachmentParts.length > 0
          ? await fetchAttachmentContentBlocks(gmail, messageId, attachmentParts)
          : [];

      const headerEmail = parseSenderEmail(from);

      // Tier 0: a previously-corrected sender (see findClientByPriorCorrection).
      let match: ClientMatch | null = headerEmail
        ? await findClientByPriorCorrection(connection.owner_id, headerEmail, clients)
        : null;

      // Tier 1: deterministic (exact email, then same-domain fallback).
      if (!match && headerEmail) {
        match = findClientByEmail(clients, headerEmail);
      }

      // Tier 2: cheap fuzzy match, only if tiers 0-1 found nothing.
      if (!match) {
        const fuzzy = await fuzzyMatchClient({ subject, from, body: bodyText, clients });
        if (fuzzy.client_id) {
          const client = clients.find((c) => c.id === fuzzy.client_id);
          if (client) match = { client, source: "ai_fuzzy" as const };
        }
      }

      // Tier 3: extraction — tailored if a client was identified, generic
      // otherwise. Returns an array: a single email (plus any attached
      // images/PDFs) can contain more than one distinct quote request.
      const extractedQuotes = match
        ? await extractQuoteWithClientContext({
            subject,
            from,
            body: bodyText,
            client: match.client,
            attachments,
          })
        : await extractQuoteFromEmail({ subject, from, body: bodyText, attachments });

      if (extractedQuotes.length === 0) {
        result.failed++;
        result.errors.push(`Could not extract any quote request from "${subject || messageId}"`);
      } else {
        for (const extracted of extractedQuotes) {
          const senderEmail = headerEmail || extracted.client_email;
          const senderName = extracted.client_name ?? null;
          const { id } = await insertUnmatchedQuote({
            owner_id: connection.owner_id,
            sender_email: senderEmail,
            sender_name: senderName,
            subject,
            gmail_message_id: messageId,
            parsed_data: extracted as unknown as Json,
            suggested_client_id: match?.client.id ?? null,
            suggested_client_source: match?.source ?? null,
          });
          result.createdQuotes.push({
            id,
            sender_email: senderEmail,
            sender_name: senderName,
            suggested_client_id: match?.client.id ?? null,
            suggested_client_source: match?.source ?? null,
          });
          if (match) result.suggested++;
          else result.unmatched++;
        }
        result.quotesExtracted += extractedQuotes.length;
      }

      if (connection.processed_label_id) {
        await gmail.users.messages.modify({
          userId: "me",
          id: messageId,
          requestBody: { addLabelIds: [connection.processed_label_id] },
        });
      }

      result.processed++;
    } catch (e) {
      result.failed++;
      result.errors.push(e instanceof Error ? e.message : "Unknown error processing a message");
    }
  }

  return result;
}

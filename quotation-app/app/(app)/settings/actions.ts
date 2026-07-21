"use server";

import { google } from "googleapis";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOAuthClient } from "@/lib/google/oauthClient";
import { decrypt } from "@/lib/crypto";
import {
  getGmailClientForConnection,
  decodeBody,
  listCandidateMessages,
  type GmailCandidate,
} from "@/lib/email-quote/gmailClient";
import { parseSenderEmail } from "@/lib/email-quote/parseSenderEmail";
import { findClientByEmail, type ClientForMatching } from "@/lib/email-quote/matchClient";
import { fuzzyMatchClient } from "@/lib/email-quote/fuzzyMatchClient";
import { extractQuoteFromEmail } from "@/lib/email-quote/extractQuoteFromEmail";
import { extractQuoteWithClientContext } from "@/lib/email-quote/extractQuoteWithClientContext";
import { insertUnmatchedQuote } from "@/lib/email-quote/insertUnmatchedQuote";
import type { Json } from "@/types/database.types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return { supabase, user };
}

export async function listGmailLabels() {
  const { supabase, user } = await requireUser();
  const { data: connection, error } = await supabase
    .from("gmail_connections")
    .select("refresh_token_encrypted")
    .eq("owner_id", user.id)
    .single();
  if (error || !connection) throw new Error("Gmail is not connected");

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ refresh_token: decrypt(connection.refresh_token_encrypted) });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const res = await gmail.users.labels.list({ userId: "me" });

  return (res.data.labels || [])
    .filter((label) => label.type === "user" && label.id && label.name)
    .map((label) => ({ id: label.id as string, name: label.name as string }));
}

// All actions below never throw, for the same reason: a thrown Server Action
// error is redacted to a generic message in production, so failures are
// returned as { error } data instead.

export async function saveWatchedLabel(
  labelId: string,
  labelName: string
): Promise<{ error?: string }> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase
      .from("gmail_connections")
      .update({
        watched_label_id: labelId,
        watched_label_name: labelName,
        updated_at: new Date().toISOString(),
      })
      .eq("owner_id", user.id);
    if (error) return { error: error.message };
    revalidatePath("/settings");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function disconnectGmail(): Promise<{ error?: string }> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("gmail_connections").delete().eq("owner_id", user.id);
    if (error) return { error: error.message };
    revalidatePath("/settings");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function listUnprocessedGmailCandidates(): Promise<{
  candidates: GmailCandidate[];
  error?: string;
}> {
  try {
    const { supabase, user } = await requireUser();
    const { data: connection, error } = await supabase
      .from("gmail_connections")
      .select("*")
      .eq("owner_id", user.id)
      .single();
    if (error || !connection) return { candidates: [], error: "Gmail is not connected" };
    if (!connection.watched_label_id) {
      return { candidates: [], error: "Choose a label to watch first" };
    }

    const candidates = await listCandidateMessages(connection);

    await supabase
      .from("gmail_connections")
      .update({ last_checked_at: new Date().toISOString() })
      .eq("owner_id", user.id);

    return { candidates };
  } catch (e) {
    return { candidates: [], error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export type ProcessSelectedResult = {
  processed: number;
  suggested: number;
  unmatched: number;
  failed: number;
  errors: string[];
};

export async function processSelectedGmailMessages(
  messageIds: string[]
): Promise<ProcessSelectedResult> {
  const result: ProcessSelectedResult = {
    processed: 0,
    suggested: 0,
    unmatched: 0,
    failed: 0,
    errors: [],
  };

  try {
    const { supabase, user } = await requireUser();
    const { data: connection, error: connError } = await supabase
      .from("gmail_connections")
      .select("*")
      .eq("owner_id", user.id)
      .single();
    if (connError || !connection) {
      result.errors.push("Gmail is not connected");
      return result;
    }

    const { data: clientsData, error: clientsError } = await supabase
      .from("clients")
      .select(
        "id, name, contact_email, billing_address, default_currency, default_gst_rate, display_currency_preference, ai_instructions"
      );
    if (clientsError) {
      result.errors.push(clientsError.message);
      return result;
    }
    const clients = (clientsData || []) as ClientForMatching[];

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

        // Tier 1: deterministic (exact email, then same-domain fallback).
        const headerEmail = parseSenderEmail(from);
        let match: {
          client: ClientForMatching;
          source: "exact_email" | "email_domain" | "ai_fuzzy";
        } | null = headerEmail ? findClientByEmail(clients, headerEmail) : null;

        // Tier 2: cheap fuzzy match, only if tier 1 found nothing.
        if (!match) {
          const fuzzy = await fuzzyMatchClient({ subject, from, body: bodyText, clients });
          if (fuzzy.client_id) {
            const client = clients.find((c) => c.id === fuzzy.client_id);
            if (client) match = { client, source: "ai_fuzzy" as const };
          }
        }

        // Tier 3: extraction — tailored if a client was identified, generic otherwise.
        const extracted = match
          ? await extractQuoteWithClientContext({ subject, from, body: bodyText, client: match.client })
          : await extractQuoteFromEmail({ subject, from, body: bodyText });

        await insertUnmatchedQuote({
          owner_id: user.id,
          sender_email: headerEmail || extracted.client_email,
          sender_name: extracted.client_name ?? null,
          subject,
          parsed_data: extracted as unknown as Json,
          suggested_client_id: match?.client.id ?? null,
          suggested_client_source: match?.source ?? null,
        });

        if (connection.processed_label_id) {
          await gmail.users.messages.modify({
            userId: "me",
            id: messageId,
            requestBody: { addLabelIds: [connection.processed_label_id] },
          });
        }

        result.processed++;
        if (match) result.suggested++;
        else result.unmatched++;
      } catch (e) {
        result.failed++;
        result.errors.push(e instanceof Error ? e.message : "Unknown error processing a message");
      }
    }

    revalidatePath("/settings");
    revalidatePath("/review");
    return result;
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : "Unknown error");
    return result;
  }
}

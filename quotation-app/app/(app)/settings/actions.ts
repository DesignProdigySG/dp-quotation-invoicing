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
import { getXeroClientForConnection } from "@/lib/xero/client";
import { listTaxRates, listAccounts } from "@/lib/xero/settings";
import { extractPoFromEmail } from "@/lib/email-po/extractPoFromEmail";
import { fuzzyMatchDocumentForPo, type DocumentCandidate } from "@/lib/email-po/fuzzyMatchDocumentForPo";
import { insertUnmatchedPo } from "@/lib/email-po/insertUnmatchedPo";
import { computeTotals } from "@/lib/format";

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

export type ProfileInput = {
  full_name: string;
  title: string;
};

export async function saveProfile(input: ProfileInput): Promise<{ error?: string }> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("profiles").upsert({
      owner_id: user.id,
      full_name: input.full_name || null,
      title: input.title || null,
      updated_at: new Date().toISOString(),
    });
    if (error) return { error: error.message };
    revalidatePath("/settings");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}

const SIGNATURE_PATH_SUFFIX = "signature";
const ALLOWED_SIGNATURE_TYPES = ["image/png", "image/jpeg"];
const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

export async function uploadSignature(formData: FormData): Promise<{ error?: string }> {
  try {
    const { supabase, user } = await requireUser();
    const file = formData.get("file");
    if (!(file instanceof File)) return { error: "No file provided" };
    if (!ALLOWED_SIGNATURE_TYPES.includes(file.type)) {
      return { error: "Signature must be a PNG or JPG image" };
    }
    if (file.size > MAX_SIGNATURE_BYTES) {
      return { error: "Signature image must be under 2MB" };
    }

    const path = `${user.id}/${SIGNATURE_PATH_SUFFIX}`;
    const { error: uploadError } = await supabase.storage
      .from("signatures")
      .upload(path, file, { contentType: file.type, upsert: true });
    if (uploadError) return { error: uploadError.message };

    const { error } = await supabase.from("profiles").upsert({
      owner_id: user.id,
      signature_path: path,
      updated_at: new Date().toISOString(),
    });
    if (error) return { error: error.message };

    revalidatePath("/settings");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function removeSignature(): Promise<{ error?: string }> {
  try {
    const { supabase, user } = await requireUser();
    await supabase.storage.from("signatures").remove([`${user.id}/${SIGNATURE_PATH_SUFFIX}`]);
    const { error } = await supabase
      .from("profiles")
      .update({ signature_path: null, updated_at: new Date().toISOString() })
      .eq("owner_id", user.id);
    if (error) return { error: error.message };
    revalidatePath("/settings");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}

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

    const candidates = await listCandidateMessages(
      connection,
      connection.watched_label_id,
      connection.processed_label_id
    );

    await supabase
      .from("gmail_connections")
      .update({ last_checked_at: new Date().toISOString() })
      .eq("owner_id", user.id);

    return { candidates };
  } catch (e) {
    return { candidates: [], error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function listXeroTaxRates(): Promise<{
  taxRates: { taxType: string; name: string; ratePercent: number }[];
  error?: string;
}> {
  try {
    await requireUser();
    const { xero, tenantId } = await getXeroClientForConnection();
    return { taxRates: await listTaxRates(xero, tenantId) };
  } catch (e) {
    return { taxRates: [], error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function listXeroAccounts(): Promise<{
  accounts: { code: string; name: string }[];
  error?: string;
}> {
  try {
    await requireUser();
    const { xero, tenantId } = await getXeroClientForConnection();
    return { accounts: await listAccounts(xero, tenantId) };
  } catch (e) {
    return { accounts: [], error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export type XeroConfigInput = {
  gst_tax_type: string;
  gst_tax_rate: number;
  no_gst_tax_type: string;
  default_account_code: string;
};

export async function saveXeroConfig(input: XeroConfigInput): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase
      .from("xero_connections")
      .update({
        gst_tax_type: input.gst_tax_type,
        gst_tax_rate: input.gst_tax_rate,
        no_gst_tax_type: input.no_gst_tax_type,
        default_account_code: input.default_account_code,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) return { error: error.message };
    revalidatePath("/settings");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function disconnectXero(): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireUser();
    // Keep the row (id=1 singleton) but clear the connection so any saved
    // tax/account mapping doesn't need to be re-entered if reconnected later.
    const { error } = await supabase
      .from("xero_connections")
      .update({
        tenant_id: null,
        tenant_name: null,
        refresh_token_encrypted: null,
        connected_by: null,
        connected_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) return { error: error.message };
    revalidatePath("/settings");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
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

export async function savePoWatchedLabel(
  labelId: string,
  labelName: string
): Promise<{ error?: string }> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase
      .from("gmail_connections")
      .update({
        po_watched_label_id: labelId,
        po_watched_label_name: labelName,
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

export async function listUnprocessedPoCandidates(): Promise<{
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
    if (!connection.po_watched_label_id) {
      return { candidates: [], error: "Choose a label to watch first" };
    }

    const candidates = await listCandidateMessages(
      connection,
      connection.po_watched_label_id,
      null
    );

    await supabase
      .from("gmail_connections")
      .update({ po_last_checked_at: new Date().toISOString() })
      .eq("owner_id", user.id);

    return { candidates };
  } catch (e) {
    return { candidates: [], error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export type ProcessSelectedPoResult = {
  processed: number;
  suggested: number;
  unmatched: number;
  failed: number;
  errors: string[];
};

export async function processSelectedPoMessages(
  messageIds: string[]
): Promise<ProcessSelectedPoResult> {
  const result: ProcessSelectedPoResult = {
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

        // Tier 3: extraction.
        const extracted = await extractPoFromEmail({ subject, from, body: bodyText });

        // Tier 4: once a client is identified, a PO is triggered by a
        // quotation (the invoice is downstream of that) and rarely cites our
        // own numbering — match by amount + description across that
        // client's quotations AND invoices together.
        let suggestedInvoiceId: string | null = null;
        let suggestedInvoiceSource: string | null = null;
        let suggestedQuotationId: string | null = null;
        if (match) {
          const [{ data: clientQuotations }, { data: clientInvoices }] = await Promise.all([
            supabase
              .from("quotations")
              .select("id, quote_number, currency, gst_rate, quote_date, quotation_line_items(description, quantity, unit_price)")
              .eq("client_id", match.client.id),
            supabase
              .from("invoices")
              .select("id, invoice_number, currency, gst_rate, invoice_date, quotation_id, invoice_line_items(description, quantity, unit_price)")
              .eq("client_id", match.client.id),
          ]);

          const candidates: DocumentCandidate[] = [
            ...(clientQuotations || []).map((q) => ({
              type: "quotation" as const,
              id: q.id,
              number: q.quote_number,
              currency: q.currency,
              total: computeTotals(q.quotation_line_items || [], q.gst_rate).total,
              date: q.quote_date,
              descriptions: (q.quotation_line_items || []).map((li) => li.description),
            })),
            ...(clientInvoices || []).map((inv) => ({
              type: "invoice" as const,
              id: inv.id,
              number: inv.invoice_number,
              currency: inv.currency,
              total: computeTotals(inv.invoice_line_items || [], inv.gst_rate).total,
              date: inv.invoice_date,
              descriptions: (inv.invoice_line_items || []).map((li) => li.description),
            })),
          ];

          const docMatch = await fuzzyMatchDocumentForPo({
            description: extracted.description,
            amount: extracted.amount,
            candidates,
          });

          if (docMatch?.type === "invoice") {
            suggestedInvoiceId = docMatch.id;
            suggestedInvoiceSource = "ai_amount_match";
          } else if (docMatch?.type === "quotation") {
            suggestedQuotationId = docMatch.id;
            const linkedInvoice = (clientInvoices || []).find(
              (inv) => inv.quotation_id === docMatch.id
            );
            if (linkedInvoice) {
              suggestedInvoiceId = linkedInvoice.id;
              suggestedInvoiceSource = "ai_match_via_quotation";
            }
          }
        }

        await insertUnmatchedPo({
          owner_id: user.id,
          sender_email: headerEmail || from,
          sender_name: extracted.client_name ?? null,
          subject,
          parsed_data: extracted as unknown as Json,
          suggested_client_id: match?.client.id ?? null,
          suggested_client_source: match?.source ?? null,
          suggested_invoice_id: suggestedInvoiceId,
          suggested_invoice_source: suggestedInvoiceSource,
          suggested_quotation_id: suggestedQuotationId,
        });

        result.processed++;
        if (match) result.suggested++;
        else result.unmatched++;
      } catch (e) {
        result.failed++;
        result.errors.push(e instanceof Error ? e.message : "Unknown error processing a message");
      }
    }

    revalidatePath("/settings");
    revalidatePath("/review/purchase-orders");
    return result;
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : "Unknown error");
    return result;
  }
}

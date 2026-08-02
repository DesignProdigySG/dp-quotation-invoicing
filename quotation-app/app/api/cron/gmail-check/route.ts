import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { listCandidateMessages } from "@/lib/email-quote/gmailClient";
import type { ClientForMatching } from "@/lib/email-quote/matchClient";
import { processGmailMessagesForConnection } from "@/lib/email-quote/processGmailMessagesForConnection";
import { postQuoteSuggestion } from "@/lib/slack/postQuoteSuggestion";

// Vercel Cron trigger (see vercel.json) — replaces the manual "Check now"
// click with a scheduled poll. Runs the exact same pipeline as the UI flow
// (processGmailMessagesForConnection), then posts a Slack notification per
// newly-created unmatched_email_quotes row. No session, so everything here
// goes through the service client, scoped explicitly by owner_id per
// connection rather than relying on RLS.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: connections, error } = await supabase
    .from("gmail_connections")
    .select("*")
    .not("watched_label_id", "is", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const summary: { owner_id: string; processed: number; suggested: number; unmatched: number; failed: number }[] = [];

  for (const connection of connections || []) {
    if (!connection.watched_label_id) continue;
    try {
      const candidates = await listCandidateMessages(
        connection,
        connection.watched_label_id,
        connection.processed_label_id
      );
      if (candidates.length === 0) continue;

      const { data: clientsData } = await supabase
        .from("clients")
        .select(
          "id, name, contact_email, billing_address, default_currency, default_gst_rate, display_currency_preference, ai_instructions"
        )
        .eq("owner_id", connection.owner_id);
      const clients = (clientsData || []) as ClientForMatching[];

      const result = await processGmailMessagesForConnection(
        connection,
        clients,
        candidates.map((c) => c.id)
      );

      await supabase
        .from("gmail_connections")
        .update({ last_checked_at: new Date().toISOString() })
        .eq("owner_id", connection.owner_id);

      for (const created of result.createdQuotes) {
        const suggestedClient = created.suggested_client_id
          ? clients.find((c) => c.id === created.suggested_client_id)
          : null;
        try {
          await postQuoteSuggestion({
            quoteId: created.id,
            ownerId: connection.owner_id,
            senderEmail: created.sender_email,
            senderName: created.sender_name,
            suggestedClientId: created.suggested_client_id,
            suggestedClientName: suggestedClient?.name ?? null,
            matchSource: created.suggested_client_source,
            allClients: clients.map((c) => ({ id: c.id, name: c.name })),
          });
        } catch (e) {
          // Don't let a Slack outage undo the (already-successful) extraction
          // — the item is still in unmatched_email_quotes, just without a
          // Slack ping this time.
          result.errors.push(
            `Slack notification failed for ${created.sender_email}: ${
              e instanceof Error ? e.message : "unknown error"
            }`
          );
        }
      }

      summary.push({
        owner_id: connection.owner_id,
        processed: result.processed,
        suggested: result.suggested,
        unmatched: result.unmatched,
        failed: result.failed,
      });
    } catch (e) {
      summary.push({
        owner_id: connection.owner_id,
        processed: 0,
        suggested: 0,
        unmatched: 0,
        failed: 1,
      });
    }
  }

  return NextResponse.json({ summary });
}

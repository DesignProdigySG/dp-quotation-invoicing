"use server";

import { google } from "googleapis";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getOAuthClient } from "@/lib/google/oauthClient";
import { decrypt } from "@/lib/crypto";
import { pollGmailConnection, type PollResult } from "@/lib/email-quote/pollGmailConnection";

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

export async function saveWatchedLabel(labelId: string, labelName: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("gmail_connections")
    .update({
      watched_label_id: labelId,
      watched_label_name: labelName,
      updated_at: new Date().toISOString(),
    })
    .eq("owner_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function disconnectGmail() {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("gmail_connections").delete().eq("owner_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

const emptyResult = (message: string): PollResult => ({
  processed: 0,
  matched: 0,
  unmatched: 0,
  failed: 0,
  errors: [message],
});

// Never throws — a thrown error crossing the Server Action boundary gets
// redacted to a generic "Server Components render" message in production, so
// failures are always returned as data instead, where the real message
// reaches the client intact.
export async function checkGmailNow(): Promise<PollResult> {
  try {
    const { user } = await requireUser();
    const service = createServiceClient();
    const { data: connection, error } = await service
      .from("gmail_connections")
      .select("*")
      .eq("owner_id", user.id)
      .single();
    if (error || !connection) return emptyResult("Gmail is not connected");
    if (!connection.watched_label_id) return emptyResult("Choose a label to watch first");

    const result = await pollGmailConnection(connection);
    revalidatePath("/settings");
    return result;
  } catch (e) {
    return emptyResult(e instanceof Error ? e.message : "Unknown error");
  }
}

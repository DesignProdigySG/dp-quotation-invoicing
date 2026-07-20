"use server";

import { google } from "googleapis";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getOAuthClient } from "@/lib/google/oauthClient";
import { decrypt } from "@/lib/crypto";
import { pollGmailConnection } from "@/lib/email-quote/pollGmailConnection";

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

export async function checkGmailNow() {
  const { user } = await requireUser();
  const service = createServiceClient();
  const { data: connection, error } = await service
    .from("gmail_connections")
    .select("*")
    .eq("owner_id", user.id)
    .single();
  if (error || !connection) throw new Error("Gmail is not connected");
  if (!connection.watched_label_id) throw new Error("Choose a label to watch first");

  const result = await pollGmailConnection(connection);
  revalidatePath("/settings");
  return result;
}

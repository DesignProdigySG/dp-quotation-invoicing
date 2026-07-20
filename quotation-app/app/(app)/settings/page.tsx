import { createClient } from "@/lib/supabase/server";
import { listGmailLabels } from "./actions";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail_connected?: string; gmail_error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: connection } = await supabase
    .from("gmail_connections")
    .select("email, watched_label_id, watched_label_name, last_checked_at")
    .eq("owner_id", user!.id)
    .maybeSingle();

  let labels: { id: string; name: string }[] = [];
  let labelsError: string | null = null;
  if (connection && !connection.watched_label_id) {
    try {
      labels = await listGmailLabels();
    } catch (e) {
      labelsError = e instanceof Error ? e.message : "Could not load Gmail labels";
    }
  }

  return (
    <div className="card">
      <h1>Settings</h1>
      <p className="subtitle">
        Connect your Gmail inbox to auto-draft quotations from incoming quote-request
        emails.
      </p>
      <SettingsClient
        connection={connection}
        labels={labels}
        labelsError={labelsError}
        connectedNotice={params.gmail_connected === "1"}
        errorNotice={params.gmail_error || null}
      />
    </div>
  );
}

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { pollGmailConnection } from "@/lib/email-quote/pollGmailConnection";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!expected || authHeader !== `Bearer ${expected}`) {
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

  const results = [];
  for (const connection of connections || []) {
    try {
      const result = await pollGmailConnection(connection);
      results.push({ owner_id: connection.owner_id, ...result });
    } catch (e) {
      results.push({
        owner_id: connection.owner_id,
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ results });
}

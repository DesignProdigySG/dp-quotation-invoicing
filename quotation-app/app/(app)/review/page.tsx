import { createClient } from "@/lib/supabase/server";
import ReviewQueue from "./ReviewQueue";

export default async function ReviewPage() {
  const supabase = await createClient();

  const [{ data: pending }, { data: clients }] = await Promise.all([
    supabase
      .from("unmatched_email_quotes")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("clients")
      .select("id, name, default_currency, default_gst_rate")
      .order("name"),
  ]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Needs review</h1>
          <p className="subtitle">
            Emails our AI parsed but couldn&apos;t match to an existing client.
          </p>
        </div>
      </div>
      <ReviewQueue items={pending || []} clients={clients || []} />
    </>
  );
}

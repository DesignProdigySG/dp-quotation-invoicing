import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/types/database.types";

export async function insertUnmatchedPo(input: {
  owner_id: string;
  sender_email: string;
  sender_name?: string | null;
  subject?: string | null;
  parsed_data: Json;
  suggested_client_id?: string | null;
  suggested_client_source?: string | null;
  suggested_invoice_id?: string | null;
}) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("unmatched_email_pos").insert({
    owner_id: input.owner_id,
    sender_email: input.sender_email,
    sender_name: input.sender_name ?? null,
    subject: input.subject ?? null,
    parsed_data: input.parsed_data,
    suggested_client_id: input.suggested_client_id ?? null,
    suggested_client_source: input.suggested_client_source ?? null,
    suggested_invoice_id: input.suggested_invoice_id ?? null,
  });

  if (error) throw new Error(error.message);
}

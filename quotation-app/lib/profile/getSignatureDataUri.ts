import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export async function getSignatureDataUri(
  supabase: SupabaseClient<Database>,
  signaturePath: string | null
): Promise<string | null> {
  if (!signaturePath) return null;

  const { data, error } = await supabase.storage
    .from("signatures")
    .createSignedUrl(signaturePath, 60);
  if (error || !data?.signedUrl) return null;

  const res = await fetch(data.signedUrl);
  if (!res.ok) return null;

  const contentType = res.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

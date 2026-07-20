import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// Bypasses RLS — only use in trusted server contexts (e.g. webhook routes
// gated by a shared secret), never expose to the browser.
export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

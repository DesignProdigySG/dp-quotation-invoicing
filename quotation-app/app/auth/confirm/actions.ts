"use server";

import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function confirmAuthLink(formData: FormData) {
  const token_hash = String(formData.get("token_hash") || "");
  const type = formData.get("type") as EmailOtpType | null;
  const next =
    String(formData.get("next") || "") || (type === "recovery" ? "/reset-password" : "/board");

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      redirect(next);
    }
  }

  redirect(
    `/login?error=${encodeURIComponent("That confirmation link is invalid or has expired.")}`
  );
}

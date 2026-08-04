"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requestPasswordReset(formData: FormData) {
  const supabase = await createClient();

  const email = String(formData.get("email") || "");

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.APP_URL}/reset-password`,
  });

  redirect(
    `/forgot-password?message=${encodeURIComponent(
      "If an account exists for that email, a reset link has been sent."
    )}`
  );
}

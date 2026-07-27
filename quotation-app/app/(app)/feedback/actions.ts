"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 6;

export async function submitFeedback(formData: FormData): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    const message = String(formData.get("message") || "").trim();
    if (!message) return { error: "Please enter a message" };

    const pagePath = formData.get("page_path");

    const files = formData
      .getAll("images")
      .filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length > MAX_IMAGES) {
      return { error: `Please attach at most ${MAX_IMAGES} images` };
    }
    for (const file of files) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        return { error: `${file.name} isn't a supported image type` };
      }
      if (file.size > MAX_IMAGE_BYTES) {
        return { error: `${file.name} is over the 5MB limit` };
      }
    }

    const imagePaths: string[] = [];
    for (const file of files) {
      const path = `${user.id}/${randomUUID()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("feedback-images")
        .upload(path, file, { contentType: file.type });
      if (uploadError) return { error: uploadError.message };
      imagePaths.push(path);
    }

    const { error } = await supabase.from("feedback").insert({
      owner_id: user.id,
      submitted_by_email: user.email ?? "",
      message,
      page_path: typeof pagePath === "string" ? pagePath : null,
      image_paths: imagePaths,
    });
    if (error) return { error: error.message };

    revalidatePath("/feedback");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}

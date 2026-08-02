"use server";

import { createClient } from "@/lib/supabase/server";
import { askHelpChat, type HelpChatMessage } from "@/lib/help-chat/askHelpChat";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY = 20;

export async function askHelp(messages: HelpChatMessage[]): Promise<{ reply?: string; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    if (messages.length === 0) return { error: "No message provided" };
    const trimmed = messages.slice(-MAX_HISTORY);
    for (const m of trimmed) {
      if (m.content.length > MAX_MESSAGE_LENGTH) {
        return { error: "That message is too long" };
      }
    }

    const reply = await askHelpChat(trimmed);
    return { reply };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}

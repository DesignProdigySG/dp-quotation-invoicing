import Anthropic from "@anthropic-ai/sdk";
import type { AttachmentContentBlock } from "./gmailAttachments";

export type ExtractedQuoteRequest = {
  client_name?: string;
  client_email: string;
  items: { description: string; quantity: number }[];
  notes?: string;
};

const SYSTEM_PROMPT = `You extract structured quote-request data from an email and any attached images or PDFs. The email body and/or its attachments may contain ONE OR MORE separate, distinct quote requests — e.g. several unrelated screenshots each describing a different job, or a single request spanning just the email body. Identify every distinct quote request present and reply with ONLY a single JSON object matching this exact schema, no markdown fences, no commentary: { "quotes": [ { "client_name"?: string, "client_email": string, "items": [{ "description": string, "quantity": number }], "notes"?: string } ] }. If client name isn't stated for a given quote, omit client_name. If quantity isn't stated, default to 1. If there is truly only one quote request, return an array with exactly one entry — never merge unrelated requests into one.`;

// Attachments push accuracy needs up (reading a screenshot/PDF is harder than
// plain text) enough to justify the switch from Haiku to Sonnet for this
// call specifically — text-only emails keep using the cheaper model.
const TEXT_ONLY_MODEL = "claude-haiku-4-5-20251001";
const VISION_MODEL = "claude-sonnet-5";

export async function extractQuoteFromEmail(params: {
  subject: string;
  from: string;
  body: string;
  attachments?: AttachmentContentBlock[];
}): Promise<ExtractedQuoteRequest[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const anthropic = new Anthropic({ apiKey });
  const hasAttachments = (params.attachments?.length ?? 0) > 0;

  const message = await anthropic.messages.create({
    model: hasAttachments ? VISION_MODEL : TEXT_ONLY_MODEL,
    max_tokens: 2048,
    // claude-sonnet-5 rejects an explicit `temperature` override ("deprecated
    // for this model") — only set it for the Haiku path.
    ...(hasAttachments ? {} : { temperature: 0 }),
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text" as const,
            text: `Subject: ${params.subject}\nFrom: ${params.from}\n\nBody:\n${params.body}`,
          },
          ...(params.attachments ?? []),
        ],
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return [];
  }

  const raw = textBlock.text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  try {
    const parsed = JSON.parse(raw) as { quotes?: ExtractedQuoteRequest[] };
    return Array.isArray(parsed.quotes) ? parsed.quotes : [];
  } catch {
    return [];
  }
}

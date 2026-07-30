import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedQuoteRequest } from "./extractQuoteFromEmail";
import type { ClientForMatching } from "./matchClient";
import type { AttachmentContentBlock } from "./gmailAttachments";

const BASE_SYSTEM_PROMPT = `You extract structured quote-request data from an email and any attached images or PDFs. The email body and/or its attachments may contain ONE OR MORE separate, distinct quote requests — e.g. several unrelated screenshots each describing a different job, or a single request spanning just the email body. Identify every distinct quote request present and reply with ONLY a single JSON object matching this exact schema, no markdown fences, no commentary: { "quotes": [ { "client_name"?: string, "client_email": string, "items": [{ "description": string, "quantity": number }], "notes"?: string } ] }. If client name isn't stated for a given quote, omit client_name. If quantity isn't stated, default to 1. If there is truly only one quote request, return an array with exactly one entry — never merge unrelated requests into one.`;

export async function extractQuoteWithClientContext(params: {
  subject: string;
  from: string;
  body: string;
  client: ClientForMatching;
  attachments?: AttachmentContentBlock[];
}): Promise<ExtractedQuoteRequest[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const anthropic = new Anthropic({ apiKey });

  const clientContext = `\n\nThis email has been matched to an existing client: ${params.client.name}${
    params.client.billing_address ? ` (billing address: ${params.client.billing_address})` : ""
  }.${
    params.client.ai_instructions
      ? `\n\nClient-specific notes for reading this client's emails:\n${params.client.ai_instructions}`
      : ""
  }`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    // claude-sonnet-5 rejects an explicit `temperature` override ("deprecated for
    // this model") — omit it and use the model's default.
    system: BASE_SYSTEM_PROMPT + clientContext,
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

  const textBlock = message.content.find((b) => b.type === "text");
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

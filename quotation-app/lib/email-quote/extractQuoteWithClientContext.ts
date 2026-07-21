import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedQuoteRequest } from "./extractQuoteFromEmail";
import type { ClientForMatching } from "./matchClient";

const BASE_SYSTEM_PROMPT = `You extract structured quote-request data from emails. Reply with ONLY a single JSON object matching this exact schema, no markdown fences, no commentary: { "client_name"?: string, "client_email": string, "items": [{ "description": string, "quantity": number }], "notes"?: string }. If client name isn't stated, omit client_name. If quantity isn't stated, default to 1.`;

export async function extractQuoteWithClientContext(params: {
  subject: string;
  from: string;
  body: string;
  client: ClientForMatching;
}): Promise<ExtractedQuoteRequest> {
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
    max_tokens: 1024,
    temperature: 0,
    system: BASE_SYSTEM_PROMPT + clientContext,
    messages: [
      {
        role: "user",
        content: `Subject: ${params.subject}\nFrom: ${params.from}\n\nBody:\n${params.body}`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic response had no text content");
  }

  const raw = textBlock.text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  return JSON.parse(raw) as ExtractedQuoteRequest;
}

import Anthropic from "@anthropic-ai/sdk";

export type ExtractedQuoteRequest = {
  client_name?: string;
  client_email: string;
  items: { description: string; quantity: number }[];
  notes?: string;
};

const SYSTEM_PROMPT = `You extract structured quote-request data from emails. Reply with ONLY a single JSON object matching this exact schema, no markdown fences, no commentary: { "client_name"?: string, "client_email": string, "items": [{ "description": string, "quantity": number }], "notes"?: string }. If client name isn't stated, omit client_name. If quantity isn't stated, default to 1.`;

export async function extractQuoteFromEmail(params: {
  subject: string;
  from: string;
  body: string;
}): Promise<ExtractedQuoteRequest> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const anthropic = new Anthropic({ apiKey });
  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Subject: ${params.subject}\nFrom: ${params.from}\n\nBody:\n${params.body}`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
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

import Anthropic from "@anthropic-ai/sdk";

export type ExtractedPo = {
  client_name?: string;
  po_number?: string;
  referenced_invoice_number?: string;
  amount?: number;
  notes?: string;
};

const SYSTEM_PROMPT = `You extract structured purchase-order data from emails. Reply with ONLY a single JSON object matching this exact schema, no markdown fences, no commentary: { "client_name"?: string, "po_number"?: string, "referenced_invoice_number"?: string, "amount"?: number, "notes"?: string }. po_number is the purchase order's own number/reference, if stated. referenced_invoice_number is any invoice number or reference the email mentions this PO relates to, if stated. amount is the stated total amount as a plain number (no currency symbol), if stated. Omit any field that isn't clearly stated in the email rather than guessing.`;

export async function extractPoFromEmail(params: {
  subject: string;
  from: string;
  body: string;
}): Promise<ExtractedPo> {
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

  return JSON.parse(raw) as ExtractedPo;
}

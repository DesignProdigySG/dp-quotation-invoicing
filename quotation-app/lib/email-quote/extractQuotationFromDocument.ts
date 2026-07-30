import Anthropic from "@anthropic-ai/sdk";
import type { AttachmentContentBlock } from "./gmailAttachments";

// Unlike ExtractedQuoteRequest (an incoming quote REQUEST — items with no
// prices yet), this is an already-priced quotation document built outside
// the app, being imported in — the shape mirrors quotations +
// quotation_line_items much more closely.
export type ExtractedQuotationDocument = {
  client_name?: string;
  currency?: string;
  gst_rate?: number;
  gst_applicable?: boolean;
  quote_date?: string;
  valid_until?: string;
  line_items: { description: string; quantity: number; unit_price: number }[];
  notes?: string;
};

const SYSTEM_PROMPT = `You extract structured data from a quotation document (an image or PDF) that was built OUTSIDE this system, so its details can be imported here. Unlike a quote request, this document already has prices. Reply with ONLY a single JSON object matching this exact schema, no markdown fences, no commentary: { "client_name"?: string, "currency"?: string (ISO 4217 code, e.g. "SGD", "USD"), "gst_rate"?: number (percentage, e.g. 9 for 9%), "gst_applicable"?: boolean, "quote_date"?: string ("YYYY-MM-DD"), "valid_until"?: string ("YYYY-MM-DD"), "line_items": [{ "description": string, "quantity": number, "unit_price": number }], "notes"?: string }. Quantities and unit prices must be plain numbers, no currency symbols or thousands separators. If GST/tax isn't mentioned anywhere on the document, omit gst_rate and set gst_applicable to false. Omit any other field that isn't visible on the document rather than guessing.`;

export async function extractQuotationFromDocument(
  attachment: AttachmentContentBlock
): Promise<ExtractedQuotationDocument | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const anthropic = new Anthropic({ apiKey });
  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    // claude-sonnet-5 rejects an explicit `temperature` override.
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "text" as const, text: "Extract this quotation document." },
          attachment,
        ],
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;

  const raw = textBlock.text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  try {
    const parsed = JSON.parse(raw) as ExtractedQuotationDocument;
    return Array.isArray(parsed.line_items) ? parsed : null;
  } catch {
    return null;
  }
}

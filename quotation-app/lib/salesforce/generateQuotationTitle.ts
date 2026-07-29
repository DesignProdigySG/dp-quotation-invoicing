import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You write a short, indicative title summarizing what a quotation is for, based on its line items and notes. Reply with ONLY a single JSON object: { "title": string }. The title should be 2-5 words, e.g. "Website Redesign" or "Q4 Marketing Campaign" — no punctuation beyond spaces, no client name (that's added separately).`;

// Used as a fallback gist for the Salesforce Opportunity name when a
// quotation has no manually-set title. Modeled directly on
// lib/email-quote/fuzzyMatchClient.ts's pattern — cheap/fast model, small
// max_tokens, same strip-fences-then-JSON.parse parsing.
export async function generateQuotationTitle(
  lineItems: { description: string }[],
  notes?: string | null
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const anthropic = new Anthropic({ apiKey });

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Line items:\n${lineItems.map((li) => `- ${li.description}`).join("\n")}${
          notes ? `\n\nNotes:\n${notes}` : ""
        }`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic response had no text content");
  }

  const raw = textBlock.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(raw) as { title?: string };
  if (!parsed.title) throw new Error("Anthropic response had no title");
  return parsed.title;
}

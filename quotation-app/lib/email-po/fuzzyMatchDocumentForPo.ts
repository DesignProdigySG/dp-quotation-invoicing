import Anthropic from "@anthropic-ai/sdk";

export type DocumentCandidate = {
  type: "quotation" | "invoice";
  id: string;
  number: string | null;
  currency: string;
  total: number;
  date: string;
  descriptions: string[];
};

const SYSTEM_PROMPT = `You are matching a client's Purchase Order (PO) to the most likely quotation or invoice it corresponds to, from a provided list belonging to that same client. A PO is triggered by a quotation we sent the client — it typically does NOT reference our quotation or invoice numbers, so match primarily by how closely the PO's stated amount matches a candidate's total, and how well the PO's description of goods/services matches a candidate's line-item descriptions. Reply with ONLY a single JSON object: { "type": "quotation" | "invoice" | null, "id": string | null }. If you pick a candidate, its type and id must be copied EXACTLY from the provided list. If no candidate is a plausible match, or you are not reasonably confident, return { "type": null, "id": null } — this is expected and preferred over a low-confidence guess.`;

export async function fuzzyMatchDocumentForPo(params: {
  description?: string;
  amount?: number;
  candidates: DocumentCandidate[];
}): Promise<{ type: "quotation" | "invoice"; id: string } | null> {
  if (params.candidates.length === 0) return null;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const anthropic = new Anthropic({ apiKey });

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `PO description: ${params.description || "(not stated)"}\nPO amount: ${
          params.amount ?? "(not stated)"
        }\n\nCandidates:\n${JSON.stringify(params.candidates)}`,
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
    const parsed = JSON.parse(raw) as { type?: string | null; id?: string | null };
    if (!parsed.type || !parsed.id) return null;
    const match = params.candidates.find(
      (c) => c.type === parsed.type && c.id === parsed.id
    );
    return match ? { type: match.type, id: match.id } : null;
  } catch {
    return null;
  }
}

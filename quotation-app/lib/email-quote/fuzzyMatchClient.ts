import Anthropic from "@anthropic-ai/sdk";
import type { ClientForMatching } from "./matchClient";

const SYSTEM_PROMPT = `You are matching an inbound quote-request email to the most likely existing client from a provided list, using signals OTHER than an exact email address match (which has already been tried and failed) — e.g. a company name mentioned in the email body or signature, the sender's domain loosely resembling the client's known domain, phrasing that references a known project or relationship. Reply with ONLY a single JSON object: { "client_id": string | null }. If you use a client_id, it must be copied EXACTLY from the provided list. If no client is a plausible match, or you are not reasonably confident, return null — a null response is expected and preferred over a low-confidence guess.`;

export async function fuzzyMatchClient(params: {
  subject: string;
  from: string;
  body: string;
  clients: ClientForMatching[];
}): Promise<{ client_id: string | null }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const anthropic = new Anthropic({ apiKey });

  const clientList = params.clients.map((c) => ({
    id: c.id,
    name: c.name,
    contact_email: c.contact_email,
    billing_address: c.billing_address,
  }));

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Known clients:\n${JSON.stringify(clientList)}\n\nSubject: ${params.subject}\nFrom: ${params.from}\n\nBody:\n${params.body}`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return { client_id: null };

  const raw = textBlock.text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  try {
    const parsed = JSON.parse(raw) as { client_id?: string | null };
    const validIds = new Set(params.clients.map((c) => c.id));
    return {
      client_id: parsed.client_id && validIds.has(parsed.client_id) ? parsed.client_id : null,
    };
  } catch {
    return { client_id: null };
  }
}

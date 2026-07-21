export type ClientForMatching = {
  id: string;
  name: string;
  contact_email: string | null;
  billing_address: string | null;
  default_currency: string;
  default_gst_rate: number;
  display_currency_preference: string;
  ai_instructions: string | null;
};

export type ClientMatch = {
  client: ClientForMatching;
  source: "exact_email" | "email_domain";
};

// Common free/consumer email providers — domain-fallback matching is skipped for
// these, since two unrelated clients could easily share the same free-mail domain.
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "mail.com",
  "gmx.com",
  "yandex.com",
  "zoho.com",
]);

function emailDomain(email: string): string | null {
  const parts = email.trim().toLowerCase().split("@");
  return parts.length === 2 && parts[1] ? parts[1] : null;
}

// Tier 1: deterministic matching over an already-fetched client list — exact
// contact_email match first, falling back to a same-domain match only when it
// resolves to exactly one client (and the domain isn't a free provider).
export function findClientByEmail(
  clients: ClientForMatching[],
  contactEmail: string
): ClientMatch | null {
  const normalized = contactEmail.trim().toLowerCase();

  const exact = clients.find(
    (c) => c.contact_email && c.contact_email.trim().toLowerCase() === normalized
  );
  if (exact) return { client: exact, source: "exact_email" };

  const domain = emailDomain(normalized);
  if (!domain || FREE_EMAIL_DOMAINS.has(domain)) return null;

  const domainMatches = clients.filter(
    (c) => c.contact_email && emailDomain(c.contact_email) === domain
  );
  if (domainMatches.length === 1) {
    return { client: domainMatches[0], source: "email_domain" };
  }
  return null; // zero or ambiguous (multiple) domain matches — don't guess
}

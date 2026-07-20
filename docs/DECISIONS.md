# Decisions log

Durable record of scoping/architecture decisions made for this app, so future work
doesn't have to re-derive the reasoning from chat history.

## Decision 1: Feature wishlist — Phase 1 vs Phase 2

A wishlist of possible app changes was brought up, split into "Must Haves / Really
Nice to Have / Nice to have". After triage, scope was split:

**Phase 1 (built and shipped):**
1. Bill-to address on clients, shown on PDF
2. Real GST on/off toggle (`gst_applicable`), independent of currency
3. Surface `created_at` ("Created") on quotation/invoice detail pages
4. Optional invoice `reference` field with a dismissible "no reference set" warning
5. Foreign-currency support: manual exchange-rate field (foreign→SGD) on quotations/
   invoices, per-client default for original-vs-SGD display, GST/grand total always
   shown in both currencies when non-SGD (SG GST compliance), GST toggle takes
   precedence over dual-display (no GST line at all when off)

**Phase 2 (explicitly deferred, not started):**
- Salesforce-generated quote numbers with PDF-download gating
- Xero invoice push + status tracking
- Editable docx export
- Multi-quote-per-email splitting
- User profiles (name/title on quotes)
- Admin cross-user visibility
- Nicer PDF template (blocked on a design asset)

Currency itself stays free-text (no dropdown) — explicitly declined.

## Decision 2: Email-to-quote pipeline — in-app Gmail OAuth instead of n8n

Originally the plan was to build the Gmail-watching + AI-extraction pipeline in n8n,
since n8n makes OAuth setup easy for a single connected inbox. That work got as far
as a full node-by-node n8n design before the requirement was clarified: **any dp.sg
user should be able to self-serve connect their own Gmail inbox from within the
app**, not have an admin manually wire up one n8n workflow per person.

n8n's Gmail credential has to be created by whoever has n8n UI access going through
n8n's own OAuth flow — that doesn't scale to "any of N salespeople opts in
themselves" without giving everyone an n8n login, which defeats the point. So the
decision is to **drop n8n for this feature** and build the Gmail OAuth connector and
inbox-watching logic directly in the Next.js app instead:
- A "Connect Gmail" button (Settings page) drives Google's OAuth flow per-user,
  storing an encrypted refresh token tied to that user's `owner_id`.
- A scheduled job (Vercel Cron, daily on the Hobby plan) plus a manual "Check now"
  button poll each connected user's inbox and run the same extract → match →
  draft-or-review logic already built for the n8n webhook design
  (`app/api/quotes/from-email/route.ts`), reused directly rather than duplicated.
- Claude extraction is called directly via the Anthropic API from app code instead
  of via n8n's Anthropic node.

Everything already built for the pipeline (the webhook route's create-quote logic,
the review queue UI, the `unmatched_email_quotes` table) carries over unchanged —
only the "what triggers this and how is Gmail connected" layer changes.

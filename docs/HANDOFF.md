# Handoff

## Repo & branch
- Repo: DesignProdigySG/dp-quotation-invoicing
- Always branch fresh off `main` for new work — `main` is current and complete
  as of this writing (everything merged, no stray unmerged commits sitting on
  some other named branch). Do NOT hardcode a specific working branch name in
  this doc going forward — a previous version of this file did exactly that
  (`claude/vercel-issues-v5a888`), that branch kept receiving commits after
  its PR merged, and those commits sat unmerged and undiscovered for a while
  because nothing pointed at them. Named branches get merged and deleted;
  this doc should not reference one as if it were permanent.
- App code lives in the `quotation-app/` subdirectory (Vercel Root Directory is set
  to this — don't confuse it with the unused duplicate `database.types.ts` at repo
  root)
- Supabase project id: `gkkwxjxdcifjuwxgdpug`

## Stack
Next.js 14 App Router, Supabase (Postgres + Auth + RLS + Storage), Vercel (Hobby
plan). `@react-pdf/renderer` for PDFs. `googleapis` + `@anthropic-ai/sdk` for the
Gmail ingestion pipeline (in-app — not n8n, not a separate repo, despite what
schema alone might suggest).

## Read this first
`docs/DECISIONS.md` — durable, git-tracked log of every major scoping/architecture
decision made on this project. Read it before touching anything. Keep appending to
it going forward. Do NOT rely on a Claude Code plan-mode plan file for continuity —
that lives outside git on whichever machine ran that session and is invisible to any
other session or agent.

## Feature map
- Core app: clients/quotes/invoices CRUD, status board, PDF generation —
  `app/(app)/{clients,quotes,invoices,board}/`, `lib/pdf/DocumentPdf.tsx`
- Client billing addresses: `client_billing_addresses` table, selectable per
  quote/invoice/review-item (client default / named entity / custom), snapshotted
  onto the document
- Gmail ingestion pipeline:
  - Connect: `app/api/auth/gmail/{start,callback}/route.ts`, `app/(app)/settings/`
  - "Check now": a modal-based review-first flow
    (`app/(app)/settings/CheckNowModal.tsx` + `actions.ts`) — no cron, nothing
    auto-drafts
  - 3-tier matching: `lib/email-quote/matchClient.ts` (exact email → same-domain
    fallback, with a free-mail-provider guard), `fuzzyMatchClient.ts` (AI, tier 2),
    `extractQuoteWithClientContext.ts` (tailored extraction using the matched
    client's `ai_instructions`, tier 3 — this field IS wired up, see
    `ClientForm.tsx`)
  - Every result lands in `unmatched_email_quotes` for a human to confirm — reviewed
    via `app/(app)/review/` (`ReviewQueue.tsx`/`page.tsx`/`actions.ts`), which
    pre-fills a suggested client + match-source label
- User profiles + signature: `profiles` table (`full_name`, `title`,
  `signature_path`), editable at `app/(app)/settings/ProfileForm.tsx` +
  `actions.ts` (`saveProfile`/`uploadSignature`/`removeSignature`). Signature
  image lives in a private Supabase Storage bucket (`signatures`, one fixed key
  per user), embedded into PDFs as a base64 data URI via
  `lib/profile/getSignatureDataUri.ts`.
- CJK font support in PDFs: `lib/pdf/fonts.ts`'s `fontFor(text)` picks
  Montserrat (brand default) / NotoSansJP / NotoSansKR per text field based on
  the Unicode ranges present in it, so Japanese/Korean content (client names,
  addresses, etc.) doesn't render as gibberish under a Latin-only font. The
  JP/KR fonts are deliberately subsetted to a curated common-use character set
  (not the full repertoire) for a real, benchmarked render-time reason — see
  `docs/DECISIONS.md` Decision 3 before touching this, don't re-derive or
  "simplify away" the subsetting.
- Branded quotation/invoice PDF template (`lib/pdf/DocumentPdf.tsx`): real
  Design Prodigy branding sourced directly from the user, not invented —
  company info/Payment Terms/Terms & Conditions live in `lib/pdf/brand.ts`,
  the logo is a real checked-in file at `lib/pdf/assets/logo.png` (loaded via
  `lib/pdf/logo.ts`). Quotations get a two-column company-info/bill-to meta
  block, a Payment Terms/T&C section, and a "Quote accepted by / Quote
  prepared by" signature block; invoices deliberately stay simpler (single
  "Prepared by" line, no client-acceptance section) since invoices are headed
  to Xero (see "What's next" below). New `quotations.valid_until` date field
  (defaults to quote date + 20 days at creation, matching the T&C's stated
  validity window). Full reasoning, including several rounds of visual
  feedback (column widths, date formatting, page-break behavior), in
  `docs/DECISIONS.md` Decision 4.

## Env vars (Vercel, Production + Preview)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`
- `GMAIL_TOKEN_ENCRYPTION_KEY` (AES-256-GCM key for refresh tokens, `lib/crypto.ts`)
- `ANTHROPIC_API_KEY`
- `EMAIL_QUOTE_WEBHOOK_SECRET`, `CRON_SECRET` — both vestigial (the n8n webhook and
  the cron job were superseded by the in-app pipeline above); harmless to leave, fine
  to remove later

## What's next (confirmed priorities, in order)

**1. Xero invoice push.** Confirmed directly with the user: invoices are
meant to be generated in Xero going forward, not just downloaded as an in-app
PDF. This would map quotation/invoice line items, client/contact info, and
tax treatment onto Xero's API and let the in-app invoice PDF become a fallback
rather than the primary deliverable. Not yet scoped — needs a Xero developer
app + OAuth credentials from the user before any code can be written. Expect
real complexity in field mapping (tax codes, contact matching, currency)
that's easy to underestimate.

**2. Salesforce-generated quote numbers with PDF-download gating.** Next
priority after Xero. Also not yet scoped. The original reference material for
this project's docx-based quotation generator used a `{{SalesforceQuoteNo}}`
placeholder, suggesting the intent is for Salesforce to be the source of
truth for quote numbers rather than the freeform text field this app
currently has.

**Still on the shelf, not reprioritized:**
- **Editable docx export.** Self-contained, no external integration. Use the
  `docx` npm package, mirroring `app/api/quotes/[id]/pdf/route.ts`'s
  data-fetching pattern with a new `app/api/quotes/[id]/docx/route.ts`.
  Recommend scoping v1 to the common case (line items + totals + bill-to
  address, GST on/off) and punting on foreign-currency dual-display
  formatting until requested — that logic is intricate (see
  `DocumentPdf.tsx`) and isn't worth replicating exactly until someone needs
  an editable non-SGD document.
- Multi-quote-per-email splitting.
- Admin cross-user visibility.

All four of the above are real Phase 2 work but meaningfully bigger than a
single-session task — external integrations, schema-shape changes, or an
RLS/security-model change — and should be scoped individually when picked up.

## Avoiding the mix-up that just happened
Before drawing conclusions from Supabase data alone, confirm you actually have this
repo (not just DB access) checked out at this branch — the schema won't tell you
where the code that writes to it lives.

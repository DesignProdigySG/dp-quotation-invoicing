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
- Xero invoice push (v1): a **single shared** Xero connection (`xero_connections`,
  a genuine singleton — always `id=1`), connected/configured at
  `app/(app)/settings/XeroSettings.tsx` + `actions.ts`
  (`listXeroTaxRates`/`listXeroAccounts`/`saveXeroConfig`/`disconnectXero`).
  OAuth flow at `app/api/auth/xero/{start,callback}/route.ts` (mirrors the
  Gmail pattern). Push logic lives in `lib/xero/` (`client.ts` for the
  token-refresh-and-persist path, `contacts.ts` for Contact matching/caching,
  `buildInvoicePayload.ts` — a pure, unit-tested function — for the actual
  payload), triggered via `pushInvoiceToXero()` in
  `app/(app)/invoices/actions.ts` and a "Push to Xero" button in
  `InvoiceActions.tsx`. **v1 is SGD-only, DRAFT-only, one-way** (no pulling
  payment status back from Xero) — read `docs/DECISIONS.md` Decision 5 in
  full before touching this, especially the refresh-token-rotation handling
  and the gst_rate-vs-Xero-tax-rate validation; both are easy to accidentally
  break in a way that either silently desyncs the connection after ~60 days
  or pushes a wrong tax amount into the user's real accounting system.

## Env vars (Vercel, Production + Preview)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`
- `GMAIL_TOKEN_ENCRYPTION_KEY` (AES-256-GCM key for refresh tokens, `lib/crypto.ts`)
- `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`,
  `XERO_TOKEN_ENCRYPTION_KEY` (separate encryption key from Gmail's — same
  `lib/crypto.ts`, parameterized by env-var name)
- `ANTHROPIC_API_KEY`
- `EMAIL_QUOTE_WEBHOOK_SECRET`, `CRON_SECRET` — both vestigial (the n8n webhook and
  the cron job were superseded by the in-app pipeline above); harmless to leave, fine
  to remove later

## What's next (confirmed priorities, in order)

**1. Salesforce-generated quote numbers with PDF-download gating.** Confirmed
next priority (Xero invoice push, previously #1 here, shipped this session —
see Feature map above and `docs/DECISIONS.md` Decision 5). Not yet scoped. The
original reference material for this project's docx-based quotation generator
used a `{{SalesforceQuoteNo}}` placeholder, suggesting the intent is for
Salesforce to be the source of truth for quote numbers rather than the
freeform text field this app currently has.

**Fast-follows on the Xero v1 cuts, not yet prioritized:**
- Multi-currency Xero push (v1 is SGD-only — see Decision 5 for why).
- Two-way sync: pulling payment status back from Xero into this app's own
  `status` field (v1 is one-way/push-only).
- A "View in Xero" deep link on the invoice detail page (skipped in v1, no
  way to verify the URL format without a real connected org at the time).

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

All of the above are real Phase 2 work but meaningfully bigger than a
single-session task — external integrations, schema-shape changes, or an
RLS/security-model change — and should be scoped individually when picked up.

## Avoiding the mix-up that just happened
Before drawing conclusions from Supabase data alone, confirm you actually have this
repo (not just DB access) checked out at this branch — the schema won't tell you
where the code that writes to it lives.

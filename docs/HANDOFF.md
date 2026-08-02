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
  `InvoiceActions.tsx`. Supports multi-currency push (Decision 25) and pulls
  status back from Xero via "Refresh from Xero" (single invoice) and a bulk
  check (Decisions 6–7) — **still DRAFT-only**, no auto-authorise — read
  `docs/DECISIONS.md` Decision 5 in full before touching this, especially
  the refresh-token-rotation handling and the gst_rate-vs-Xero-tax-rate
  validation; both are easy to accidentally break in a way that either
  silently desyncs the connection after ~60 days or pushes a wrong tax
  amount into the user's real accounting system.

## Env vars (Vercel, Production + Preview)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`
- `GMAIL_TOKEN_ENCRYPTION_KEY` (AES-256-GCM key for refresh tokens, `lib/crypto.ts`)
- `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`,
  `XERO_TOKEN_ENCRYPTION_KEY` (separate encryption key from Gmail's — same
  `lib/crypto.ts`, parameterized by env-var name)
- `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET`, `SALESFORCE_REDIRECT_URI`,
  `SALESFORCE_TOKEN_ENCRYPTION_KEY` (same `lib/crypto.ts` pattern as Xero's),
  `SALESFORCE_LOGIN_URL` (optional, defaults to `https://login.salesforce.com`
  — set to `https://test.salesforce.com` for a sandbox org). OAuth connect
  (Decision 13) and quote push (Decision 14, both in `docs/DECISIONS.md`) are
  both built and merged to `main` — quotes push as an empty standard Quote
  under an open-stage Opportunity, which later flips to Closed Won once a PO
  is matched and the linked invoice is sent.
- `ANTHROPIC_API_KEY`
- `EMAIL_QUOTE_WEBHOOK_SECRET`, `CRON_SECRET` — both vestigial (the n8n webhook and
  the cron job were superseded by the in-app pipeline above); harmless to leave, fine
  to remove later

## Staging environment & migration workflow (planned, blocked on a Supabase plan upgrade)

Today there is **one** Supabase project (`gkkwxjxdcifjuwxgdpug`), used by both
Vercel Production and Preview deployments — every migration and every Preview
deployment hits the same live data. A separate staging project is planned so
Preview can be tested against without touching production. **Not yet done** —
the account behind this project's Supabase org has already used both of its
free-project slots (this project, plus a separate `Intelligence Automation
Pipeline` project under a different org, same account), so creating a
staging project requires upgrading `DP Daily Ops Org` (or another org) to
the Supabase Pro plan first — a billing action, not something any tool/agent
can do. Once that happens:

- **Setup**: create a second free-standing project in the same org (not
  Supabase's native Git-branching feature — that also needs Pro plus
  per-branch compute cost and a CLI migrations workflow this repo doesn't
  have yet; a plain second project synced by hand is simpler and cheaper for
  where this project is today). Reconstruct its schema to exactly match
  production — 13 tables (all RLS-enabled), 3 storage buckets
  (`external-quotes`, `feedback-images`, `signatures`, all private), 3
  trigger functions (`set_invoice_number`, `set_quote_number`,
  `set_updated_at`), 5 triggers, ~30 RLS policies — generated from
  production's own `pg_catalog` (`pg_get_constraintdef`/`pg_get_functiondef`/
  `pg_policies.qual`) rather than hand-retyped, so it's exact. Then start a
  `supabase/migrations/` directory (this repo has never had one — every
  migration to date went straight against production via
  `mcp__Supabase__apply_migration`, no git-tracked file) and split Vercel's
  `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/
  `SUPABASE_SERVICE_ROLE_KEY` so **Preview** points at staging and
  **Production** keeps pointing at the current project.

- **Ongoing workflow once it exists** — the discipline this whole approach
  depends on, since nothing enforces it automatically the way paid branching
  would:
  1. Write every schema change as a file under `supabase/migrations/`.
  2. Apply + test it on **staging** first (via `apply_migration` against
     the staging project, then exercise it through a Preview deployment).
  3. Once confirmed good, apply the **identical SQL** to **production**.
  4. To check how far behind prod is at any point, diff
     `mcp__Supabase__list_migrations` between the two project ids — that's
     the actual tracked history, not something to keep in memory.
  5. **Call out destructive migrations explicitly** before applying them to
     prod (`DROP COLUMN`/`DROP TABLE`, lossy type changes, anything that
     deletes data) — cheap preventive habit, distinct from and in addition
     to the rollback options below, not a substitute for them.

- **Rollback, if a migration breaks prod anyway**:
  - Additive changes (this project's history so far — adding nullable
    columns) roll back cheaply: just apply the reverse SQL
    (`DROP COLUMN`, etc.).
  - Destructive changes that actually lost data need a real restore. Once
    on Pro, Supabase takes **daily backups automatically, 7-day
    retention, no setup or extra cost** — restorable from the dashboard.
    This reverts the *entire* database to that snapshot (any real rows
    written since are lost too) and causes downtime while restoring, so
    it's a last resort, not a quick undo. Point-in-Time Recovery (an
    optional paid add-on, ~$100+/mo at the smallest retention tier) gives
    second-level recovery instead of once-daily if that gap is ever a real
    concern — not needed at this project's transaction volume today.
  - **Storage objects are not covered by database backups at all** — the
    DB only stores metadata about files (`storage.objects`), the actual
    bytes live in a separate S3-compatible layer. If those buckets'
    contents ever need backing up, Storage exposes its own S3-compatible
    endpoint (**Project Settings → Storage → S3 Configuration → Access
    keys**) that `rclone`/the AWS CLI can copy from
    (`https://<project-ref>.storage.supabase.co/storage/v1/s3`). Not worth
    automating yet given how little sits in those buckets (a signature per
    user, occasional uploaded documents) — a one-off `rclone copy` before
    anything genuinely risky is enough for now.

- **Known gap this approach doesn't close**: `gmail_connections`/
  `xero_connections`/`salesforce_connections` store live OAuth tokens as
  rows in the database, not as env vars — staging starts with none of them
  connected, so testing Gmail/Xero/Salesforce-integrated features on
  Preview will need reconnecting each one separately against staging.
  Storage bucket contents (signatures, uploaded quote files) also start
  empty on staging. Neither blocks testing core CRUD/business-logic
  features.

## What's next (confirmed priorities, in order)

**0. Staging Supabase project.** Blocked on the user upgrading a Supabase
org to Pro (see "Staging environment & migration workflow" above for the
full plan) — pick this up first once that's done.

**1. "View in Xero" deep link.** The last open Xero v1 fast-follow — a link
on the invoice detail page straight to the invoice in Xero once pushed
(skipped in v1, no way to verify the URL format without a real connected
org at the time; see Decision 5).

**Still on the shelf, not reprioritized:**
- **Editable docx export.** Self-contained, no external integration. Use the
  `docx` npm package, mirroring `app/api/quotes/[id]/pdf/route.ts`'s
  data-fetching pattern with a new `app/api/quotes/[id]/docx/route.ts`.
  Recommend scoping v1 to the common case (line items + totals + bill-to
  address, GST on/off) and punting on foreign-currency dual-display
  formatting until requested — that logic is intricate (see
  `DocumentPdf.tsx`) and isn't worth replicating exactly until someone needs
  an editable non-SGD document.
- Admin cross-user visibility.

Both are real Phase 2 work but meaningfully bigger than a single-session
task — a new document format, or an RLS/security-model change — and should
be scoped individually when picked up.

(Previously listed here as pending, now shipped — see `docs/DECISIONS.md`:
PDF-download gating on the Salesforce quote number (Decision 19),
multi-currency Xero push (Decision 25), two-way Xero status sync
(Decisions 6–7), and multi-quote-per-email splitting (Decision 21).)

## Avoiding the mix-up that just happened
Before drawing conclusions from Supabase data alone, confirm you actually have this
repo (not just DB access) checked out at this branch — the schema won't tell you
where the code that writes to it lives.

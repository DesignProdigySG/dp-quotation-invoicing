# Handoff

## Repo & branch
- Repo: DesignProdigySG/dp-quotation-invoicing
- Working branch: `claude/vercel-issues-v5a888`
- App code lives in the `quotation-app/` subdirectory (Vercel Root Directory is set
  to this — don't confuse it with the unused duplicate `database.types.ts` at repo
  root)
- Supabase project id: `gkkwxjxdcifjuwxgdpug`

## Stack
Next.js 14 App Router, Supabase (Postgres + Auth + RLS), Vercel (Hobby plan).
`@react-pdf/renderer` for PDFs. `googleapis` + `@anthropic-ai/sdk` for the Gmail
ingestion pipeline (in-app — not n8n, not a separate repo, despite what schema alone
might suggest).

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

## Env vars (Vercel, Production + Preview)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`
- `GMAIL_TOKEN_ENCRYPTION_KEY` (AES-256-GCM key for refresh tokens, `lib/crypto.ts`)
- `ANTHROPIC_API_KEY`
- `EMAIL_QUOTE_WEBHOOK_SECRET`, `CRON_SECRET` — both vestigial (the n8n webhook and
  the cron job were superseded by the in-app pipeline above); harmless to leave, fine
  to remove later

## Three ready-to-build Phase 2 tasks

**1. User profiles (name/title on quotes) — easiest pick.**
Add a small `profiles` table (or extend `auth.users` metadata) with `full_name`/
`title`, editable from a new Settings section, surfaced on the quote/invoice PDF
(e.g. a "Prepared by" line). Fully self-contained, no external integration, follows
the same additive-migration → form → PDF-prop pattern used throughout this project.

**2. Editable docx export — bit bigger, still self-contained.**
Use the `docx` npm package to generate an editable Word version of a
quotation/invoice, mirroring `app/api/quotes/[id]/pdf/route.ts`'s data-fetching
pattern with a new `app/api/quotes/[id]/docx/route.ts`. Recommend scoping v1 to the
common case (line items + totals + bill-to address, GST on/off) and explicitly
punting on the foreign-currency dual-display formatting until requested — that logic
is intricate (see `DocumentPdf.tsx`) and isn't worth replicating exactly until
someone actually needs an editable non-SGD document.

**3. Nicer quotation/invoice PDF template — lowest code-risk of the three.**
Pure presentation: fonts/colors/spacing/logo layout in `lib/pdf/DocumentPdf.tsx`
(`@react-pdf/renderer`'s `StyleSheet`), no schema changes, no new dependency, no
security implications. This was deferred not because it's hard, but because it was
waiting on a design asset — but Design Prodigy's actual brand system (colors,
fonts, layout conventions) is already available in this environment via the
`design-prodigy-brand-pptx` skill, used for this company's PowerPoint decks. A
future agent should pull that real brand palette/typography as a starting point
rather than inventing one, then iterate from user feedback rather than waiting on a
fresh design file.

Everything else from the original wishlist (Salesforce quote numbers, Xero push,
multi-quote-per-email splitting, admin cross-user visibility) is real Phase 2 work
but meaningfully bigger — external integrations, schema-shape changes, or an
RLS/security-model change — and better scoped individually when picked up, not
handed off blind.

## Avoiding the mix-up that just happened
Before drawing conclusions from Supabase data alone, confirm you actually have this
repo (not just DB access) checked out at this branch — the schema won't tell you
where the code that writes to it lives.

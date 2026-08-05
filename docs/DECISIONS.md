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

## Decision 3: User profiles (name/title on quotes) — first Phase 2 pick

Picked as the first Phase 2 item from HANDOFF.md's ready-to-build list (easiest,
fully self-contained, no external integration).

- New `profiles` table, one row per user (`owner_id` PK referencing `auth.users`,
  same shape as `gmail_connections`), holding `full_name` and `title`. RLS: owner
  can only read/write their own row, matching every other per-user table in this
  schema.
- Editable from a new "Your profile" section at the top of Settings
  (`ProfileForm.tsx` + `saveProfile` action) — upserts on save.
- Surfaced on quotation/invoice PDFs as a "Prepared by" line (`DocumentPdf.tsx`),
  populated by both PDF routes looking up the document's `owner_id` in `profiles`.
  Omitted entirely if the user hasn't set a name.
- Follow-up: added a signature image upload (PNG/JPG, 2MB cap). Stored in a private
  Supabase Storage bucket (`signatures`), one fixed key per user
  (`${owner_id}/signature`, no extension — content-type comes from upload metadata,
  so re-uploading a different image type cleanly overwrites it via `upsert`). RLS on
  `storage.objects` restricts read/write/delete to the path's owner, same pattern as
  every table here. PDF routes fetch a short-lived signed URL server-side, inline the
  bytes as a base64 data URI (`lib/profile/getSignatureDataUri.ts`), and render it
  above the "Prepared by" line — avoids depending on a signed URL staying valid for
  the lifetime of the render.
- Follow-up: PDFs were rendering Japanese/Korean text (e.g. bill-to addresses) as
  gibberish — `@react-pdf/renderer` defaults to Helvetica, a PDF base-14 font with
  only Latin-1 glyphs, so it silently substitutes garbage instead of erroring.
  Fixed by registering Noto Sans JP and Noto Sans KR (`lib/pdf/fonts.ts`, font files
  vendored under `lib/pdf/fonts/`) and picking a font per text field based on a
  Unicode-range check of its content — Hangul → Noto Sans KR, kana/kanji → Noto Sans
  JP, otherwise Helvetica (kept as the default everywhere so existing English
  documents look unchanged). Applied to every client-/user-supplied text field on
  the PDF: client name, billing address, contact name, line item descriptions,
  notes, quote/invoice number, reference, and the "Prepared by" line.
  Chinese support was explicitly left out (no CN clients yet) — if needed later,
  add a `NotoSansSC`/`NotoSansTC` registration and a CJK-ideograph branch to
  `fontFor()`, but note it can't distinguish Chinese from Japanese by codepoint
  alone (they share the Han block), so it'd need a signal beyond the raw text
  (e.g. a per-client language field) to pick correctly.
  Because the route handlers load these fonts from disk at render time (not via a
  static import), they're invisible to Next.js's default serverless-bundle file
  tracing — `next.config.mjs` explicitly lists `lib/pdf/fonts/**/*` under
  `experimental.outputFileTracingIncludes` for both PDF routes so Vercel actually
  ships the font files with the function. Skipping this is the classic failure mode
  for this pattern: works locally, 500s (or silently reverts to tofu) in production
  because the font file isn't in the deployed bundle.
- Follow-up: PDFs with JP/KR content rendered correctly but took 15-25s. Root cause:
  `@react-pdf/renderer`'s shaping engine (`fontkit`, pure JS, no HarfBuzz) does
  non-trivial per-call work that scales roughly linearly with the font's *total*
  glyph count on every distinct string it lays out — confirmed by direct
  benchmarking (`fontkit.create(...).layout(text)`), not just theorized. Full Noto
  Sans JP/KR carry ~17-25k glyphs each (every kanji/hanja + every precomposed Hangul
  syllable), so a document with ~7-8 distinct JP/KR fields (client name, address,
  line items, etc.) paid that cost repeatedly.
  Fix: re-subset both font files down to a curated "common use" character set
  instead of the full repertoire — JIS X 0208's ~2965 level-1 kanji (the
  Shift-JIS-standard common set) for Japanese, KS X 1001's ~2350 commonly-used
  Hangul syllables (dropping Hanja, which modern Korean business text essentially
  never uses) for Korean, both derived deterministically via Python's built-in
  `shift_jis`/`euc_kr` codecs (no external kanji-frequency list needed) and cut with
  `fonttools`' `pyftsubset`. Brought font size from ~11.6MB to ~900KB combined and
  full mixed-script render time from ~15-25s to ~4s.
  Trade-off, stated plainly: a character outside these common sets (a rare/archaic
  kanji, an uncommon Hangul combination) renders as a blank glyph instead of the
  correct character — confirmed this degrades gracefully rather than crashing.
  Deemed an acceptable trade for realistic business documents (names/addresses/line
  items). If a real client hits a missing character, the fix is widening the
  subset's unicode/text-file input and re-running `pyftsubset`, not reverting to the
  full font (which reintroduces the multi-second render time).
  ~4s per JP/KR document is still slower than the ~150-200ms an English-only
  document takes (Helvetica needs no file I/O or shaping at all) — that gap is
  inherent to embedding real CJK typefaces through a pure-JS shaper and is unlikely
  to close further without a different rendering approach entirely.

## Decision 4: Nicer PDF template — real Design Prodigy branding

Picked up the last Phase 2 item from HANDOFF.md's ready-to-build list. User supplied
real reference material (their docx-based quotation generator script + Claude Skill
doc, two example PDFs, the actual logo file, and their real Terms & Conditions /
Payment Terms copy) rather than this being invented.

- **Brand font**: Montserrat replaces Helvetica as the document default
  (`lib/pdf/fonts.ts`'s `DEFAULT_FONT_FAMILY`), regular + bold weights vendored the
  same way as the JP/KR fonts. The JP/KR font-switching logic (`fontFor()`) is
  unchanged — Montserrat is just the new fallback instead of Helvetica.
- **Logo**: real asset at `docs/DP_quotation_logo.png` (repo root), copied to
  `quotation-app/lib/pdf/assets/logo.png` and embedded via `lib/pdf/logo.ts`
  (same fs-read-to-base64-data-URI pattern as the signature image, but a static
  checked-in file rather than per-user Storage). Rendered in a `fixed` View so it
  repeats on every page — verified this doesn't overlap flowing content on page 2+
  by testing a 40-line-item quote (page's `paddingTop` is bumped to reserve the
  space `fixed` positioning doesn't automatically account for). If the file is ever
  missing, the logo block is just omitted, not replaced with a text recreation —
  there's a real asset checked into git, no need for a fallback font/design.
- **Company "from" info** (`lib/pdf/brand.ts`'s `BRAND` constant): name, address,
  Payment Terms, Terms & Conditions, and the quote validity window (20 days) are
  all static content, not database fields — they're the same for every document
  this app generates, sourced verbatim from the user, not fabricated.
- **New two-column meta block** before the line items (Quotation/Invoice Number,
  Company Name/Address, Bill To on the left; Created Date, Prepared By, Email,
  Expiration Date/Due Date on the right) — replaces the old bare header, matching
  the layout of the user's real reference template.
- **New `quotations.valid_until` column** (nullable date), defaulting to
  `quote_date + 20 days` at creation time only (computed server-side in
  `createQuotation`, not re-derived on edit) — the 20-day default matches what the
  Terms & Conditions text itself states, so the two can't drift apart
  (`BRAND.quoteValidityDays` is the single source both read from).
- **Footer signature block differs by document type**, deliberately:
  - Quotations get the full "Quote accepted by:" (blank ruled lines for the
    client to sign by hand — no client-signature data exists) / "Quote prepared
    by:" (existing signature-image + name + title, now with a date added) two-
    column block, matching the user's real reference template.
  - Invoices get only the simpler existing "Prepared by" block (now with a date
    added) — no client acceptance line. Confirmed with the user: invoices are
    headed to Xero eventually (see the Phase 2 wishlist above), so this is a
    stopgap, not worth building out the same ceremony as quotations.
- Client `contact_name`/`contact_email`, invoice `reference`, and the status badge
  all keep showing on the document (folded into the new Bill To block / an extra
  meta row / left where it already was) — nothing was silently dropped from what
  the old template showed.

## Decision 5: Xero invoice push — v1

First of the two confirmed next-priority features from `docs/HANDOFF.md` (Xero,
then Salesforce quote numbers). Scoped and built in one session after real Xero
OAuth credentials were provisioned; a research + design-validation pass read the
live schema/RLS and Xero's official OpenAPI spec directly rather than assuming.

- **Single shared Xero connection, not per-user like Gmail.** One company Xero
  org ("Design Prodigy Pte Ltd"); any teammate can push invoices they own to it.
  `xero_connections` is a genuine singleton (`id integer primary key default 1
  check (id = 1)`), always upserted at `id=1` — avoids any "which row is
  canonical" ambiguity. Its RLS policy (`for all to authenticated using (true)
  with check (true)`) is the **first non-owner_id-scoped policy in this
  schema** — every other table here is `owner_id = auth.uid()`. This is
  deliberate, not an oversight: there's no role/admin system in this app yet
  (per HANDOFF.md's still-unbuilt "admin cross-user visibility" item), so
  "any authenticated user can manage the shared company resource" matches the
  trust level already implicit everywhere else. Confirmed this does NOT grant
  any new cross-user visibility — invoices/clients stay exactly as
  owner_id-scoped as before; a shared *destination* doesn't mean shared
  *source data*.
- **Xero's refresh tokens rotate on every use** (unlike Google's reusable
  ones) — each refresh invalidates the previous refresh token (30-min grace
  period). `lib/xero/client.ts`'s `getXeroClientForConnection()` persists the
  newly-rotated token to `xero_connections` immediately after refreshing,
  before making any other Xero API call — if a later step throws, the
  connection must not be left pointing at a token Xero no longer honors.
- **`lib/crypto.ts` was generalized** (env-var-name parameter, defaulting to
  `GMAIL_TOKEN_ENCRYPTION_KEY` so all existing call sites are untouched) so
  Xero tokens can use a separate `XERO_TOKEN_ENCRYPTION_KEY` — blast-radius
  isolation between the two integrations' secrets.
- **Tax type and account code are org-configurable, not hardcoded.** Xero's
  `TaxType`/`AccountCode` are free-text strings specific to each org's chart of
  accounts, not a fixed enum — `lib/xero/settings.ts` fetches the real
  `TaxRates`/`Accounts` lists live so Settings can offer real choices, cached
  onto `xero_connections` (`gst_tax_type`, `gst_tax_rate`, `no_gst_tax_type`,
  `default_account_code`) once picked. This needed adding `accounting.settings`
  to the Xero app's scopes (missing from the initial 3-scope setup) — flagged
  and fixed before writing the settings-picker code, not discovered by a
  runtime 403 later.
- **`accounting.transactions` (the scope initially requested for invoice
  creation) doesn't exist on this app** — discovered only when the user hit
  "invalid_scope" directly on Xero's authorize page (i.e. the whole request
  was rejected before login, not a downstream 403). Xero has migrated newer
  apps from that broad legacy scope to granular per-resource ones; the
  correct replacement for "can create invoices" is `accounting.invoices`. If
  a future scope-related `invalid_scope` error shows up again, check the
  exact list of scopes actually enabled on developer.xero.com's Configuration
  tab for this specific app rather than assuming a scope name from Xero's
  general docs is still valid — scope naming here isn't stable across app
  vintages.
- **`invoice.gst_rate` is validated against the configured Xero tax rate before
  every push**, throwing rather than silently pushing a mismatched tax amount
  into the user's real accounting system — `gst_rate` is a real per-invoice
  field in this app (not a constant), so drift between what this app shows and
  what Xero's configured rate actually is is a real risk, not a hypothetical.
- **`LineAmountTypes: "Exclusive"`** — confirmed `lib/format.ts`'s
  `computeTotals` treats `unit_price` as tax-exclusive; must match or Xero
  double-accounts for tax.
- **App status (`Draft`/`Sent`/`Paid`, CHECK-constrained) and Xero's own
  invoice status are two independent state machines on the same row**, tracked
  in separate new columns (`xero_invoice_id`, `xero_status`, `xero_pushed_at`,
  `xero_push_error`, `xero_idempotency_key`) rather than merged — v1 has no
  two-way sync (see cuts below), so the UI says so explicitly rather than
  implying "mark as paid" here also marks it paid in Xero.
- **`clients.xero_contact_id`** caches a matched/created Xero Contact so
  repeat pushes for the same client skip re-searching Xero.
- **Idempotency**: a UUID is generated and persisted to
  `invoices.xero_idempotency_key` *before* calling Xero's create-invoice
  endpoint (not after), and passed as Xero's `Idempotency-Key`. A crash between
  "Xero received it" and "we recorded the result" can therefore retry safely
  without double-creating the invoice — the key is only cleared by a
  successful push, kept intact on failure for exactly this reason.
- **V1 scope cuts, explicit**: `Status: "DRAFT"` hardcoded (human reviews/
  authorises in Xero, no auto-authorise); push restricted to **SGD-currency
  invoices only** (this app's `exchange_rate` field is a manual PDF-display
  number, not something Xero necessarily agrees with — multi-currency Xero
  push is a real fast-follow once SGD push is proven, not deferred out of
  laziness); no two-way sync (pulling payment status back from Xero); no bulk/
  batch push; no "View in Xero" deep link (couldn't verify the URL format
  without a real connected org).
- **What genuinely couldn't be verified without the user**: the OAuth
  handshake itself (requires clicking through Xero's real login/consent
  screen — no sandbox org available), the actual tax-rate/account-code names
  in Design Prodigy's real Xero org, and the refresh-token path specifically
  (testing it via any side script would itself consume and rotate the token,
  desyncing whatever's stored — the only safe way to exercise it for real is
  through the app's own code path). Everything else (`buildInvoicePayload.ts`
  as a pure function, `tsc`/`next build`, the migration applied and confirmed
  live) was verified directly this session.

### Post-ship fixes from the real connect + first real push

- **`accounting.transactions` doesn't exist as a scope on newer Xero apps** —
  Xero migrated to granular per-resource scopes; the correct one for creating
  invoices is `accounting.invoices`. Found via an `invalid_scope` error on
  Xero's own authorize page (rejected before login), not a downstream 403.
- **The OAuth callback route needed `export const maxDuration = 60`** — it
  does an OIDC discovery round-trip (a fresh `XeroClient` per request has no
  cached issuer metadata from `/start`), the token exchange, a tenant lookup,
  and a Supabase write, all sequential; comfortably past Vercel's 10s default.
- **Every step in the callback route after the token exchange must be wrapped
  in try/catch, not just the "expected" failure points.** The real first
  failure was `encrypt()` throwing because `XERO_TOKEN_ENCRYPTION_KEY` was
  never actually set in Vercel — uncaught, so the route crashed with a raw
  HTTP 500 instead of redirecting with a message. Worse, this happened *after*
  Xero's one-time authorization code had already been successfully exchanged,
  so the crash both hid the real cause and burned the code, making a retry
  fail with an unrelated-looking `invalid_grant (Authorization code not
  found)`. Lesson: in a one-shot external-redirect flow, anything that can
  throw after the irreversible step must redirect-on-catch, with no exceptions
  for "this shouldn't fail."
- **`xero-node`'s Axios errors have a useless top-level `.message`** ("Request
  failed with status code 400") — the real reason lives in `.response.data`.
  `lib/xero/describeError.ts` pulls it out; without it, every Xero API
  rejection showed as "Unknown error pushing to Xero" with zero diagnostic
  value.
- **The real first push failed with `"The TaxType code 'INPUTY24' cannot be
  used with account code '200.03'."`** — an input (purchase-side) GST tax rate
  had been picked in Settings for what is always a sales invoice (ACCREC).
  Fixed at the root rather than just documented: `lib/xero/settings.ts` now
  filters `listTaxRates()` to `canApplyToRevenue` and `listAccounts()` to
  `_class === Account.ClassEnum.REVENUE` (Xero's own account-class field,
  exposed as `_class` since `class` is a reserved word in the generated SDK),
  so an incompatible tax rate or non-revenue account can no longer be
  selected in the first place — this app only ever creates sales invoices, so
  neither picker should have offered anything else to begin with.
- **Retrying after fixing the tax-rate mapping above then failed with
  `"Idempotency Key: ... is used with a different request."`** — confirmed
  real, not hypothetical: the original persisted-idempotency-key design
  (`app/(app)/invoices/actions.ts`) assumed a retry always means "the exact
  same request, safe to reuse the key," but a retry can also mean "the
  payload legitimately changed" (here, because the Settings misconfiguration
  was fixed in between attempts), and Xero correctly refuses to honor the old
  key against a different body. Fixed by only *keeping* the idempotency key
  when there's no HTTP response from Xero at all (a true network/timeout
  failure, where it's genuinely unknown whether Xero received the request —
  the one case retrying with the same key is both safe and required); any
  definitive response, including a rejection, spends the key and clears it so
  the next attempt gets a fresh one. This self-heals invoices that were stuck
  from the earlier bug without needing a manual DB fix.

## Decision 6: Refresh from Xero (status + invoice number) — Xero v1's first fast-follow

After the first real invoice pushed successfully, the user asked for two
related things: use Xero's own invoice number instead of this app's, and track
the invoice's status in Xero (draft/awaiting payment/paid). Both are the same
underlying gap — v1 explicitly deferred pulling anything back from Xero after
the initial push (Decision 5's scope cuts). Confirmed with the user: a manual
"Refresh from Xero" button is enough, not automatic polling or webhooks —
simplest, and needs no new Xero portal config.

- **`app/(app)/invoices/actions.ts`'s new `refreshInvoiceFromXero(invoiceId)`**
  mirrors `pushInvoiceToXero`'s conventions exactly: never throws, returns
  `{error?}`, persists failures onto `invoices.xero_push_error` so they survive
  a refresh. It calls `xero.accountingApi.getInvoice(tenantId, xero_invoice_id)`
  and updates `xero_status` unconditionally, but updates `invoice_number` only
  when Xero returns a non-empty one — Xero often doesn't assign a real invoice
  number until the draft is authorised in Xero itself, so a not-yet-authorised
  refresh must not blank out a number this app already has.
- **`Invoice.StatusEnum` is a genuine string enum at runtime** (confirmed
  directly against the compiled SDK: `StatusEnum["DRAFT"] = 'DRAFT'`, etc.),
  matching the same pattern already relied on for `TaxRate.StatusEnum`/
  `Account.ClassEnum` in Decision 5. This means the existing
  `xero_status: String(created.status)` in `pushInvoiceToXero` was already
  correct — re-verified rather than assumed, since it looked at first glance
  like it might be storing a numeric enum value.
- **`lib/xero/statusLabel.ts` (new)** maps the raw API enum
  (`DRAFT`/`SUBMITTED`/`AUTHORISED`/`PAID`/`VOIDED`/`DELETED`) to the
  vocabulary Xero's own web UI shows end users — notably `AUTHORISED` →
  "Awaiting Payment" — so the app doesn't show a raw enum string the user
  would need to translate mentally.
- **UI**: `InvoiceActions.tsx` shows a "Refresh from Xero" button once
  `xeroInvoiceId` is set (replacing "Push to Xero" at that point, same as
  before), using the same busy/error pattern as every other button in that
  component. The "Pushed to Xero (...)" status line now runs through
  `xeroStatusLabel()` instead of displaying the raw status string.
- **Deferred**: automatic/scheduled refresh (webhooks or polling) — the user
  confirmed manual is fine for now; revisit if staleness becomes a real
  problem.
- **Bug found immediately after shipping this**: `buildInvoicePayload.ts` was
  sending this app's own placeholder number (`INV-YYYY-NNNN`, assigned by the
  `set_invoice_number` DB trigger at invoice-creation time, well before any
  Xero push) as Xero's `invoiceNumber` field. Xero doesn't treat an incoming
  `invoiceNumber` as a suggestion — it just uses it verbatim — so every pushed
  invoice showed this app's number in Xero instead of one Xero generated
  itself, defeating the entire point of this decision. Fixed by omitting
  `invoiceNumber` from the payload entirely (so Xero auto-assigns per the
  org's own Invoice Settings) and changing `pushInvoiceToXero`'s post-push
  update to prefer `created.invoiceNumber` over this app's local number
  (falling back to the local placeholder only if Xero's org has automatic
  numbering off and returns nothing yet — the same fallback
  `refreshInvoiceFromXero` already used). **Note**: any invoice pushed before
  this fix already has this app's number permanently recorded in Xero as its
  real invoice number — that has to be corrected manually in Xero's own
  invoice editor (while still a Draft) if it matters; there's no API-safe way
  to retroactively unset an invoice number Xero has already assigned.
- Next up (not yet built): a second Gmail label on the same connection
  watching for client Purchase Order emails, matched against existing
  invoices via a review queue — mirrors the existing quote-email pipeline
  (`gmail_connections`, `unmatched_email_quotes`, `CheckNowModal.tsx`, the
  3-tier matcher) with a new `unmatched_email_pos` table and `lib/email-po/`
  module. Deliberately phased as a separate, bigger follow-up rather than
  bundled into this change.

## Decision 7: Xero status sync — single-invoice + bulk check

After testing Decision 6, the user pointed out "Refresh from Xero" only
updated the separate `xero_status` display field — it never touched the
app's own `status` column (Draft/Sent/Paid, CHECK-constrained, drives the
"Mark as sent"/"Mark as paid" buttons and every StatusBadge). They wanted the
refresh to actually sync the app's status, plus a bulk way to check all
not-yet-Paid invoices at once from the Invoices list.

- **`lib/xero/nextAppStatus.ts` (new)**: rank-based, monotonic-only mapping
  (Draft=0 < Sent=1 < Paid=2). Xero `PAID` → target `Paid`;
  `AUTHORISED`/`SUBMITTED` → target `Sent`; `DRAFT`/`VOIDED`/`DELETED` → no
  change. The target is only applied if its rank is *higher* than the
  invoice's current status — a manually-marked "Paid" invoice must never be
  knocked back to "Sent" automatically just because Xero hasn't caught up
  (or was voided after the fact).
- **`lib/xero/applyXeroInvoiceToRow.ts` (new)**: `computeInvoiceUpdateFromXero`
  shared by both the single-invoice refresh and the new bulk check — same
  "given current row + a fetched Xero invoice, what changes" logic in one
  place instead of duplicated across the two call sites.
- **No schema change.** `invoices.status` stays exactly `'Draft' | 'Sent' |
  'Paid'` — no 4th "Awaiting Payment" value. The user's "nice to have, not a
  big deal if not" ask for finer-grained visibility is instead satisfied by
  showing `xeroStatusLabel(xero_status)` as a secondary hint next to the
  StatusBadge on the Invoices list, a pure display addition.
- **New `checkInvoicesAgainstXero()`** (`app/(app)/invoices/actions.ts`):
  selects every invoice with `status in ('Draft','Sent')` and a
  `xero_invoice_id`, then fetches them from Xero in as few calls as possible
  via `getInvoices(tenantId, undefined, undefined, undefined, iDs)` — this
  API supports fetching many specific invoices by ID in a single call, unlike
  `getInvoice` which only takes one, so a bulk check doesn't mean N round
  trips. Chunked into batches of 100 (Xero's own page-size ceiling) as cheap
  insurance, even though this app has few invoices in practice. Each row's
  update is independent, so a Xero error partway through still leaves the
  successfully-checked rows correctly updated — the never-throw convention
  returns partial `updatedToPaid`/`updatedToSent` counts alongside the error
  rather than treating it as an all-or-nothing transaction.
- **UI**: new `CheckXeroStatusButton.tsx` on `/invoices` (not `/board`,
  which mixes quotes and invoices and has no natural "Draft/Sent + pushed to
  Xero" filter today — kept out of scope to avoid the added complexity for
  no real benefit).
- Design validated with a Plan agent against the real code before
  implementing (confirmed the `getInvoices` `iDs` signature, the exact CHECK
  constraint via `pg_get_constraintdef`, and that no additional abstraction
  beyond the two small pure-function files above was warranted for just two
  call sites).

## Decision 8: PO-matching Gmail pipeline

Last piece of the original three-part Xero/invoicing wishlist. A second
Gmail label on the same connected account watches for client Purchase Order
emails; a "Check now" flow (mirroring the quote pipeline exactly) surfaces
recent candidates for review, and confirming one attaches the PO's info to
an existing **invoice** (not a new document) via its `reference`/`notes`.

Before implementing, every file this mirrors was re-read directly this
session (not assumed from memory) to confirm exact shapes: `gmail_connections`
and `unmatched_email_quotes` columns (via `information_schema.columns`),
`lib/email-quote/gmailClient.ts`, `matchClient.ts`, `fuzzyMatchClient.ts`,
`extractQuoteFromEmail.ts`, `settings/actions.ts`, `CheckNowModal.tsx`,
`SettingsClient.tsx`, `settings/page.tsx`, `review/page.tsx`,
`review/ReviewQueue.tsx`, `review/actions.ts`, and the Gmail OAuth callback
route.

- **No processed-label tracking for PO emails, deliberately.** The quote
  pipeline auto-creates a "Quotation Bot Processed" Gmail label at OAuth
  connect time (`app/api/auth/gmail/callback/route.ts`) so a re-check doesn't
  resurface already-handled emails. Replicating that for PO emails would need
  either a Gmail reconnect or a lazy find-or-create step — the user confirmed
  it's not worth it: an already-processed PO email showing up again in a
  later "Check now" isn't a real problem. So `gmail_connections` only gained
  `po_watched_label_id`/`po_watched_label_name`/`po_last_checked_at` — no
  `po_processed_label_id`, no label applied after processing.
- **`unmatched_email_pos` (new table)** mirrors `unmatched_email_quotes`'s
  exact shape (same RLS pattern: `owner_id = auth.uid()`), but resolves
  against `suggested_invoice_id`/`resolved_invoice_id` (both referencing
  `invoices`) instead of drafting a new quotation.
- **`lib/email-quote/gmailClient.ts`'s `listCandidateMessages` generalized**
  to take `watchedLabelId`/`processedLabelId` as explicit parameters instead
  of reading them off the connection row directly — the exact same
  pagination/dedup/sort logic is now shared by both the quote and PO flows
  rather than duplicated.
- **`lib/email-po/` (new, mirrors `lib/email-quote/`)**: `extractPoFromEmail`
  (same Haiku-based extraction pattern as `extractQuoteFromEmail`, different
  schema: `po_number`, `referenced_invoice_number`, `amount`, `client_name`),
  `matchInvoiceForPo` (deterministic case-insensitive string match against a
  client's own invoices — no AI tier for this step; `findClientByEmail`/
  `fuzzyMatchClient` already do the fuzzy work of identifying the *client*,
  reused as-is), `insertUnmatchedPo` (mirrors `insertUnmatchedQuote` exactly,
  service-role client).
- **`processSelectedPoMessages`** mirrors `processSelectedGmailMessages`'s
  exact 3-tier client-identification shape, adding a 4th step once a client
  is known: fetch that client's invoices and run `matchInvoiceForPo` against
  the extracted PO/invoice number.
- **Review UI** (`app/(app)/review/purchase-orders/`) is deliberately
  simpler than the quote `ReviewQueue.tsx` — no line items/currency/GST,
  since this isn't drafting a new document. Just a client dropdown, an
  invoice dropdown filtered to that client, and editable reference/note
  fields pre-filled from the extraction. `resolveUnmatchedEmailPo` only
  writes `reference` if the invoice's was empty (never overwrites an
  existing one) and always appends `note` onto `notes` (newline-joined, not
  overwritten).
- **Settings UI**: `PoSettingsClient.tsx`/`CheckPoNowModal.tsx` are focused
  duplicates of `SettingsClient.tsx`/`CheckNowModal.tsx` rather than
  parameterized — `CheckNowModal.tsx` currently imports its quote actions
  directly and isn't set up for injection; revisit generalizing if a third
  such flow ever shows up. Rendered as a second block inside the existing
  Gmail card (same connection, no new "Connect" step).

### Post-ship correction: match by amount + description, across quotes AND invoices

Real-world feedback immediately after shipping the above: the deterministic
number-match tier was based on a wrong assumption. Two corrections, from the
user directly:

1. Client POs usually do have their own PO number, but it's the client's own
   internal numbering — unrelated to our quotation/invoice numbers. String-
   comparing the two was never going to match anything in practice.
2. More fundamentally, a PO is triggered by a **quotation** we sent, not
   directly by an invoice — "the invoice is downstream of that." A PO can
   arrive before its quotation has even been converted to an invoice.
   Confirmed via `AskUserQuestion`: matching should search the client's
   **quotations and invoices together** ("Both quotations + invoices"),
   not invoices alone.

Fixed by replacing the whole matching tier:
- **`ExtractedPo`** dropped `referenced_invoice_number` (meaningless) and
  gained `description` — a short summary of the goods/services the PO
  covers, extracted specifically to be matched against line-item
  descriptions.
- **`lib/email-po/matchInvoiceForPo.ts` deleted**; replaced by
  **`lib/email-po/fuzzyMatchDocumentForPo.ts`**, mirroring
  `fuzzyMatchClient.ts`'s exact pattern (Haiku, `temperature: 0`, validate
  the returned id is actually in the candidate list, null preferred over a
  low-confidence guess) — but matching against a combined candidate list of
  the identified client's **quotations and invoices**, each with a computed
  total (via the existing `computeTotals`) and its line-item descriptions,
  picked primarily by amount closeness and description similarity.
- **`processSelectedPoMessages`** now: if the match lands on an invoice
  directly, suggest it (`suggested_invoice_source = "ai_amount_match"`). If
  it lands on a quotation, always record `suggested_quotation_id` (for
  reviewer visibility) and look up whether that quotation has already been
  converted to an invoice (`invoices.quotation_id`) — if so, suggest that
  invoice (`"ai_match_via_quotation"`); if not, leave `suggested_invoice_id`
  null rather than force-converting anything automatically.
- **Review UI**: when a PO matches an unconverted quotation, the card shows
  "Matches Quote {number} — not yet invoiced" with a link to convert it,
  instead of a misleading "no match" state. The invoice picker now also
  shows each candidate's computed total (`INV-... (Sent) — SGD 1,200.00`) so
  a reviewer can visually sanity-check an amount-based (inherently fuzzier
  than exact-number) match.
- New `unmatched_email_pos` columns: `suggested_invoice_source`,
  `suggested_quotation_id` (both nullable, additive migration).

## Decision 9: Login copy, review-nav counters, and a real signup bug fix

Three small, unrelated requests, triaged and shipped together since none
needed a dedicated plan-mode round on their own:

- **Login copy**: "Sign in with your DP colleague account." →
  "Sign up for an account with your DP email address." (`app/login/page.tsx`).
- **Review nav**: "Needs review" → "Review Quotes"; both review links
  (`/review`, `/review/purchase-orders`) now show a pending count —
  `Review Quotes (5)` — via a cheap `{ count: "exact", head: true }` query
  against `unmatched_email_quotes`/`unmatched_email_pos`
  (`app/(app)/layout.tsx`), omitted entirely when the count is zero.
- **Signup confirmation email led to a 404 on the app's own domain,
  confirmed by the user.** Root cause: `signUp()`
  (`app/login/actions.ts`) never had a corresponding callback route —
  only the Gmail and Xero OAuth callbacks existed under `app/api/auth/`.
  Fixed with the standard Supabase-documented Next.js App Router pattern:
  new `app/auth/confirm/route.ts` calling `supabase.auth.verifyOtp({ type,
  token_hash })` from the confirmation link's query params, then redirecting
  to `/board` on success or back to `/login` with an error otherwise.
  **A second, easy-to-miss bug found while wiring this in**: the global
  auth middleware (`lib/supabase/middleware.ts`) redirects any
  unauthenticated request straight to `/login` unless the path is under
  `/login` — a brand-new signup clicking the confirmation link from their
  email is, by definition, not yet authenticated, so without an exemption
  the new route would never even run; it'd just bounce to `/login` before
  `verifyOtp` ever fired, silently failing instead of 404ing. Fixed by
  adding `/auth/confirm` to the middleware's `isAuthRoute` allowlist
  alongside `/login`.
  **What I couldn't verify myself**: whether the Supabase project's
  "Confirm signup" email template actually sends a link in the
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
  shape this route expects — there's no MCP tool exposing Auth email
  template config (same gap as the leaked-password-protection setting
  earlier this session). Flagged to the user directly rather than assumed.

## Decision 10: Feedback widget (text + images, screen recording deferred)

User wanted a persistent feedback affordance so colleagues can flag issues/
ideas as they hit them. Scoped down from the original ask (text + images +
short screen-recording video) — screen recording needs browser
screen-capture permissions, client-side video recording, and direct-to-
storage uploads to dodge Vercel's request size limits, a meaningfully
bigger lift than the rest; deferred as a stretch goal, not built.

- **Visibility is asymmetric and deliberately not the `xero_connections`
  pattern.** Anyone signed in can *submit* feedback, but only
  `yuanwen@dp.sg` — confirmed directly via `AskUserQuestion` to be the
  actual login email for this app, not assumed from the general contact
  email in this session's context — can *read* the list. Feedback content
  is more likely to be sensitive than shared company resources like Xero
  settings, so this intentionally breaks from the "no role system, single
  trust level" default used everywhere else in this app. Enforced twice:
  RLS (`auth.email() = 'yuanwen@dp.sg'` on both the `feedback` table's
  SELECT policy and the `feedback-images` storage bucket's SELECT policy)
  and a page-level `redirect("/board")` for defense in depth, plus the
  "Feedback" nav link itself only renders for that email so no one else is
  even pointed at a page they can't use.
- **Image upload mirrors `uploadSignature`** (`app/(app)/settings/actions.ts`)
  exactly in shape — private Storage bucket, path-prefixed by
  `auth.uid()`, type/size validation before upload — just with a higher
  per-file cap (5MB vs signatures' 2MB, since screenshots run bigger) and a
  6-image-per-submission limit.
- **Submitter info is denormalized onto the row** (`submitted_by_email`)
  rather than joined from `auth.users`, mirroring
  `unmatched_email_quotes`/`unmatched_email_pos` — `auth.users` isn't
  queryable from the normal client anyway.
- **No new modal CSS** — reuses the existing `.modal-overlay`/
  `.modal-content` classes already defined in `app/globals.css` for
  `CheckNowModal.tsx`. Only new CSS is `.feedback-trigger` (the fixed
  bottom-right button, `z-index: 90`, one below the modal's `z-index: 100`
  so an open modal always wins).
- **No resolve/dismiss/status workflow in v1** — pure read list for the
  owner. Deliberately not built until real feedback starts coming in and
  it's clear whether a triage workflow is actually needed.
- **Considered and explicitly deferred**: an email notification to the
  owner whenever new feedback arrives. Two options were discussed —
  Resend (new account/API key, but doesn't touch the existing Gmail
  connection) vs. reusing the connected Gmail account (no new service, but
  needs an added `gmail.send` OAuth scope and a one-time reconnect since
  existing refresh tokens can't retroactively gain new scopes) — user
  decided not to add either for now.

## Decision 11: Surface Xero's VOIDED invoice status properly

User asked whether a Xero invoice's VOIDED status could be synced. Checking
the code directly (before assuming a gap existed) showed the raw sync was
already half-working: `computeInvoiceUpdateFromXero`
(`lib/xero/applyXeroInvoiceToRow.ts`) always writes whatever Xero's status
is into `xero_status`, and `xeroStatusLabel()` already mapped `VOIDED` →
"Voided" for display — so a voided invoice's real status *was* already
being pulled and shown, once refreshed. Two real gaps found and fixed:

- **`checkInvoicesAgainstXero`'s bulk "Check Xero status" button excluded
  locally-Paid invoices** (`.in("status", ["Draft", "Sent"])`), so a Paid
  invoice voided afterward in Xero (e.g. a reversed payment) would only be
  caught by manually refreshing that one invoice, not the bulk button.
  Fixed by dropping that filter — every pushed invoice (any local status)
  now gets checked, still batched into as few Xero API calls as possible.
- **A voided invoice looked visually identical to a normal one** — the
  `(Voided)` hint rendered in the same quiet gray `.subtitle` style as
  `(Awaiting Payment)`. Added a `.xero-voided` CSS class (reusing the
  existing `--danger` variable already used by `.error`/`.btn-danger`,
  not a new color) applied on both the Invoices list and the invoice
  detail page specifically when `xero_status === "VOIDED"`.
- **Deliberately not revisited**: Decision 7's choice to keep
  `invoices.status` at exactly `'Draft' | 'Sent' | 'Paid'`. `VOIDED` still
  doesn't map to anything in `nextAppStatus` — it's not a state the app's
  own Draft→Sent→Paid workflow understands, so this stays a display-only
  fix to the existing `xero_status` sync, not a new state machine.

## Decision 12: Unsaved-changes guard before pushing to Xero

First of three "big-ish" asks scoped together (Salesforce quote numbers,
this, and a Gmail AI assistant — see the scoping conversation; Salesforce
deferred, this one picked to build first as the smallest, Gmail assistant
still exploration-only). The invoice edit form (`InvoiceForm.tsx`) and the
"Push to Xero" button (`InvoiceActions.tsx`) are independent sibling client
components on the same page with no existing connection — confirmed by
reading both directly rather than assumed. Pushing while the form has
unsaved edits would silently push whatever's last-saved in the database,
not what's currently typed.

- **`lib/forms/FormDirtyContext.tsx` (new)**: a small shared React context
  (`FormDirtyProvider`/`useFormDirty`) — deliberately placed under `lib/`
  rather than nested inside `app/(app)/invoices/`, since the same pattern
  is meant to extend to quotes once a Salesforce push exists there too, per
  the scoping conversation.
- **`InvoiceForm.tsx`** marks the form dirty via a single `useEffect`
  watching all of the form's field state (skipping the very first render
  with a ref, so mounting doesn't immediately flag it dirty) rather than
  touching every individual `onChange` handler — smaller diff, same result.
  Clears dirty on a successful save.
- **`InvoiceActions.tsx`** intercepts the push button when dirty and shows
  a confirmation modal (reusing the existing `.modal-overlay`/
  `.modal-content` CSS) with **"Cancel" / "Push anyway"** — simplified from
  the scoping doc's three-option sketch ("Save and push" / "Push without
  saving" / "Cancel"). A combined "Save and push" button would need
  `InvoiceActions` to programmatically trigger `InvoiceForm`'s save function
  across the sibling-component boundary (a registered-callback pattern) —
  real added complexity for a "SMALL"-scoped feature, and arguably less
  honest anyway (what happens if the triggered save fails silently before
  the push proceeds?). Two clear buttons — go back and save yourself, or
  proceed knowing what will be sent — was judged the better tradeoff.
- **`app/(app)/invoices/[id]/page.tsx`** wraps both `InvoiceActions` and
  `InvoiceForm` in `<FormDirtyProvider>`.

## Decision 13: Direct invoice creation, gated by an external-quotation check

Until now every invoice came from converting an in-app quotation
(`convertQuotationToInvoice`) — checked directly, there was no
`app/(app)/invoices/new/` route and `InvoiceForm.tsx` was edit-only (no
client selector at all, since a conversion always inherited one). The user
wanted a direct "New invoice" path for invoices that don't have an in-app
quotation behind them, but wanted the app to record what actually happened
on the quoting side rather than leave a silent gap.

- **`InvoiceForm.tsx` extended to dual create/edit mode**, mirroring
  `QuoteForm.tsx`'s existing pattern exactly (`invoiceId` now optional). New
  `clients` prop (rendered only when creating) and `externalQuoteStatus`
  prop. `currency`/`gstRate`/`gstApplicable` — previously always
  disabled-display props in this form — became local state so they can
  react to the create-mode client picker (`handleClientChange`, mirroring
  `QuoteForm`'s) while staying disabled/unchanged in edit mode, so the
  existing edit behavior is untouched.
- **New "+ New invoice" flow**: `NewInvoiceButton.tsx` opens a small modal
  first — "Was a quotation for this invoice generated outside the app?" —
  before navigating to `/invoices/new?externalQuote=yes|no`. Kept as a
  single quick question; the follow-up quote number/file fields live on the
  actual form for "yes," not stacked into the modal.
- **New `invoices` columns**: `external_quote_status` (CHECK-constrained to
  `'has_external_quote' | 'no_quote'`), `external_quote_number`,
  `external_quote_file_path` — all null for conversions (`quotation_id`
  being set already tells that story), only populated for directly-created
  invoices.
- **New private Storage bucket `external-quotes`**, owner-scoped RLS
  mirroring the `signatures` bucket's exact shape — checked `invoices`' own
  RLS directly first (`owner_id = auth.uid()` on all four policies) to
  confirm owner-only visibility was the right call here, not the more open
  `feedback-images` pattern (which exists for a different reason — a single
  reviewer needing to see everyone's submissions).
- **`createInvoice`** mirrors `convertQuotationToInvoice`'s insert shape
  exactly but leaves `quotation_id` null and takes `due_date` directly from
  the form instead of inheriting it (a from-scratch invoice has no source
  quote to inherit one from). **`uploadExternalQuoteFile`** mirrors
  `uploadSignature` exactly (type/size validation, private per-owner
  path), just with a broader allowed-type list (adds PDF) and a larger cap
  (10MB vs signatures' 2MB, since scanned quote documents run bigger).
- **A failed/skipped file upload is never a dead end**: if the invoice
  saves but the file upload fails, the invoice is still created (the quote
  number is already saved) and the detail page grows a small inline
  "Attach quotation file" control wired to the same `uploadExternalQuoteFile`
  action, rather than forcing the whole submission to be redone.
- **Shipped on its own fresh branch, not the parked Salesforce branch** —
  explicitly confirmed with the user first, since bundling it into the same
  branch as the unmerged, deliberately-preview-only Salesforce work
  (numbered Decision 13 on that branch at the time — renumbered to 14 on
  merge to avoid clashing with this entry) would have tied this feature's
  shippability to Salesforce's.

## Decision 14: Salesforce integration — Phase A (OAuth connect only)

Starting the Salesforce quote-number integration (the third scoped item,
picked up after the unsaved-changes guard). Confirmed with the user before
building: an existing Salesforce org, quotes on the **standard `Quote`
object** (child of `Opportunity`), an Opportunity created per deal (not
matched against an existing one), and a **single shared connection**
(mirrors Xero, not per-user like Gmail).

**Deliberately scoped to OAuth connect only, not the actual quote push.**
Salesforce's `Quote`/`Opportunity`/`QuoteLineItem` objects have real,
org-specific configuration (required `Opportunity` fields, `StageName`
picklist values, and whether `QuoteLineItem` requires a `PricebookEntryId`
— it does on the standard object, which doesn't map cleanly onto this
app's freeform line-item text) that can't be known without connecting
first and inspecting the org live via Salesforce's `describe` API — same
reasoning as why Xero's tax-rate/account-code settings were fetched live
rather than hardcoded (Decision 5). Phase B (the actual push) is a
separate, future plan once connected.

- **`jsforce`** (new dependency) — the standard Node library for the
  Salesforce REST API; no Salesforce-maintained SDK as polished as
  `xero-node` exists. Checked its own dependency tree directly: it
  introduces no new high-severity `npm audit` findings — the flagged ones
  (`glob`/`minimatch`/`rimraf`/`brace-expansion`) all trace to the
  pre-existing `googleapis` dependency, not jsforce.
- **`salesforce_connections` (new table)**: same singleton shape as
  `xero_connections` (`id=1`, `for all using(true)` RLS — the third
  deliberately-shared, non-owner-scoped table in this schema). Has one
  field with no Xero equivalent: **`instance_url`** — each Salesforce org
  has its own API base URL, returned during token exchange and required on
  every subsequent API call, so it's persisted alongside the refresh
  token.
- **`quotations` gets `salesforce_quote_id`/`salesforce_quote_number`/
  `salesforce_pushed_at`/`salesforce_push_error`** — the same shape as
  `invoices.xero_*`, added now even though Phase A doesn't populate them
  yet. **Deliberately `text`, not `uuid`** — unlike
  `clients.xero_contact_id` (which happens to be typed `uuid` since Xero's
  GUIDs are valid UUIDs), Salesforce record IDs are 15/18-character
  alphanumeric strings, not valid UUIDs. Copying the Xero column type here
  would have been a real, easy-to-miss bug caught by checking directly
  rather than pattern-matching blind.
- **OAuth routes** (`app/api/auth/salesforce/{start,callback}`) apply the
  lessons already paid for during Xero's post-ship fixes from the start,
  rather than rediscovering them: `maxDuration = 60` on both routes, every
  step after the token exchange wrapped in try/catch redirecting with the
  real error message, and (unlike jsforce's `OAuth2.requestToken()`, which
  doesn't validate state itself) an explicit state-cookie-vs-query-param
  comparison in the callback before proceeding — Xero's equivalent check
  was implicitly handled inside `openid-client`'s `apiCallback()`, so this
  had to be added explicitly here.
- **`lib/salesforce/client.ts`** eagerly calls
  `oauth2.refreshToken(storedRefreshToken)` once per invocation and
  persists the result before returning, mirroring `lib/xero/client.ts`'s
  pattern exactly — even though Salesforce doesn't rotate refresh tokens by
  default the way Xero does, an org's Connected App policy can enable
  rotation, so persisting defensively costs nothing and doesn't assume a
  behavior that could differ by org.
- **Settings UI** (`SalesforceSettings.tsx`) is connect/disconnect-status
  only in Phase A — explicitly says "quote push isn't built yet" rather
  than implying more than what's actually wired up.
- **Shipped to a preview deployment first, not merged to `main`** — the
  user asked to hold off on merging until the OAuth round-trip is
  confirmed working against a real Connected App, rather than shipping
  straight to production like every previous integration this session.

## Decision 15: Salesforce integration — Phase B (quote push)

Phase A's OAuth connect is confirmed working end-to-end on the preview
deployment (after fixing a PKCE requirement, an unused `id`/`openid` scope,
and a stale per-deployment redirect URI — see the connect flow's own commit
history on this branch). This phase adds the actual push.

Confirmed directly with the user, resolving Phase A's open questions:

- **Quotes are pushed empty — no `QuoteLineItem` rows at all.** The user's
  own existing manual convention: "usually the SFDC quotes dont have a line
  item we just name it quote 1" — Salesforce is used purely as a
  quote-number generator here, not a line-item mirror. This removes the
  `PricebookEntryId`/Product-mapping problem entirely rather than solving it.
- **The Opportunity is NOT created as Closed Won.** The user's own
  correction to my first draft of this plan: keep it open when the quote is
  pushed, and only flip to Closed Won once there's a real signal the deal
  closed — specifically, **a matching PO confirmed AND the invoice sent**.
  More accurate than rubber-stamping "won" the moment a quote goes out, and
  ties Salesforce's pipeline state to something this app already tracks
  rather than an arbitrary default.

Mechanically:

- **`lib/salesforce/accounts.ts`**: `findOrCreateSalesforceAccount` mirrors
  `lib/xero/contacts.ts`'s `findOrCreateXeroContact` exactly — check
  `clients.salesforce_account_id` first, else search by `Name`, else create,
  then persist the ID back. Same three-step shape, new cached-ID column
  (`clients.salesforce_account_id`, mirroring `clients.xero_contact_id`).
- **`pushQuotationToSalesforce`** (`app/(app)/quotes/actions.ts`) mirrors
  `pushInvoiceToXero`'s conventions exactly: never throws, returns
  `{ error? }`, records failures onto `quotations.salesforce_push_error` so
  state survives a page refresh. Creates the Account (if needed) →
  Opportunity (`StageName: "Proposal/Price Quote"`, an open stage; `CloseDate`
  from the quotation's own `valid_until`/`quote_date`; `Amount` computed from
  the local line items even though none get pushed as `QuoteLineItem` rows —
  free deal-size visibility in Salesforce reporting) → empty Quote (`Name:
  "Quote 1"`, matching the user's own convention). Retrieves the
  Salesforce-generated `QuoteNumber` and writes it back onto the quotation
  row along with the new `quotations.salesforce_opportunity_id` column.
  Unlike Xero's errors (buried in `.response.data`, needing
  `describeXeroError`), jsforce/Salesforce REST errors already carry a
  usable `.message` — no error-unwrapping helper needed here.
- **`lib/salesforce/opportunityStage.ts`**: `syncOpportunityStageForInvoice`
  is the PO-confirmed-AND-invoice-sent check. Investigated the existing
  PO-matching pipeline directly rather than assuming a hook point exists —
  it doesn't: PO-match-confirmed lives entirely as a `status = "resolved"`
  row in `unmatched_email_pos` (set by `resolveUnmatchedEmailPo`), and
  invoice status becomes `"Sent"` from three independent places
  (`setInvoiceStatus`, `refreshInvoiceFromXero`,
  `checkInvoicesAgainstXero`'s bulk loop) that don't share a chokepoint.
  Rather than duplicate the two-condition check four times, one shared
  helper is called from all four places whenever either condition can newly
  become true. It's deliberately never-throwing (writes failures onto
  `quotations.salesforce_push_error` instead) and idempotent (safe to call
  redundantly — flipping an already-Closed-Won Opportunity to Closed Won
  again is a harmless no-op), so every call site fires it unconditionally
  rather than tracking "did we already do this."
- **Two new columns**: `clients.salesforce_account_id`,
  `quotations.salesforce_opportunity_id` (`text`, matching Phase A's
  `salesforce_quote_id`'s reasoning — Salesforce IDs aren't valid UUIDs).
  The four `quotations.salesforce_*` columns from Phase A
  (`salesforce_quote_id`/`salesforce_quote_number`/`salesforce_pushed_at`/
  `salesforce_push_error`) are reused as-is.
- **Still shipped to the same unmerged branch/preview deployment, not
  `main`** — same reasoning as Phase A: confirm the actual push works
  end-to-end against the real org (in particular, whether `"Proposal/Price
  Quote"` is a valid `StageName` in this org — flagged in the code as the
  one detail most likely to need adjusting from a real Salesforce error,
  the same debugging pattern that resolved every Phase A surprise) before
  merging.

## Decision 16: Fix "same bubble" Opportunity validation error on Salesforce push

First real push attempt against the live org failed with a custom validation
rule: "Opportunity Owner and Opportunity Referrer cannot be from the same
bubble!" — Phase B's push never set either field, so Salesforce defaulted
both from the connected integration user's own record and they collided.

The user's proposed fix, confirmed directly: a **per-user** "DP Bubble"
setting (different staff belong to different bubbles and any of them might
push a quote — not a shared app-wide value like the Xero/Salesforce
connections), written into the Opportunity's **"Opportunity Owner (Custom)"**
field at push time, plus setting **"Cross-sell Opportunity"** to No/false.
"Opportunity Referrer" itself is left untouched — its existing default is
fine, the fix is just making sure Owner doesn't collide with it.

- **Both custom fields are resolved dynamically via Salesforce's `describe()`
  API, matched by their visible label, rather than hardcoded API names** —
  `lib/salesforce/opportunityFields.ts`'s `findOpportunityFieldByLabel(conn, label)`.
  Same reasoning as every other org-specific Salesforce detail this project
  has handled (Decision 5's live tax settings, Decision 14/15's live-error
  field discovery): custom field API names are unpredictable, and this avoids
  needing the user to manually look them up in Setup at all. It also means
  the Settings dropdown populates itself from Salesforce's actual live
  picklist values instead of a hand-typed list.
- **`profiles.dp_bubble` (new column)** — added to `ProfileForm.tsx`
  alongside the existing `full_name`/`title` fields, following the same
  per-user pattern (`saveProfile`'s upsert, owner-scoped RLS already in place
  on `profiles`). A new `getDpBubbleOptions()` action fetches the live
  picklist values for display; the form degrades gracefully (shows the error,
  keeps whatever's already saved) if Salesforce is unreachable, since this
  page isn't fundamentally about Salesforce.
- **`pushQuotationToSalesforce` now calls `supabase.auth.getUser()`** (it
  didn't before) to use the **acting/pushing user's** bubble, not the
  quotation's original `owner_id` — "Opportunity Owner" should reflect
  whoever is actually doing the push. Fails fast with a clear message
  ("Set your DP Bubble in Settings...") before even attempting the
  Salesforce connection if the pushing user hasn't set one.
- **Cross-sell Opportunity's "No" value is type-aware**: if the field
  describes as `boolean`, sets `false` directly; if it's a picklist, finds
  the entry whose label matches "no" case-insensitively and uses its value.
  Avoids assuming the field's shape.
- Still on the same unmerged branch/preview deployment as the rest of the
  Salesforce work — not merged to `main`.

## Decision 17: Quote number as source of truth, duplicate-push guard, indicative Opportunity naming

Follow-ups after the first successful live push:

- **`pushQuotationToSalesforce` now writes the Salesforce-generated
  `QuoteNumber` into `quotations.quote_number` itself**, not just
  `salesforce_quote_number` — this was already anticipated in
  `docs/HANDOFF.md`'s "what's next" (Salesforce as the source of truth for
  quote numbers rather than the freeform text field). No other file needed
  to change: every existing display site (`quotes/page.tsx`,
  `quotes/[id]/page.tsx`, the PDF route, `board/page.tsx`, PO review) already
  reads `quotation.quote_number` directly.
- **The quote number is now a hyperlink to the Salesforce Opportunity**
  (`${instance_url}/${salesforce_opportunity_id}`) on the quotes list and
  detail pages, via a new `lib/salesforce/instanceUrl.ts` —
  `getSalesforceInstanceUrl()` is a cheap direct read with no OAuth refresh,
  unlike `getSalesforceClientForConnection()`. On the list page this is
  added as a small separate icon rather than replacing the existing
  `/quotes/${id}` link, to avoid breaking in-app navigation to the quote
  detail page.
- **Duplicate-push guard**: `pushQuotationToSalesforce` now rejects outright
  if `salesforce_quote_id` is already set, rather than relying solely on the
  UI hiding the push button once pushed.
- **Indicative Opportunity naming**: `"{client} - {gist} - {year}"` instead
  of a generic `"{client} - Quotation"`. The gist comes from a new
  `quotations.title` field (optional, user-editable via `QuoteForm.tsx`); if
  left blank at push time, a cheap AI call
  (`lib/salesforce/generateQuotationTitle.ts`, modeled directly on the
  existing `fuzzyMatchClient.ts` pattern — `claude-haiku-4-5-20251001`,
  small `max_tokens`, hand-written JSON-schema prompt) summarizes the line
  items into a short title, persisted back onto `quotations.title` so it's
  not regenerated and is visible/editable afterward.
- **Region was considered and dropped.** The user's original ask included a
  region segment in the Opportunity name; asked where region should live
  (per-client vs per-quotation) and got redirected mid-implementation —
  explicit pushback that adding it half-thought-through (no established
  source, no valid-values list) risked more problems downstream than it
  solved. Removed entirely rather than shipping a guessed default; can be
  scoped properly as its own follow-up later.
- Still on the same unmerged branch/preview deployment — not merged to
  `main`.

## Decision 18: Live-debugged fixes to Decisions 16/17, then merged to `main`

Real-world use surfaced two more field mismatches and a delete-sync gap, all
confirmed directly against the live Salesforce org and production errors
rather than guessed:

- **Cross-sell Opportunity field label correction**: Decision 16's fix used
  the label `"Cross-sell Opportunity"`; the user checked Salesforce's Object
  Manager directly and confirmed the real label has a trailing `?` —
  `"Cross-sell Opportunity?"`. `findOpportunityFieldByLabel` match string
  updated accordingly.
- **Quote number field correction**: Decision 17 read Salesforce's standard
  `QuoteNumber` autonumber field (`0000XXXX` format), but the org's actual
  quote numbering lives in a custom field, `Custom_quote_number__c` (labeled
  "Quotation Number" in Setup, `Q-2...` format) — the one visible in the
  Salesforce UI. `pushQuotationToSalesforce` now retrieves and stores that
  field instead.
- **Delete-sync**: deleting a quotation in-app now also deletes its linked
  Salesforce Opportunity (optional per the user, but feasible so it was
  built). Took three rounds of live debugging against real user-hit errors:
  1. `conn.sobject("Opportunity").destroy()` had no try/catch — any failure
     crashed unhandled.
  2. jsforce's failure can be a thrown exception with a **lowercase,
     space-separated** message (e.g. `"entity is deleted"`) rather than
     only a structured `SaveResult.errors[0].errorCode` (e.g.
     `ENTITY_IS_DELETED`) — both paths are now normalized and checked so an
     Opportunity already deleted manually in Salesforce doesn't block the
     in-app delete.
  3. A genuine Postgres FK violation: `unmatched_email_quotes.resolved_quotation_id`
     and `unmatched_email_pos.suggested_quotation_id` both default to
     `NO ACTION` (unlike `quotation_line_items.quotation_id`'s `CASCADE` or
     `invoices.quotation_id`'s `SET NULL`, confirmed via a direct
     `information_schema` query) — `deleteQuotation` now nulls both out
     before deleting the quotation, preserving the historical intake
     records rather than blocking the delete.
  - **`deleteQuotation` converted to the never-throw `{error?}` convention**
    (matching `pushQuotationToSalesforce` and the Settings actions) — this
    was necessary, not optional polish: a thrown Server Action error is
    redacted to a generic message in production, which is why the same
    unhelpful error kept reappearing across debugging rounds even though
    the underlying causes were different each time.
- **Merged to `main`** (PR #25, merge commit `0456127`) once confirmed
  working end-to-end on the live preview. `docs/DECISIONS.md` conflict
  resolved by renumbering (this file); `types/database.types.ts` conflict
  resolved by regenerating fresh from the live schema, since Supabase
  migrations aren't git-branch-scoped and the live DB already reflected both
  branches' columns.

## Decision 19: PDF preview/download nudge instead of hard gating

`docs/HANDOFF.md`'s next-priority item asked for gating "Download PDF"
until a quotation has a real Salesforce quote number. Hard gating (blocking
the route, disabling the button) was considered and rejected by the user —
people legitimately want to preview a PDF before pushing to Salesforce, and
the PDF route already serves `Content-Disposition: inline`, so it's always
functioned as an in-tab preview rather than a forced download.

- Button relabeled from "Download PDF" to **"Preview/Download PDF"** to
  reflect what it's actually always done.
- If the quotation hasn't been pushed yet (`!salesforceQuoteId`), clicking
  shows a `confirm()` dialog warning the PDF won't have the official
  Salesforce-sourced quote number, with an option to cancel; once pushed,
  no dialog at all.
- No server-side gating added to `app/api/quotes/[id]/pdf/route.ts` — kept
  deliberately simple (nudge, not enforcement) per the user's call. Fixed
  one small independent bug while in that file: the PDF filename fell back
  to raw `quotation.quote_number` (`null` before a push, producing a
  `"null.pdf"`-ish filename); now uses the same `quote_number || id`
  fallback already used for the in-document `docNumber`.

## Decision 20: Internal notes, hide contact info on quote PDFs, invoice PDFs from Xero

Three follow-up asks from the same conversation as Decision 19:

- **Internal notes**: a new `internal_notes` column (nullable text) on both
  `quotations` and `invoices`, distinct from the existing client-facing
  `notes` field. Wired through `createQuotation`/`updateQuotation`/
  `createInvoice`/`updateInvoice`, a second textarea in `QuoteForm.tsx`/
  `InvoiceForm.tsx` labeled "Internal Notes (not shown on the PDF...)", and
  carried over in `convertQuotationToInvoice` alongside the existing
  `notes` carry-over. Deliberately **not** wired into `DocumentPdf` or the
  Xero invoice payload builder — that omission is the entire point.
- **Hide contact name/email on quotation PDFs**: `app/api/quotes/[id]/pdf/route.ts`'s
  `clients(...)` select trimmed to `name, billing_address` — `DocumentPdf`
  already guards both fields with `client.contact_name &&`/
  `client.contact_email &&`, so simply not fetching them is enough, no
  template change needed. Scoped to quotations only, per the user — billing
  address is the intended place for that detail if needed at all.
- **Invoice PDFs now come from Xero, not self-rendered**: realized
  mid-conversation that since invoices are pushed to Xero as the system of
  record, "Download PDF" should fetch Xero's own generated PDF rather than
  re-rendering one via `DocumentPdf`/`@react-pdf/renderer` — and should
  only be available once actually pushed (`xero_invoice_id` set), unlike
  quotations, since an unpushed invoice isn't a real invoice yet (no
  "preview before push" case worth supporting here). `app/api/invoices/[id]/pdf/route.ts`
  rewritten to call `xero.accountingApi.getInvoiceAsPdf(tenantId, xero_invoice_id)`
  (existing `xero-node` SDK method, confirmed directly in
  `node_modules/xero-node/dist/gen/api/accountingApi.d.ts`, reusing the
  existing `getXeroClientForConnection()`) and return a 409 if not yet
  pushed; `InvoiceActions.tsx`'s "Download PDF" is now a disabled button
  with a tooltip until `xeroInvoiceId` is set. `DocumentPdf.tsx` itself is
  left untouched (still shared with quotes) — only the invoice route
  stopped calling it.

## Decision 21: Vision/attachment extraction, multi-quote emails, and manual quotation-document import

Scoped to the quote-request pipeline only (not the PO pipeline, which is a
structural duplicate and can get the same treatment later without a
redesign — confirmed explicitly with the user). Three pieces, designed
together since the first two share one root cause:

- **Attachment vision extraction**: Gmail's `format: "full"` fetch (already
  used by `processSelectedGmailMessages`) already returns each attachment
  part's `mimeType`/`filename`/`attachmentId` — it was simply discarded by
  `decodeBody()`'s text-only walk. New `lib/email-quote/gmailAttachments.ts`
  walks the MIME tree for allowed types (matching the existing
  `uploadExternalQuoteFile` allow-list: PNG/JPG/GIF/WEBP/PDF, capped at 3
  attachments and 10MB each), then fetches bytes via
  `gmail.users.messages.attachments.get()` — a new call, but one already
  covered by the existing `gmail.readonly` OAuth scope, no reconnect
  needed — and converts them into Anthropic `image`/`document` content
  blocks (base64url → base64 re-encoding, same conversion `decodeBody()`
  already does for text parts).
- **Multi-quote-per-email**: `extractQuoteFromEmail`/
  `extractQuoteWithClientContext` now return `ExtractedQuoteRequest[]`
  instead of a single object — the prompt asks the model to identify every
  distinct quote request in the email body *and* any attachments (e.g.
  several unrelated screenshots), rather than assuming exactly one.
  `processSelectedGmailMessages`'s per-message loop now inserts one
  `unmatched_email_quotes` row per array entry instead of one per message.
  **No change was needed in `ReviewQueue.tsx`** — it already maps rows to
  cards generically, so N rows from one email just show as N cards. A new
  nullable `gmail_message_id` column was added to `unmatched_email_quotes`
  (stamped on every row from a given message) purely for traceability,
  since nothing tied multiple rows back to one source email before.
- **Model choice**: text-only extraction keeps the existing
  `claude-haiku-4-5-20251001`; when attachments are present, both
  extractors switch to `claude-sonnet-5` (vision accuracy matters enough to
  justify it, matching the same reasoning Decision 8 already used for
  `extractQuoteWithClientContext`'s Haiku→Sonnet tier) — `temperature` is
  omitted on the Sonnet path since that model rejects an explicit override,
  same known constraint as `extractQuoteWithClientContext`.
- **Manual quotation-document import** (a separate flow, not Gmail-based):
  a new `/quotes/import` page lets someone upload a PDF/image of a
  quotation built outside the app. New `extractQuotationFromDocument`
  (`lib/email-quote/`) uses its own schema/prompt — deliberately not reusing
  the quote-*request* extractor, since this document is already priced
  (line items carry `unit_price`, not just quantity) and can carry
  currency/GST/dates. New `extractQuotationFromUpload` server action
  (`quotes/actions.ts`) validates the file (same allow-list/size cap as
  above), extracts it, and does a simple case-insensitive exact-name match
  against existing clients to suggest one — nothing is written to the
  database at this step. The extracted data prefills `QuoteForm` in create
  mode (`ImportQuoteForm.tsx`) so the user reviews and explicitly saves,
  same human-in-the-loop pattern used everywhere else in this app (nothing
  is ever auto-created from an AI extraction without a save click).

## Decision 22: Externally-sourced quotations replace the invoice "external quote" flow

Realized once `/quotes/import` existed (Decision 21) that the "New Invoice"
→ "Was a quotation for this invoice generated outside the app?" → "Yes"
flow (Decision 13) was the wrong shape: it only asked for a quote number
and stored the uploaded file as an inert attachment, with every invoice
line item still typed by hand. Confirmed with the user directly: "Yes"
should instead scan the uploaded document into a real quotation (client,
line items, quote number, original file), which then goes through the
normal "Convert to invoice" button — one consistent path, not two
similar-but-different ones.

- **New `quotations.external_quote_file_path`** (nullable text) — mirrors
  `invoices.external_quote_file_path`'s naming/shape (Decision 13). Its
  mere presence *is* the "externally-sourced, scanned quotation" signal,
  no separate boolean column, same convention as `invoices.quotation_id`
  presence already meaning "came from a conversion."
- **`extractQuotationFromDocument` gained an optional `quote_number`** —
  the source document's own reference number becomes this quotation's
  number; there's no Salesforce push involved for this kind of quotation
  at all.
- **`extractQuotationFromUpload` now also uploads the file** to the
  existing private `external-quotes` bucket (same path convention as
  `uploadExternalQuoteFile`) and returns the path — the original document
  is kept on record, not discarded after extraction.
- **`pushQuotationToSalesforce` rejects outright** if
  `external_quote_file_path` is set (defense in depth — the button is also
  hidden). This kind of quotation has no real SFDC-driven number and isn't
  a normal sales-pipeline quote.
- **The quote PDF route redirects to the original file** (a signed URL
  from the `external-quotes` bucket) instead of self-rendering via
  `DocumentPdf` when `external_quote_file_path` is set — the real document
  already exists, re-typing a guess at it would be worse, not better.
- **`QuoteForm.tsx` gained an editable "Quotation number" field**, shown
  only when an external quote file is present (create, via a new
  `sourceFilePath` prop from `ImportQuoteForm`, or edit, via
  `initial.external_quote_file_path`) — otherwise `quote_number` stays
  exactly as before: never user-editable, Salesforce push is its sole
  writer (Decision 17).
- **The Decision-19 "not pushed to Salesforce yet" PDF confirm dialog is
  suppressed** for these quotations too — it would otherwise fire on every
  single one, since `salesforceQuoteId` is never set for this kind.
- **`NewInvoiceButton.tsx`'s "Yes" now navigates to `/quotes/import`**
  instead of `/invoices/new?externalQuote=yes`. Deliberately **not**
  auto-chaining straight to an invoice after saving — the user lands on
  the new quotation and clicks "Convert to invoice" themselves, keeping a
  human review step between "here's what got scanned" and "this is now a
  real invoice," consistent with every other AI-extraction flow in this
  app.
- **The old `externalQuote=yes` code path is left in place, not deleted**
  — unreachable from the UI now, but stays schema-compatible and keeps any
  already-created invoices' detail-page display (and their "Attach
  quotation file" retry control) working exactly as before. Lower risk to
  leave inert code than to touch something with real historical data
  behind it.

## Decision 23: Fix small Gmail attachments never reaching the vision extractor

Real-world test: an email with a small image attachment landed in Needs
Review with a quote whose `notes` explained it saw "no readable item
details," reasoning only from the subject line — the image never made it
to Claude at all.

Root cause, confirmed directly from Gmail API's own type docs
(`node_modules/googleapis/build/src/apis/gmail/v1.d.ts`,
`Schema$MessagePartBody`): "When present, `attachmentId` contains the ID
of an external attachment... When not present, the entire content of the
message part body is contained in the `data` field." `gmailAttachments.ts`'s
`collectAttachmentParts()` only recognized a part as a candidate when
`body.attachmentId` was present — Gmail is free to inline a small
attachment's bytes directly in `body.data` instead (exactly what a small
test image is likely to get), so that part was silently invisible: never
collected, never fetched, never sent to the model.

- `CandidateAttachment` gained an `inlineData?: string | null` alongside a
  now-optional `attachmentId` — mutually exclusive per Gmail's own
  contract.
- `collectAttachmentParts()` now accepts a part with an allowed `mimeType`
  if it has *either* `body.attachmentId` or `body.data`.
- `fetchAttachmentContentBlocks()`: only calls
  `gmail.users.messages.attachments.get()` when `attachmentId` is set;
  otherwise uses `inlineData` directly — no extra API call needed, the
  bytes are already in hand from the original `format: "full"` fetch.
- No other files changed — `processSelectedGmailMessages` just calls these
  two functions and passes the result through, indifferent to which path
  supplied the bytes.

## Decision 24: Client default payment terms drive invoice due-date defaulting

Clients often have a standard payment term (e.g. "net 30"), and the "Due
date" field on an invoice was always blank by default, requiring manual
entry every time. Added a nullable `clients.default_payment_terms_days`
column and used it to pre-fill "Due date" wherever an invoice is created.

- `ClientForm.tsx`: new "Default payment terms (days)" number field next
  to Default GST %, nullable (blank means no default).
- `InvoiceForm.tsx` (manual "New invoice" flow): when the client dropdown
  changes (or on initial load, since the first client is pre-selected),
  "Due date" is set to today + that client's `default_payment_terms_days`
  via the existing `addDaysToDateString` helper — unconditionally
  overwritten on client change, same convention already used there for
  currency/GST rate/billing address. A client with no payment terms set
  clears the field back to blank. The user can still edit the date by hand
  afterward; it's a normal controlled input.
- `convertQuotationToInvoice` (`quotes/actions.ts`): now joins
  `clients(default_payment_terms_days)` and sets the new invoice's
  `due_date` to the quotation's own `quote_date` plus that many days (same
  "base date + N days" pattern already used for `valid_until` in
  `createQuotation`), or `null` if the client has no payment terms set.
- No changes needed in `invoices/actions.ts`'s `createInvoice` — it already
  takes `due_date` verbatim from the form, which now simply arrives
  pre-filled.

## Decision 25: Multi-currency Xero invoice push

Decision 5 deliberately scoped Xero push to SGD-only in v1 — not a
technical limitation, but because this app's `exchange_rate` field on an
invoice is a manual, optional, PDF-display number with no guarantee it
matches a rate Xero would consider correct/current. That decision framed
it as a fast-follow once SGD push was proven, not a permanent cut, and it
was the next confirmed priority.

Turned out to be a very small change: the entire SGD restriction was one
guard + one hardcode in `lib/xero/buildInvoicePayload.ts`. GST/tax handling
is percentage-based against the org's configured Xero tax type, so it's
already currency-agnostic; `findOrCreateXeroContact` never touches
currency either.

- `buildInvoicePayload.ts`: replaced the `currency !== "SGD"` guard with a
  lookup against `xero-node`'s own `CurrencyCode` enum (case-insensitive),
  throwing a clear error for anything the enum doesn't recognize instead of
  letting an invalid currency string reach Xero's API opaquely.
- Added `exchange_rate` to the `InvoiceForXero` type and set it as the
  payload's `currencyRate` when present. When absent (the field is
  optional/unvalidated in `InvoiceForm.tsx`, and nullable in the DB), it's
  simply omitted — `xero-node`'s own docs say Xero falls back to its XE.com
  day rate in that case, so there was no need to add new UI validation
  requiring a rate before push; Xero already tolerates exactly the "we
  don't have a trustworthy rate" case Decision 5 was worried about.
- `pushInvoiceToXero` (`invoices/actions.ts`) now forwards
  `invoice.exchange_rate` into the payload builder call — it was already
  fetched on the invoice row but never passed through before.
- No changes needed anywhere else: no UI gates on currency existed beyond
  the guard itself (confirmed via grep), and status/invoice-number refresh
  (`refreshInvoiceFromXero`, `checkInvoicesAgainstXero`) doesn't touch
  currency.

## Decision 26: Gmail → Slack automation — auto-trigger, interactive confirm, learn-over-time

Feedback from the user's boss/colleague: quote intake "feels a bit manual."
Investigation showed most of the automation already existed and just wasn't
wired to fire itself — `gmail_connections.watched_label_id` and
`listUnprocessedGmailCandidates()`/`processSelectedGmailMessages()`
(`app/(app)/settings/actions.ts`) already did label-filtered candidate
listing and the full match/extract/insert pipeline; the only manual step
was a human clicking "Check now" in `CheckNowModal.tsx`.

Two ideas were floated (an in-Gmail AI chat widget vs. label→automatic
processing→Slack notification); the user picked the Slack direction, with
one addition — confirm/correct the suggested client right in Slack, and get
smarter over time from corrections. Confirmed early that a Slack button
can't one-click-create a finished quotation: `ExtractedQuoteRequest` items
(`lib/email-quote/extractQuoteFromEmail.ts`) only ever have
`description`/`quantity`, never a price — customers don't state pricing in
a request — so pricing always needs a human in `/review` regardless of
whether the client match was right. Slack's job is narrowed to resolving
that one repetitive question well.

- **Automatic trigger**: `app/api/cron/gmail-check/route.ts`, a Vercel Cron
  job (`vercel.json`, every 10 min) gated by the previously-vestigial
  `CRON_SECRET`. Real-time Gmail push (watch + Pub/Sub) was considered and
  set aside — genuine standing infrastructure (a topic, a webhook, a
  subscription needing renewal every 7 days) for a latency win that doesn't
  matter for quote-request emails.
- **Shared pipeline, no duplication**: extracted the core of
  `processSelectedGmailMessages` into
  `lib/email-quote/processGmailMessagesForConnection.ts` — takes the
  connection/client list as plain data instead of deriving them from a
  signed-in session, so both the existing "Check now" Server Action (thin
  wrapper now) and the session-less cron route call the exact same logic.
  Same fix applied to `insertUnmatchedQuote` (now returns the inserted row's
  id) so the cron route knows exactly which rows are new without a second
  query.
- **Slack notification + inline correction**: `lib/slack/` — a plain
  `fetch()`-based Web API client (no `@slack/*` dependency needed for two
  calls), a Block Kit message builder, and HMAC signature verification
  (`verifySlackRequest`, mirroring `lib/crypto.ts`'s existing use of Node's
  `crypto`). A new `unmatched_email_quotes` row gets a message with a
  "✅ Correct" button and a client-picker dropdown — no free-text NLU in v1,
  a dropdown is simpler to get right and still keeps the correction inside
  Slack. `app/api/slack/interactions/route.ts` receives the callback,
  verifies it, and edits the message in place (`chat.update`) — it updates
  the row's suggested client, **not** a full quotation.
- **No new Supabase table for Slack credentials**: unlike Gmail/Xero/
  Salesforce this isn't a per-end-user OAuth integration, just one
  app-level bot posting to one channel — `SLACK_BOT_TOKEN`/
  `SLACK_SIGNING_SECRET`/`SLACK_CHANNEL_ID` env vars are the right fit,
  same tier as `ANTHROPIC_API_KEY`.
- **Getting smarter over time**: new `email_client_corrections` table
  (`owner_id`, `sender_email`, `client_id`, unique per owner+sender).
  Written on every Slack confirm *and* every correction — a repeatedly-
  confirmed sender is just as trustworthy as a corrected one. Checked as a
  new **Tier 0** in `processGmailMessagesForConnection`, before the
  original 3-tier matcher (`findClientByEmail` → `fuzzyMatchClient` →
  extraction) — an exact hit here is strictly more reliable than a fresh
  guess and short-circuits the rest of the pipeline, so a corrected sender
  is deterministically matched (no AI call) from the next email onward.
  Feeding recent corrections as few-shot examples into `fuzzyMatchClient`'s
  prompt was considered for new senders but deferred — not worth doing
  against an empty table on day one.

**Follow-up, same day**: the user wanted to stay on Vercel's Hobby plan.
Confirmed (web search) that Hobby-tier Vercel Cron only allows daily
schedules — a `vercel.json` cron more frequent than that fails to deploy at
all, so the every-10-minutes schedule this decision originally shipped with
would have needed a Vercel Pro upgrade. Removed `vercel.json` and replaced
the trigger with `.github/workflows/gmail-check-cron.yml`, a GitHub Actions
scheduled workflow that just calls the same `CRON_SECRET`-gated route with
a plain `curl` — the route has no idea (and doesn't need to know) which
scheduler is calling it, so zero app code changed. Trade-off worth noting:
GitHub's scheduled workflows are best-effort (can lag under GitHub-wide
load) and auto-disable after 60 days with no commits to the repo — both
fine for this use case, but worth remembering if the automatic check
appears to have silently stopped firing. Needs two new GitHub repo-level
settings the user has to add themselves (a `CRON_SECRET` Actions secret and
an `APP_URL` Actions variable, both mirroring the same values already
required in Vercel's env vars) — documented in `docs/HANDOFF.md`.

**Second follow-up, same day**: switched notification delivery from a shared
Slack channel to DMing the Gmail connection's owner directly. Confirmed
Slack's `chat.postMessage` treats a user id exactly like a channel id in its
`channel` parameter (auto-opens a DM), so this needed no new Slack
capability — but it did surface one real bug in the original channel-only
code: `postSlackMessage` was returning the *input* channel back to the
caller instead of Slack's own response `channel` field. For a real channel
those are identical so it happened to work, but for a DM, Slack's response
`channel` is the D-prefixed conversation id — a different value than the
U-prefixed user id passed in — so the original code would have stored the
wrong id for `chat.update` to edit the message on confirm/correct. Fixed as
part of this change (`lib/slack/client.ts`).

Who to DM is resolved dynamically, not hardcoded: `resolveOwnerSlackUserId`
(`lib/slack/resolveOwnerSlackUser.ts`) looks up the Gmail connection owner's
email via Supabase Auth's admin API, then calls Slack's `users.lookupByEmail`
(new `users:read.email` bot scope) to find the matching Slack account. This
means the Slack workspace member's email must match their login email for
this app — a real constraint, but the right one for a single-owner setup,
and it means zero reconfiguration if the app is ever used by a different
person. `SLACK_CHANNEL_ID` is gone entirely.

Considered supporting a channel post *and* the DM together, since Slack
allows both — deliberately deferred: doing it well means tracking two
independent interactive Slack messages per quote (today's schema only holds
one `slack_channel_id`/`slack_message_ts` pair) and reconciling them so
resolving one doesn't leave the other showing live buttons for an
already-made decision. Worth adding if more than one person ever needs to
see/act on these; not worth the complexity for a single recipient.

**Third follow-up, same day**: manually testing `/api/cron/gmail-check` via
curl kept "redirecting" instead of returning JSON. Chased Vercel Deployment
Protection first (a real thing worth checking generally) but the project
had none configured — the actual cause was in this app's own code:
`middleware.ts`'s matcher runs `lib/supabase/middleware.ts`'s `updateSession`
on every path except static assets/images, and that function redirects any
request with no valid Supabase session cookie straight to `/login`. A curl
call (or GitHub Actions, or Slack's webhook) obviously has no session
cookie, so every legitimate call to `/api/cron/gmail-check` or
`/api/slack/interactions` was getting silently bounced to a login page
instead of ever reaching the route's own bearer-secret/HMAC-signature check
— this wasn't a testing-only inconvenience, it would have broken the real
thing too, on any environment. Fixed by excluding `api/cron` and `api/slack`
from the middleware's matcher (`middleware.ts`) — those two routes
authenticate themselves and were never meant to require a browser session.
Note: `app/api/quotes/from-email/route.ts` (the vestigial n8n-era webhook,
see `docs/HANDOFF.md`) likely has this exact same problem and has probably
never worked since this middleware was added — left alone since that route
is already flagged as unused/fine to remove, not touched here to keep this
fix scoped to the routes this feature actually needs.

## Decision 27: In-app help chatbot (simple FAQ version)

User wants a small chatbot new users can ask "how do I use this app" —
floated as an exploratory question, deliberately scoped down to a simple
FAQ bot for v1 rather than something that references a user's live data or
holds long multi-turn context (a bigger, separate project if ever needed).

Built by reusing what already existed rather than adding anything new:
- `@anthropic-ai/sdk` was already a dependency (used throughout the email
  extraction pipeline) — no new API integration.
- `app/(app)/feedback/FeedbackWidget.tsx` (a floating button → modal) was
  the exact UI shape needed, so the new widget mirrors its structure
  (`useState` for open/busy/error, a `.btn-primary` trigger button
  positioned `fixed`, `.modal-overlay`/`.modal-content` for the panel).

What's new:
- `lib/help-chat/askHelpChat.ts`: a hand-written system prompt describing
  the app's actual features in plain, end-user language (translated from
  what's in `docs/HANDOFF.md`, not copy-pasted — that file is written for
  a future dev session, file paths and decision numbers included, and
  would be a bad, confusing thing to hand an end user), plus a thin
  `askHelpChat(messages)` wrapper around `anthropic.messages.create`
  (Haiku, same model tier used for the cheaper extraction calls elsewhere
  — a plain-language FAQ answer doesn't need a bigger model).
- `app/(app)/help/actions.ts`: a `"use server"` action gated on
  `supabase.auth.getUser()` (same pattern as `feedback/actions.ts`), takes
  the running message history from the client and returns the model's
  reply. No persistence — conversation history lives only in the widget's
  React state for that page load, by design, matching the "simple" scope;
  nothing about a user's help-chat questions gets stored.
- `app/(app)/help/HelpChatWidget.tsx`: floating "Help" button
  (`.help-chat-trigger`, bottom-**left** — `.feedback-trigger` already
  occupies bottom-right) opening a chat panel; Enter sends, Shift+Enter
  makes a newline.
- Wired into `app/(app)/layout.tsx` next to `<FeedbackWidget />`, so it's
  available on every authenticated page app-wide.

## Verification
- `npx tsc --noEmit` clean.
- `npm run build` succeeds across all 27 routes with no new errors.
- Not manually clicked through in a live browser session this round (no
  authenticated session available in this environment) — worth a quick
  real check on the next live-preview pass to confirm the model's answers
  read naturally and the modal looks right end to end.

## Decision 29: Forgot password / reset password flow

Shipped `/forgot-password` and `/reset-password` pages using Supabase Auth's
built-in `resetPasswordForEmail`/`updateUser` APIs (commit `6f40d82`),
mirroring the existing login page/action pattern. Not previously logged
here — recorded retroactively.

- **`app/forgot-password/page.tsx` + `actions.ts`**: single email-input
  form; `requestPasswordReset` calls `resetPasswordForEmail(email, {
  redirectTo: `${APP_URL}/reset-password` })` and always shows the same
  message regardless of outcome ("If an account exists for that email, a
  reset link has been sent.") — deliberate, standard user-enumeration
  protection, not a bug.
- **`app/reset-password/page.tsx` + `actions.ts`**: new-password +
  confirm-password form; `updatePassword` calls
  `supabase.auth.updateUser({ password })` against the session the recovery
  link established, then signs out and redirects to `/login`.
- **`app/auth/confirm/route.ts` extended**: now also handles
  `type=recovery`, defaulting `next` to `/reset-password` instead of
  `/board` for that type.
- **`lib/supabase/middleware.ts`**: `/forgot-password` added to the
  unauthenticated-route allowlist — the same easy-to-miss gap class
  Decision 9 already hit once for `/auth/confirm`.

## Decision 30: Supabase "Reset Password" email template corrected to route through `/auth/confirm`

While verifying Decision 29's flow on the deployed site, the actual email
link Supabase sent didn't match what `/auth/confirm/route.ts` expects —
Supabase's email templates are dashboard config, not something this repo's
code controls or can verify on its own.

- **Fix applied**: the "Reset Password" template was rewritten (in the
  Supabase dashboard, not this repo) to
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
  instead of Supabase's default `{{ .ConfirmationURL }}` shape — confirmed
  working end to end afterward (account created, reset link received,
  password actually changed).
- **Still open**: the "Confirm signup" template was checked separately and
  found still the **unedited default** — it produces a bare
  `{{ .SiteURL }}/?code=...}` link, which nothing in this app handles
  (`app/page.tsx` is an unconditional `redirect("/board")` that never reads
  a `code` param). Needs the same treatment as the recovery template:
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. Not
  confirmed fixed as of this writing.
- **Also found, separately**: Supabase Auth's **Site URL**
  (Authentication → URL Configuration) was still its out-of-the-box
  `http://localhost:3000` default rather than the real deployed domain —
  the fallback destination for any link without an explicit override.
  Reset-password's explicit `redirectTo` (Decision 29) masked this for that
  one flow; Confirm-signup has no such override, so it's fully exposed to
  the wrong Site URL until that setting is corrected too.
- **Symptom that prompted this investigation**: clicking these links showed
  `http://localhost:3000/...` in the browser, sometimes
  `ERR_CONNECTION_REFUSED` and sometimes appearing to "work" — the latter
  only because a local `npm run dev` instance happened to be running
  against the same shared database at the time, not because the link was
  actually correct.
- **Also hit while re-testing**: Supabase's built-in email sender's rate
  limit — confirmed via a live Supabase auth log
  (`error_code: "over_email_send_rate_limit"`, HTTP 429 on `POST
  /recover`). It's rate-limited for testing only; a real SMTP provider
  (Authentication → Email → SMTP Settings) is needed before relying on
  these emails for real usage volume, not just occasional manual tests.

## Decision 31: `zisxldwvwwddyuorbhnb` confirmed as the staging Supabase project

`docs/HANDOFF.md` documented exactly **one** Supabase project
(`gkkwxjxdcifjuwxgdpug`), staging explicitly not yet built. While
investigating Decision 30's rate-limit error, a live Supabase auth log
surfaced a project ref — `zisxldwvwwddyuorbhnb` — not mentioned anywhere in
this repo's docs, alongside the pre-existing unrelated `Intelligent
Automation Pipeline` project (`ssbdlttcyogtcowvcbaj`) noted in
`docs/POOLS_AND_DRAWS_DESIGN.md`. **Confirmed directly: `zisxldwvwwddyuorbhnb`
is the staging Supabase project**, used to test features before they're
merged/pushed to production.

- The log that surfaced this ref had a `referer` of the real production
  domain (`dp-quotation-invoicing.vercel.app`), which read as confusing at
  first glance — flagged rather than silently resolved, since the
  discrepancy itself wasn't independently re-explained this session.
- **Practical implication**: `docs/HANDOFF.md`'s "Staging environment &
  migration workflow" section, written when staging was still just a plan
  blocked on a billing upgrade, is now stale — a staging project exists.
  Per direct instruction, `docs/HANDOFF.md` is not edited by this assistant
  going forward — see `docs/cherylhandoff.md` for the follow-up items this
  implies, including confirming which project id Vercel's Preview
  environment actually points at.
- **Independently re-verified 2026-08-05** once a Supabase MCP connection
  became available: `list_tables` against `gkkwxjxdcifjuwxgdpug` shows real
  data across all 14 tables (3 clients, 7 quotations, 57 unmatched email
  quotes, live Gmail/Xero/Salesforce connections); the same call against
  `zisxldwvwwddyuorbhnb` shows the identical schema with **0 rows in every
  table**. This confirms the mapping from data, not just the earlier log's
  `referer` field — `gkkwxjxdcifjuwxgdpug` is production,
  `zisxldwvwwddyuorbhnb` is staging. Still not confirmed: whether Vercel's
  `NEXT_PUBLIC_SUPABASE_URL` env var actually matches this for both
  Production and Preview.

## Decision 32: `/auth/confirm` no longer verifies on GET — requires a real click first

Re-testing Decision 30's reset-password fix on the deployed site produced a
new failure: the link now correctly reached the real domain, but landed on
`/login?error=That confirmation link is invalid or has expired.` instead of
`/reset-password`.

- **Root cause, researched rather than guessed**: `app/auth/confirm/route.ts`
  was a GET route handler that called `supabase.auth.verifyOtp({ type,
  token_hash })` — a one-time-use, token-consuming call — immediately on
  every GET request. Per Supabase's own community guidance (`github.com/orgs/
  supabase/discussions/28655` and related threads, checked directly via
  WebSearch/WebFetch this session), this is a known failure mode: email
  security scanners (Microsoft Defender Safe Links and equivalent features on
  other providers/Workspace domains) issue their own GET to scan a link
  *before* the real user clicks it, silently burning the token. The real
  click then correctly gets rejected as already-used/expired by Supabase —
  nothing wrong with the token generation or the template, just with
  consuming it eagerly on an unauthenticated GET.
- **Confirmed this app's overall approach was already the *correct* one** —
  `token_hash` + `verifyOtp`, not `code=` + `exchangeCodeForSession` (the
  latter is the version of this bug class that's cross-browser/cross-device
  broken by design under PKCE, per the same research). The fix here is
  narrower: stop calling the token-consuming step automatically.
- **Fix**: replaced the GET route handler with a page + server action,
  mirroring the existing `login/`, `forgot-password/`, `reset-password/`
  pattern exactly:
  - `app/auth/confirm/page.tsx` (new) — reads `token_hash`/`type`/`next`
    from `searchParams`, renders a type-aware confirmation card ("Reset
    your password" / "Confirm your account") with a single button in a
    `<form>`. No verification happens on load.
  - `app/auth/confirm/actions.ts` (new) — `confirmAuthLink(formData)` holds
    the exact same `verifyOtp`/redirect logic the old route handler had,
    now only reachable via a real form submit (a genuine click), which
    GET-only link scanners don't trigger.
  - `app/auth/confirm/route.ts` deleted.
- **No changes needed** to `lib/supabase/middleware.ts` (already allowlists
  `/auth/confirm` by path prefix) or to the Supabase email templates (same
  `token_hash`/`type` query shape, same path).
- **Verification**: `npx tsc --noEmit` and `npm run build` both clean (29
  routes, `/auth/confirm` compiles as a dynamic route). **Not yet verified
  live** — the link in the screenshot that surfaced this bug is already
  burned either way, so testing needs a freshly-requested reset email; see
  `docs/cherylhandoff.md`.

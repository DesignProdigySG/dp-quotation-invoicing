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

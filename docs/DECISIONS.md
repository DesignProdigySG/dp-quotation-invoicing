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

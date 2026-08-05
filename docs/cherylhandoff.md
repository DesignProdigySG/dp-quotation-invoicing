# Cheryl's Handoff — Open Items

Personal continuity notes across sessions — separate from `docs/HANDOFF.md`
(shared team doc, not edited by Claude per direct instruction). Whenever a
session ends with open items, they get logged here so the next session can
pick up directly instead of re-deriving context.

## Migration policy

- **One migration file per logical change** under `supabase/migrations/` —
  not batched with an unrelated change.
- Apply and test each migration on **staging** first.
- Push the **identical SQL** to **production** only once that specific
  feature has been tested and confirmed ready on staging — never push a
  migration ahead of the feature it belongs to.

## Open items as of 2026-08-04

- **Project-ref mapping now independently confirmed** (2026-08-05, via
  direct Supabase MCP access, not just the earlier log-referer inference):
  `gkkwxjxdcifjuwxgdpug` has real data across all 14 tables (3 clients, 7
  quotations, 57 unmatched email quotes, live Gmail/Xero/Salesforce
  connections) — production. `zisxldwvwwddyuorbhnb` has the identical
  schema with **0 rows in every table** — staging. What's still
  unconfirmed: whether Vercel's env vars (`NEXT_PUBLIC_SUPABASE_URL` for
  Production vs. Preview) actually point at the matching project each —
  the data itself confirms which project *is* which, not how Vercel is
  wired to them.
- Fix the "Confirm signup" Supabase email template — still the unedited
  default as of Decision 30, produces a broken `/?code=...` link.
- Fix Supabase Auth's Site URL (Authentication → URL Configuration) — still
  `http://localhost:3000` as of Decision 30.
- Consider a real SMTP provider for Supabase Auth emails — the built-in
  sender's rate limit was hit during ordinary testing (Decision 30).
- Test the password reset flow one more time end-to-end before merging
  (branch: `claude/dp-quotation-invoicing-overview-l5rpsp`) — confirm it
  still works after the Confirm-signup template / Site URL fixes above are
  applied, not just in isolation like the last test.
- **Retest reset-password again with a fresh link** after Decision 32's fix
  (`/auth/confirm` now needs a real click, no longer auto-verifies on GET) —
  the link from the last test is already burned and can't be reused.
- `docs/HANDOFF.md`'s "Staging environment & migration workflow" section is
  now stale (still describes staging as "planned, blocked on a billing
  upgrade") — needs updating by Cheryl or a future session, not this one.

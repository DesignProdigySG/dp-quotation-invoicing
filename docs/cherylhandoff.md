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

- Confirm in Vercel env vars (`NEXT_PUBLIC_SUPABASE_URL`, Production vs.
  Preview) that `gkkwxjxdcifjuwxgdpug` is really production and
  `zisxldwvwwddyuorbhnb` is really staging (Decision 31) — mapping
  confirmed by Cheryl, but the Vercel env-var wiring itself hasn't been
  independently re-verified.
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
- `docs/HANDOFF.md`'s "Staging environment & migration workflow" section is
  now stale (still describes staging as "planned, blocked on a billing
  upgrade") — needs updating by Cheryl or a future session, not this one.

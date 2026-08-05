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
- ~~Fix the "Confirm signup" Supabase email template~~ — **done 2026-08-05**,
  fixed on staging first, then production. Confirmed working end to end.
- ~~Fix Supabase Auth's Site URL~~ — **done 2026-08-05**, same as above.
- ~~Retest reset-password with a fresh link after Decision 32's fix~~ —
  **done 2026-08-05**, confirmed working on production post-merge.
- Consider a real SMTP provider for Supabase Auth emails — the built-in
  sender's rate limit was hit during ordinary testing (Decision 30). Still
  open.
- `docs/HANDOFF.md`'s "Staging environment & migration workflow" section is
  now doubly stale — it still describes staging as "planned, blocked on a
  billing upgrade," but staging is not only built, it's since moved to
  Supabase's native Git-connected branching (Decision 28, found on `main`
  when merging PR #37) rather than the manually-synced second project this
  session initially identified (Decision 31). Needs updating by Cheryl or a
  future session, not this one.
- PR #37 merged to `main` 2026-08-05 (commit `f7f6d628`) — password reset
  flow, the auth-confirm click-required fix, and Decisions 29-32 are now
  all live on production.

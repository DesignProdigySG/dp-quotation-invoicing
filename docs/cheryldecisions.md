# Cheryl's Decisions Log

Personal record of features/decisions I've made in this project, kept
separate from `docs/DECISIONS.md` (the shared, full project log) just so I
can tell my own changes apart from yuanwen's at a glance. Purely for my own
reference — not cross-referenced anywhere, not required reading for anyone
else, doesn't need to stay in sync with anything.

## 2026-08-04

- **Forgot password / reset password flow** — shipped `/forgot-password` and
  `/reset-password` pages using Supabase's `resetPasswordForEmail`/
  `updateUser`. Full detail: `docs/DECISIONS.md` Decision 29.
- **Fixed the "Reset Password" Supabase email template** — was sending a
  link in the wrong shape; corrected to route through `/auth/confirm`,
  confirmed working end to end. Full detail: `docs/DECISIONS.md` Decision 30.
- **Identified `zisxldwvwwddyuorbhnb` as the staging Supabase project** —
  resolved the project-ref confusion found in a live Supabase log. Full
  detail: `docs/DECISIONS.md` Decision 31.
- **Fixed `/auth/confirm` silently burning reset-password tokens** — email
  link scanners were consuming the one-time token before the real click;
  now requires a real button click before verifying. Full detail:
  `docs/DECISIONS.md` Decision 32.

---

Add new entries above this line as I make more changes.

# Working with live vs. staging data — ground rules

Written up after a direct request to understand what to watch for now that
real client data lives in production and a staging database exists
alongside it. See `docs/DECISIONS.md` Decision 33 for the finding that
prompted this: production and staging had already diverged, and part of
that gap was real data with zero trace in this repo.

## The two databases

- **Production**: `gkkwxjxdcifjuwxgdpug`. Real clients, quotations,
  invoices, live Gmail/Xero/Salesforce OAuth connections. Treat every write
  here as something a real person or a real accounting system downstream
  will see.
- **Staging**: `zisxldwvwwddyuorbhnb`. A Supabase-native Git-connected
  branch of the same project — see `docs/HANDOFF.md`'s "Staging environment
  & migration workflow" section for how it's wired up. Meant to receive
  every schema change first, automatically, from a push to this repo.

## Rule 1: schema changes are files, not one-off calls

Every change to the schema ships as a real migration file under
`quotation-app/supabase/migrations/`, committed to this repo. Pushing it
deploys automatically to staging (Git-connected branching, already wired
up); confirm it there, then merge to `main` to reach production the same
way. **Never** call `apply_migration`/`execute_sql` with DDL directly
against the production project id, even for something that feels too small
to bother with a file for — that's exactly how the gap below happened.

## Rule 2: don't assume staging mirrors production — check

`docs/cherylhandoff.md`'s migration policy already says "test on staging
first, push identical SQL to production only once confirmed." That policy
is sound, but trusting it blindly isn't enough — it's already been violated
once without anyone noticing until someone looked. Before relying on
staging as a safety net for any specific change, run
`mcp__Supabase__list_migrations` against both project ids and diff them.
Don't assume parity; verify it.

## Rule 3: a table with no migration file in this repo is foreign — treat it that way

This production project is shared infrastructure, not exclusively this
app's. Four real tables (`media_budgets`, `vendor_purchase_orders`,
`vendor_invoices`, `media_campaign_reconciliation` — 332 rows in
`vendor_invoices` alone) exist on production with no corresponding
migration file, no app code, and no mention in any commit on any branch.
Schema shape (`coupa_account`, `po_number`, platform-invoice reconciliation)
strongly suggests this is the EQX Coupa PO-Invoicing n8n flow from earlier
work, writing directly into this Supabase project outside git and outside
the staging pipeline entirely — not confirmed, flagged as the likely
explanation in `docs/cherylhandoff.md`'s open items for follow-up.

Practical rule: before altering, dropping, or renaming anything in a table
that doesn't have a matching file in `quotation-app/supabase/migrations/`,
find out what else writes to or depends on it first. Staging will not have
an equivalent table to fall back on for testing — that gap is real, not an
oversight to "just fix" by copying the table over without understanding why
it's there.

## Rule 4: money-enforcement work gets extra care

Specific to the client-funds ledger design in `docs/cherylhandoff.md`
("Data engineering / DevOps concerns flagged during Tier 1 design" —
carried forward here since it's exactly this kind of ground rule):

- Balance arithmetic stays in Postgres `numeric` with row-locking triggers
  for concurrent-write correctness. `lib/format.ts`'s `computeTotals` uses
  plain JS `number` and is fine for display, never as the source of truth
  for an enforced balance.
- Staging currently has **zero seed data**. Testing anything balance-related
  there needs a realistic seeded example first, not an empty schema —
  an empty table can't exercise a balance-enforcement trigger meaningfully.
- Backups are daily-only with no Point-in-Time Recovery (an optional paid
  add-on). That was judged acceptable at this project's current transaction
  volume; worth reconsidering once real enforced client money — not just
  quotations/invoices — actually lives in these tables.
- OAuth connection rows (`gmail_connections`, `xero_connections`,
  `salesforce_connections`) and Storage bucket contents don't carry over to
  staging automatically. A feature that depends on one of those needs
  reconnecting/re-uploading against staging specifically before it can be
  tested end to end there.

## Rule 5: `docs/HANDOFF.md` is not edited by Claude

Per direct instruction (recorded in Decision 31): `docs/HANDOFF.md` is the
shared team doc and isn't edited by this assistant going forward. Session
continuity notes, open items, and findings like the one in Decision 33 go in
`docs/cherylhandoff.md` instead (or a new standalone doc like this one),
never by rewriting `docs/HANDOFF.md` directly.

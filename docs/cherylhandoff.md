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

- ~~Project-ref mapping / Vercel env var wiring~~ — **fully confirmed
  2026-08-06**. `gkkwxjxdcifjuwxgdpug` has real data across all 14 tables
  (3 clients, 7 quotations, 57 unmatched email quotes, live Gmail/Xero/
  Salesforce connections) — production. `zisxldwvwwddyuorbhnb` has the
  identical schema with 0 rows — staging. Vercel's env vars are correctly
  split: `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/
  `SUPABASE_SERVICE_ROLE_KEY` all point Production → `gkkwxjxdcifjuwxgdpug`
  and Preview → `zisxldwvwwddyuorbhnb` (verified via Vercel dashboard
  screenshots). This was already done before it was even flagged as
  outstanding — `docs/HANDOFF.md`'s "⬜ Still needed" line for this is
  stale, worth fixing whenever that doc gets its next pass.
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
- ~~Management fee migration only applied to staging~~ — **done**, pushed
  to production too (2026-08-07).
- ~~Repo-wide placeholder-migration fix not on `main`~~ — **done,
  2026-08-07**: nearly every migration file before 2026-08-06 was a
  comment-only placeholder, silently breaking every fresh Supabase branch
  build (every PR preview, ever). Reconstructed real bootstrap DDL from
  production, verified it end-to-end on a disposable Supabase branch, and
  it's now on `main` via PR #38 (merged 2026-08-07). PR #38 also merged
  `clients.default_management_fee_rate` guarded `IF NOT EXISTS`, so it
  coexists cleanly with the quotation/invoice management-fee-rate feature
  on `claude/default-management-fee-rate-2kd04v`, whichever order they
  eventually reconcile in.

## Client-funds ledger — full design (2026-08-06, in progress)

Brief: replace a manual spreadsheet ledger (no enforcement, real formula
error risk) with a proper client-funds ledger — clients deposit money
against a purpose, DP draws it down over time against vendors/events,
balances enforced at draw time (not just reportable after the fact), a
per-client-configurable management fee deducted per deposit. Not yet
formalized into `docs/POOLS_AND_DRAWS_DESIGN.md` — this is the durable
record until that happens.

### Reconciliation against `docs/POOLS_AND_DRAWS_DESIGN.md`

That doc's "pool" was a **flat**, per-user money bucket with no hierarchy,
and explicitly left "does a pool relate to a client at all?" open. Confirmed
via `git merge-base --is-ancestor` that `claude/pools-and-draws-design` is
fully merged into `main`, so there's no hidden newer version — this was a
genuine gap to resolve, not a stale-branch issue.

### Resolved decisions

- **Hierarchy**: each client has its own pool; departments are sub-pools
  under it (universal — every client has this tier); each department may
  optionally have further sub-pools nested under it (Partner is the first
  real example, Equinix's Partner Marketing department). Implemented as
  **one self-referencing `pools` table** (`parent_pool_id`), not fixed
  separate tables — supports arbitrary further nesting later with no schema
  change. Deposits/drawdowns can target **any level directly** (confirmed
  against a real spreadsheet — see below), not forced through a strict
  top-down transfer chain. Each pool node's balance is independent (a
  sub-wallet model), not an automatic rollup of its children — a subtree
  "total" view is a separate query for display only.
- **Fee mechanics**: reduces the balance actually available to draw
  (a $10k deposit at 5% leaves $9.5k drawable), snapshotted onto the
  deposit at creation time (mirrors `client_billing_addresses`'
  snapshot convention) so a later client rate change never retroactively
  alters historical deposits. Rate is per-client, set at client
  creation/revisable (`clients.default_management_fee_rate`).
- **Phase 1 scope**: manual-entry only (deposits/drawdowns/transfers
  entered directly in the app). AI email-intake for drawdowns (the old
  design doc's central "draws" mechanic) is real Phase 2 work, reusing the
  PO-matching pipeline's shape once there's usage data — not in Phase 1.
- **RLS/ownership**: standard single-owner_id pattern for Phase 1, despite
  real evidence (see below) of multiple staff working one client
  relationship over time. **Known, accepted gap — not solved, deliberately
  deferred, not forgotten.**
- **GST on the management fee**: flagged as needing more thought, not
  solved. No GST-amount field designed into the ledger schema itself.

### Real-world validation — a real Equinix spreadsheet (client-provided)

Read directly (Google Sheets), not assumed. Confirmed/refined the design:

- **2% fee is exact and consistent** across every row, 2024–2026 — real
  validation of "fixed rate, per client."
- **Quotation Number + Invoice Number columns are populated for most
  deposits** — real confirmation that a deposit traces back to a specific
  quotation→invoice pair.
- **"Paid?" gates whether money counts** — some deposits are raised but not
  yet marked Paid. Confirms deposits should only count toward available
  balance once the linked invoice is actually Paid, not at invoice creation.
- **Deposits/drawdowns target the Partner (sub-pool) level directly** at
  intake — "transfer" is for *reassigning* money after the fact (real
  example: "Budget Transfer to Osman"), not the primary way money reaches a
  sub-pool.
- **Dual currency, not always at market rate** — one note: *"1 SGD = 0.7575
  USD as requested HK Entity"*, a negotiated internal rate. Design: original
  currency + amount, an SGD-normalized amount, and a manual exchange-rate
  field (mirrors `invoices.exchange_rate`, already proven in this app).
  Ideally live-rate fetching later; manual entry is fine for now — the
  negotiated rate is paid out at the same rate, so no discrepancy either way.
- **"Unknown" partner values in the sheet were a historical artifact**
  (partner-matching was introduced after some deposits already existed) —
  not a permanent case to design for. Departments that don't split into
  sub-pools simply never hit this.
- **Real finding, not in the original brief: 5 different DP staff
  (Cheryl, Yuan Wen, Yuan Wen Feng, Tabita Patricia, Isabel Gan) recorded
  transactions against this one client over time.** This is in tension with
  every table in this app being scoped to a single `owner_id`. Explicitly
  deprioritized by Cheryl ("not sure what's the best way to manage this at
  the moment but it's not the priority now") — real gap, revisit later, not
  blocking Phase 1.

### Follow-up scenarios worked through

**Ordinary invoice vs. pool deposit — still open, needs a decision before
Tier 3.** Client A pays 5k for a campaign DP runs directly (no fee, no
pool). Client B deposits 5k for future payout (fee applies). Client C does
both. "Every quotation + invoice = deposit" (the original brief's phrasing)
turned out to be an oversimplification — an ordinary Client-A-style invoice
must never become a phantom pool deposit. Four options discussed, not yet
chosen:
1. Required toggle on the invoice form ("is this a pool deposit?").
2. A separate "Record a pool deposit" flow, distinct from "New invoice."
3. Tag an invoice as a deposit *after* creation, from the invoice detail
   page (ties naturally to the Paid-status gating already designed).
4. Client-level gate (only show the deposit option at all for clients who
   have pools set up) combined with 1 or 3.
Leaning toward 3 + the gate from 4, not yet confirmed.

**A deposited amount later gets redirected to a DP-run campaign instead of
an external vendor, and the fee taken at deposit time needs rectifying.**
Resolved: `drawdowns.is_internal boolean` flags a drawdown as funding DP's
own work rather than an external vendor. A new **`pool_adjustments` table**
(signed amount, reason, optional links back to the originating
deposit/drawdown) handles the fee refund as an auditable credit entry —
deliberately *not* mutating the original deposit's stored `fee_amount`,
since editing history loses the "why" and this app's whole existing
philosophy favors auditable ledger entries over mutated values.

### Tier 1 — foundation schema (in progress)

1. ~~`clients.default_management_fee_rate`~~ — **done, pushed 2026-08-06**,
   commit `0b77e08` on `claude/dp-quotation-invoicing-overview-l5rpsp`.
   Nullable numeric, mirrors `default_gst_rate`/`default_payment_terms_days`
   exactly. `ClientForm.tsx`/`actions.ts`/`database.types.ts` all updated,
   `tsc`/`npm run build` both clean.
   **Verified 2026-08-07**: this migration's file was actually one of only
   two real (non-placeholder) migrations in the whole repo at the time —
   nearly everything before it was a comment-only marker, which meant the
   Decision 28 Git-connected branching pipeline had never actually been
   exercised end-to-end. Fixed by reconstructing real bootstrap DDL (see
   the repo-wide open item above); confirmed working via a disposable
   Supabase branch and PR #38's own Supabase Preview check going green.
2. **`pools`** (not yet built) — self-referencing hierarchy table
   (`parent_pool_id`), standard 4-policy owner_id RLS. Client-level pool
   auto-created via an `after insert on clients` trigger (mirrors this
   app's existing `set_invoice_number`-style trigger pattern), plus a
   backfill migration for existing clients.
3. **`deposits` / `drawdowns` / `pool_transfers` / `pool_adjustments`**
   (not yet built):
   ```sql
   create table public.deposits (
     id uuid primary key default gen_random_uuid(),
     owner_id uuid not null references auth.users(id) on delete cascade,
     pool_id uuid not null references public.pools(id),
     invoice_id uuid references public.invoices(id),  -- null until Tier 3
     status text not null default 'confirmed' check (status in ('pending','confirmed')),
     amount numeric not null check (amount > 0),
     currency text not null,
     sgd_amount numeric not null check (sgd_amount > 0),
     exchange_rate numeric,
     fee_rate numeric not null,
     fee_amount numeric not null,
     net_amount numeric not null,  -- sgd_amount - fee_amount
     purpose text,
     deposit_date date not null default current_date,
     created_at timestamptz not null default now()
   );

   create table public.drawdowns (
     id uuid primary key default gen_random_uuid(),
     owner_id uuid not null references auth.users(id) on delete cascade,
     pool_id uuid not null references public.pools(id),
     vendor_name text not null,       -- free text; real vendors table is Phase 2
     is_internal boolean not null default false,
     amount numeric not null check (amount > 0),
     currency text not null,
     sgd_amount numeric not null check (sgd_amount > 0),
     exchange_rate numeric,
     description text,
     drawdown_date date not null default current_date,
     notes text,
     created_at timestamptz not null default now()
   );

   create table public.pool_transfers (
     id uuid primary key default gen_random_uuid(),
     owner_id uuid not null references auth.users(id) on delete cascade,
     from_pool_id uuid not null references public.pools(id),
     to_pool_id uuid not null references public.pools(id),
     amount numeric not null check (amount > 0),
     reason text,
     transfer_date date not null default current_date,
     created_at timestamptz not null default now(),
     check (from_pool_id <> to_pool_id)
   );

   create table public.pool_adjustments (
     id uuid primary key default gen_random_uuid(),
     owner_id uuid not null references auth.users(id) on delete cascade,
     pool_id uuid not null references public.pools(id),
     amount numeric not null check (amount <> 0),  -- signed: + credit, - debit
     reason text not null,
     related_deposit_id uuid references public.deposits(id),
     related_drawdown_id uuid references public.drawdowns(id),
     created_at timestamptz not null default now()
   );
   ```
   Balance function (per-pool-node, not a subtree rollup):
   ```sql
   create or replace function public.pool_balance(p_pool_id uuid)
   returns numeric language sql stable as $$
     select
         coalesce((select sum(net_amount) from public.deposits
                    where pool_id = p_pool_id and status = 'confirmed'), 0)
       + coalesce((select sum(amount) from public.pool_transfers
                    where to_pool_id = p_pool_id), 0)
       + coalesce((select sum(amount) from public.pool_adjustments
                    where pool_id = p_pool_id), 0)
       - coalesce((select sum(amount) from public.drawdowns
                    where pool_id = p_pool_id), 0)
       - coalesce((select sum(amount) from public.pool_transfers
                    where from_pool_id = p_pool_id), 0);
   $$;
   ```
   Enforcement — a `BEFORE INSERT` trigger on `drawdowns`/`pool_transfers`/
   negative `pool_adjustments`, locking the `pools` row (`for update`)
   before recomputing balance and raising an exception on overdraw. The
   lock is what makes this correct under concurrent requests, not just
   usually correct — without it, two simultaneous drawdowns can both read a
   stale balance and both pass validation.

### Tier 2 (manual UI, not started)

Department/sub-pool management under each client; manual deposit/drawdown/
transfer recording forms; a per-pool balance view (mirrors the real
spreadsheet's Partner/Net Balance/Transaction Count summary table) — likely
the single highest-value, lowest-risk deliverable, since it's a live,
trustworthy version of a number people currently recompute by hand.

### Tier 3 (invoice integration, not started)

Resolve the still-open "ordinary invoice vs. deposit" question above, wire
a pool picker into quotation/invoice creation, deposit only counts once
`invoices.status = 'Paid'`.

### Data engineering / DevOps concerns flagged during Tier 1 design

- ~~First real migration ever git-tracked in this repo — the Decision 28
  staging pipeline has never been proven end-to-end before this~~ —
  **resolved 2026-08-07**: nearly the entire prior migration history was
  placeholder-only, which is exactly why the pipeline was unproven. Fixed
  with a real reconstructed bootstrap migration, verified on a disposable
  Supabase branch and via PR #38's own Preview check.
- `lib/format.ts`'s `computeTotals` does money math in plain JS `number` —
  fine for display, not safe as the source of truth for enforced balances.
  All enforcement math must stay in Postgres `numeric` (the trigger design
  above exists specifically because of this).
- Zero automated tests exist anywhere in this repo — recommend this feature
  be the first with real unit tests (`pool_balance`/fee logic is a pure
  function, same shape as `computeTotals`).
- Concurrency correctness (the row-lock trigger design) needs an explicit
  test on staging, not just code review — no precedent for this in the repo.
- Staging has zero seed data — realistic testing needs a seeded example
  (e.g. a simplified version of the real Equinix data), not an empty schema.
- Backup posture (`docs/HANDOFF.md`: daily-only, no PITR, judged fine "at
  this project's transaction volume") hasn't been reconsidered now that
  real enforced client money will live here.

### Next steps

1. ~~Verify Tier 1 piece 1's migration actually reached the `staging`
   branch~~ — **done 2026-08-07**, confirmed via Supabase MCP.
2. Build Tier 1 pieces 2–3 (`pools`, `deposits`/`drawdowns`/
   `pool_transfers`/`pool_adjustments`, balance function, enforcement
   trigger).
3. Decide the ordinary-invoice-vs-deposit question (4 options above) before
   starting Tier 3.
4. Once Tier 1 is confirmed solid on staging, formalize this whole section
   into `docs/POOLS_AND_DRAWS_DESIGN.md` proper (this handoff note is the
   working copy until then).

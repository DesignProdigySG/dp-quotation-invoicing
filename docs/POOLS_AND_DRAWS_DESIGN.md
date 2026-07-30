# Pools & Draws — design discussion (not yet decided, not built)

**Status: exploratory.** This captures a design conversation about a genuinely new
side of the product, not a committed plan. Nothing here has been built, and the
open questions at the bottom are real — the person who scoped this said outright
"I don't even know what's the best way to tackle it." Treat this as a strong
starting point for a future session to pressure-test and refine, not a spec to
implement blind.

## The problem

Quotations and invoices cover billing a client (money we're owed / money coming
in as a specific transaction). There's a whole other side that doesn't exist
anywhere in this app yet: once money comes in, it gets split into **pools**
(e.g. per-partner budgets, media budgets), and pools fund **draws** — vendor
reimbursement claims paid back out of a specific pool.

## Key clarifications from the conversation

- A claim is 1:1 with a pool (not split across multiple pools per claim).
- The real complexity is **temporal**: the same vendor's claims should draw from
  Pool A for a while, then Pool B later. This is a drifting assignment, not a
  static one.
- The desired behavior is for the system to **notice drift**, not just apply
  whatever the last-known assignment says. Silently trusting a stale assignment
  forever is the actual failure mode to design against.
- Claim intake should eventually cover email, WhatsApp, and manual entry, but
  **start with email only** — mirroring the ingestion pattern already proven in
  this app.
- Pools are **owned per-user**, like `clients`/`quotations` — not a shared
  org-wide singleton like `xero_connections`/`salesforce_connections`.
- Relational tables, not a graph database. Every requirement raised (vendor→pool
  assignment with history, resolving a claim to a vendor, drift detection) is a
  lookup or a foreign-key relationship — not a multi-hop traversal, which is the
  actual class of problem graph databases justify their complexity for. A graph
  layer could still be worth building later as an **additive, non-load-bearing
  relationship-exploration view** on top of the real ledger (there was real
  interest in learning/using graph tech) — but that's explicitly separate from,
  and not a prerequisite for, the transactional core below.

## Strong precedent already in this codebase

Another session built a **PO-matching pipeline** (`docs/DECISIONS.md` Decision 8,
`lib/email-po/*`, `unmatched_email_pos`, `app/(app)/review/purchase-orders/`)
that is nearly the same shape as what "draws" needs: extract structured data from
an email → match a known entity via a tiered matcher (exact → domain → AI fuzzy)
→ run a further AI match against that entity's actual candidate records → land in
a staging table for a human to resolve, never auto-finalize. Draws would follow
the same shape with vendors/pools instead of clients/documents. Also worth
reusing:
- **RLS convention**: direct `owner_id` column, four explicit per-action policies
  (matches the "per-user" ownership decision above) — see `clients`,
  `client_billing_addresses`, `gmail_connections`.
- **Review-queue convention**: an `unmatched_*` staging table (`jsonb parsed_data`,
  `status` pending/resolved/dismissed, `suggested_*_id`/`suggested_*_source`) +
  `app/(app)/review/<feature>/{page.tsx, *Queue.tsx, actions.ts}`.
- **AI-match convention**: direct Anthropic SDK calls,
  `claude-haiku-4-5-20251001`, `temperature: 0` for classification-style calls
  (note: `claude-sonnet-5` rejects an explicit `temperature` override — hit this
  bug already this session), always validate a returned id against the real
  candidate list, prefer null over a low-confidence guess.
- Migrations aren't git-tracked in this repo — applied directly via Supabase
  `apply_migration`; `docs/DECISIONS.md` is the durable source of truth for
  schema history, so document new tables there when this gets built, not in a
  migration file.

## Sketch of a possible schema (a starting point, not final)

```sql
-- Per-user money buckets (partner budgets, media budgets, etc.)
create table public.pools (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text, -- keywords/campaign/event names an AI matcher can compare claim content against
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Per-user vendors, matched against claim senders the same way clients are
-- matched against quote-request senders.
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  contact_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Vendor -> pool assignment, effective-dated ("slowly changing dimension"
-- pattern) so a vendor's claims route to whatever pool is currently assigned,
-- while preserving history of past assignments.
create table public.vendor_pool_assignments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  pool_id uuid not null references public.pools(id) on delete cascade,
  effective_from date not null default current_date,
  effective_to date, -- null = currently active
  created_at timestamptz not null default now()
);

-- The finalized ledger of money leaving a pool. Only ever inserted by a human
-- resolving an `unmatched_draws` row — never auto-created.
create table public.draws (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id),
  pool_id uuid not null references public.pools(id),
  amount numeric not null,
  description text,
  claim_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

-- Staging table for AI-parsed claims awaiting human confirmation — same shape
-- as `unmatched_email_quotes`/`unmatched_email_pos`.
create table public.unmatched_draws (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  sender_email text not null,
  sender_name text,
  subject text,
  parsed_data jsonb not null, -- {vendor_name?, amount, description, claim_date?}
  suggested_vendor_id uuid references public.vendors(id),
  suggested_vendor_source text, -- 'exact_email' | 'email_domain' | 'ai_fuzzy'
  suggested_pool_id uuid references public.pools(id), -- from the vendor's standing assignment
  ai_content_pool_id uuid references public.pools(id), -- independent AI guess from claim content, for drift comparison only
  drift_detected boolean not null default false,
  status text not null default 'pending', -- 'pending' | 'resolved' | 'dismissed'
  resolved_draw_id uuid references public.draws(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- Invoices gain a pool assignment (mirrors billing_address_id — set at
-- creation/edit, nullable).
alter table public.invoices add column pool_id uuid references public.pools(id);
```

Pool balance is deliberately **not** a stored/mutable column — compute it as
`sum(paid invoices' totals where pool_id = X) - sum(draws where pool_id = X)` at
read time, consistent with this codebase's preference for an auditable ledger
over a mutable balance field.

## Drift detection sketch

For every incoming claim, an AI independently guesses which pool the claim's
*content* suggests (ignoring the vendor's current assignment entirely), by
comparing against each pool's name/description. That guess is compared to the
vendor's actual standing assignment:

- **Agree** → apply automatically, no human needed.
- **Disagree** → that mismatch *is* the drift signal — surface to a human as
  "Vendor's current assignment says Pool A, but this claim looks like Pool B —
  override just this once, or update the standing assignment?"

Honest limitation to carry forward, not solve away: false positives (flagging
drift that isn't real) are just noise. False negatives — the AI's independent
guess happening to agree with a now-stale assignment — are the real risk, and
per-claim detection alone can't fully close that gap. Some periodic human audit
of standing assignments is still worth having as a backstop.

## What's genuinely still open

- Exact claim-intake mechanics beyond "email first" — what does a typical claim
  email actually look like (a forwarded vendor invoice? a receipt? free text)?
  That shapes how reliable extraction can be.
- Whether AI-driven drift detection is worth its complexity from day one, or
  whether a simpler v1 (just apply the vendor's standing assignment, no content
  cross-check) should ship first and drift detection comes as a fast-follow once
  there's real usage data to judge false-negative risk against.
- Whether `pools`/`vendors` need any relationship to `clients` at all (e.g. is a
  pool ever tied to a specific client, or fully independent?) — not discussed yet.
- The graph-based relationship-exploration idea (additive, not load-bearing) has
  real appetite behind it but no concrete scope yet — worth a separate
  conversation once the core ledger exists to visualize.

## Known blocker for whoever picks this up

This session's Supabase MCP connection only had access to a different, unrelated
project ("Intelligent Automation Pipeline", `ssbdlttcyogtcowvcbaj`) — not this
app's real project (`gkkwxjxdcifjuwxgdpug`). Confirm proper project access before
attempting any schema work here.

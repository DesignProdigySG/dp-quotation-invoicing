-- Client-funds ledger, Tier 1 (2 of 3): pools hierarchy + the deposit/
-- drawdown/transfer/adjustment ledger tables, balance function, and
-- overdraw-prevention trigger.
--
-- Full design and rationale: docs/cherylhandoff.md, "Client-funds ledger —
-- full design" section. Summary of what's encoded here:
--
-- - `pools` is a single self-referencing hierarchy (parent_pool_id) so a
--   client's top-level pool, its departments, and any further nesting
--   (e.g. a department's Partner sub-pool) are all the same table, with no
--   schema change needed for deeper nesting later. client_id is
--   denormalized onto every pool row (not just the root) so "all pools for
--   this client" is a plain index lookup, not a recursive CTE.
-- - Each pool node's balance is independent (a sub-wallet model), computed
--   on read by `pool_balance()` — never a stored/mutable column, matching
--   this app's existing preference for an auditable ledger over mutated
--   balance fields.
-- - `deposits`/`drawdowns`/`pool_transfers`/`pool_adjustments` mirror the
--   currency/exchange_rate handling already proven on `invoices`
--   (currency + sgd_amount + nullable manual exchange_rate).
--   `pool_adjustments` exists so a fee correction (e.g. a deposit later
--   redirected to DP-run work) is its own auditable credit/debit entry,
--   never a mutation of the original deposit's stored fee_amount.
-- - Enforcement is a BEFORE INSERT trigger on drawdowns/pool_transfers/
--   negative pool_adjustments that locks the pool row (`for update`) before
--   recomputing the balance and rejecting an overdraw. The row lock is what
--   makes this correct under concurrent requests, not just usually correct.
--
-- Not included here (deliberately out of scope for this migration): the
-- client-level pool auto-creation trigger + backfill for existing clients,
-- and any Tier 2/3 application code. Those are separate follow-up work.

create table public.pools (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  parent_pool_id uuid references public.pools(id),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_pool_id <> id)
);
create index pools_client_id_idx on public.pools using btree (client_id);
create index pools_parent_pool_id_idx on public.pools using btree (parent_pool_id);

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
create index deposits_pool_id_idx on public.deposits using btree (pool_id);

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
create index drawdowns_pool_id_idx on public.drawdowns using btree (pool_id);

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
create index pool_transfers_from_pool_id_idx on public.pool_transfers using btree (from_pool_id);
create index pool_transfers_to_pool_id_idx on public.pool_transfers using btree (to_pool_id);

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
create index pool_adjustments_pool_id_idx on public.pool_adjustments using btree (pool_id);

-- Functions + triggers

create trigger trg_pools_updated_at before update on public.pools for each row execute function public.set_updated_at();

create or replace function public.pool_balance(p_pool_id uuid)
returns numeric
language sql
stable
set search_path to 'public'
as $function$
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
$function$;

-- Shared overdraw-prevention trigger for the three ways a pool's balance can
-- go down (a drawdown, the outgoing side of a transfer, or a negative
-- adjustment). Locks the pools row before recomputing the balance so two
-- concurrent debits against the same pool can't both read a stale balance
-- and both pass validation.
create or replace function public.check_pool_balance()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_pool_id uuid;
  v_debit numeric;
  v_balance numeric;
begin
  if TG_TABLE_NAME = 'drawdowns' then
    v_pool_id := new.pool_id;
    v_debit := new.amount;
  elsif TG_TABLE_NAME = 'pool_transfers' then
    v_pool_id := new.from_pool_id;
    v_debit := new.amount;
  elsif TG_TABLE_NAME = 'pool_adjustments' then
    if new.amount >= 0 then
      return new;
    end if;
    v_pool_id := new.pool_id;
    v_debit := -new.amount;
  else
    raise exception 'check_pool_balance() is not wired for table %', TG_TABLE_NAME;
  end if;

  perform 1 from public.pools where id = v_pool_id for update;

  v_balance := public.pool_balance(v_pool_id);

  if v_balance - v_debit < 0 then
    raise exception 'Insufficient pool balance: pool % has balance %, this would debit %', v_pool_id, v_balance, v_debit;
  end if;

  return new;
end;
$function$;

create trigger trg_drawdowns_check_balance before insert on public.drawdowns for each row execute function public.check_pool_balance();
create trigger trg_pool_transfers_check_balance before insert on public.pool_transfers for each row execute function public.check_pool_balance();
create trigger trg_pool_adjustments_check_balance before insert on public.pool_adjustments for each row execute function public.check_pool_balance();

-- RLS

alter table public.pools enable row level security;
alter table public.deposits enable row level security;
alter table public.drawdowns enable row level security;
alter table public.pool_transfers enable row level security;
alter table public.pool_adjustments enable row level security;

create policy pools_select_own on public.pools for select using (owner_id = auth.uid());
create policy pools_insert_own on public.pools for insert with check (owner_id = auth.uid());
create policy pools_update_own on public.pools for update using (owner_id = auth.uid());
create policy pools_delete_own on public.pools for delete using (owner_id = auth.uid());

create policy deposits_select_own on public.deposits for select using (owner_id = auth.uid());
create policy deposits_insert_own on public.deposits for insert with check (owner_id = auth.uid());
create policy deposits_update_own on public.deposits for update using (owner_id = auth.uid());
create policy deposits_delete_own on public.deposits for delete using (owner_id = auth.uid());

create policy drawdowns_select_own on public.drawdowns for select using (owner_id = auth.uid());
create policy drawdowns_insert_own on public.drawdowns for insert with check (owner_id = auth.uid());
create policy drawdowns_update_own on public.drawdowns for update using (owner_id = auth.uid());
create policy drawdowns_delete_own on public.drawdowns for delete using (owner_id = auth.uid());

create policy pool_transfers_select_own on public.pool_transfers for select using (owner_id = auth.uid());
create policy pool_transfers_insert_own on public.pool_transfers for insert with check (owner_id = auth.uid());
create policy pool_transfers_update_own on public.pool_transfers for update using (owner_id = auth.uid());
create policy pool_transfers_delete_own on public.pool_transfers for delete using (owner_id = auth.uid());

create policy pool_adjustments_select_own on public.pool_adjustments for select using (owner_id = auth.uid());
create policy pool_adjustments_insert_own on public.pool_adjustments for insert with check (owner_id = auth.uid());
create policy pool_adjustments_update_own on public.pool_adjustments for update using (owner_id = auth.uid());
create policy pool_adjustments_delete_own on public.pool_adjustments for delete using (owner_id = auth.uid());

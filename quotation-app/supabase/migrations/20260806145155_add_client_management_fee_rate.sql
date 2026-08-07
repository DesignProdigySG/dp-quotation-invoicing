-- Client-funds ledger, Tier 1 (1 of 3): per-client management fee rate.
--
-- Nullable by design: a client with no rate set simply can't have deposits
-- recorded against it yet (Tier 2+) -- a natural forcing function rather
-- than silently defaulting to 0% or some other guessed rate. Mirrors
-- default_gst_rate / default_payment_terms_days exactly; no RLS change
-- needed since this only adds a column to the already-RLS-enabled clients
-- table.
--
-- Guarded with IF NOT EXISTS: branch claude/default-management-fee-rate-2kd04v
-- (quotation/invoice management-fee splitting) independently adds the same
-- column for the same underlying concept -- a client's management fee % --
-- just consumed differently there (a quotation/invoice line-item split vs.
-- a ledger deposit deduction here). That branch's migration already ran
-- against staging/production directly. Whichever migration lands first on
-- a given database creates the column; the other becomes a harmless no-op
-- instead of erroring on "column already exists".
alter table public.clients
  add column if not exists default_management_fee_rate numeric;

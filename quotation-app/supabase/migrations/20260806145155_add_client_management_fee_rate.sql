-- Client-funds ledger, Tier 1 (1 of 3): per-client management fee rate.
--
-- Nullable by design: a client with no rate set simply can't have deposits
-- recorded against it yet (Tier 2+) -- a natural forcing function rather
-- than silently defaulting to 0% or some other guessed rate. Mirrors
-- default_gst_rate / default_payment_terms_days exactly; no RLS change
-- needed since this only adds a column to the already-RLS-enabled clients
-- table.
alter table public.clients
  add column default_management_fee_rate numeric;

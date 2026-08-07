-- Per-client default management fee rate, plus per-document apply/rate
-- state on quotations and invoices, and a marker on line items so the
-- generated management-fee line can be found and reversed without relying
-- on its description text.
--
-- `clients.default_management_fee_rate` is guarded with IF NOT EXISTS: PR #38
-- (branch claude/dp-quotation-invoicing-overview-l5rpsp, the client-funds
-- ledger work) independently adds the same column for the same underlying
-- concept -- a client's management fee % -- just consumed differently (a
-- ledger deposit deduction there vs. a quotation/invoice line-item split
-- here). Whichever migration lands first on a given database creates the
-- column; the other becomes a harmless no-op instead of erroring on
-- "column already exists", so this doesn't depend on merge order.
alter table public.clients
  add column if not exists default_management_fee_rate numeric;

alter table public.quotations
  add column management_fee_rate numeric,
  add column management_fee_applied boolean not null default false;

alter table public.invoices
  add column management_fee_rate numeric,
  add column management_fee_applied boolean not null default false;

alter table public.quotation_line_items
  add column is_management_fee boolean not null default false;

alter table public.invoice_line_items
  add column is_management_fee boolean not null default false;

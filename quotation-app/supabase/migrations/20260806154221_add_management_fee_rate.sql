-- Per-client default management fee rate, plus per-document apply/rate
-- state on quotations and invoices, and a marker on line items so the
-- generated management-fee line can be found and reversed without relying
-- on its description text.
alter table public.clients
  add column default_management_fee_rate numeric;

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

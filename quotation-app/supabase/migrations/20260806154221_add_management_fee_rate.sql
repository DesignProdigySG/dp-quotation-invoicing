-- Per-client default management fee rate, plus per-document apply/rate
-- state on quotations and invoices, and a marker on line items so the
-- generated management-fee line can be found and reversed without relying
-- on its description text.
--
-- Every column here is guarded with IF NOT EXISTS, for two independent
-- reasons:
-- 1. `clients.default_management_fee_rate` collides with PR #38 (branch
--    claude/dp-quotation-invoicing-overview-l5rpsp, the client-funds ledger
--    work), which independently adds the same column for the same
--    underlying concept -- a client's management fee % -- just consumed
--    differently (a ledger deposit deduction there vs. a quotation/invoice
--    line-item split here).
-- 2. This whole file was already applied directly to staging and production
--    via the Supabase MCP server ahead of merging, which records it under
--    an execution-timestamp version rather than this file's own
--    20260806154221 prefix. When this file lands on `main`, the
--    Git-connected deploy pipeline won't see a matching recorded version
--    and will try to run it again -- IF NOT EXISTS makes that a no-op
--    instead of a "column already exists" failure.
alter table public.clients
  add column if not exists default_management_fee_rate numeric;

alter table public.quotations
  add column if not exists management_fee_rate numeric,
  add column if not exists management_fee_applied boolean not null default false;

alter table public.invoices
  add column if not exists management_fee_rate numeric,
  add column if not exists management_fee_applied boolean not null default false;

alter table public.quotation_line_items
  add column if not exists is_management_fee boolean not null default false;

alter table public.invoice_line_items
  add column if not exists is_management_fee boolean not null default false;

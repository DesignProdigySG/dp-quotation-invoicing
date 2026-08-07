-- Real bootstrap DDL, reconstructed 2026-08-07 from the live production
-- schema (project gkkwxjxdcifjuwxgdpug) via direct Supabase MCP
-- introspection (information_schema/pg_catalog: columns, constraints,
-- indexes, RLS policies, functions, triggers, sequences).
--
-- This file used to be a placeholder comment-only marker. That was fine for
-- production/staging (their supabase_migrations.schema_migrations already
-- records this version as applied, so this content never re-runs there),
-- but it silently broke every *fresh* branch build (e.g. a new PR preview):
-- replaying an all-comments history against an empty database never
-- created `clients` or any other table, so the first real ALTER TABLE
-- migration after this one (2026-08-06's management-fee-rate migrations)
-- failed with "relation does not exist". This file now contains real,
-- runnable DDL reproducing that base schema, so fresh branches work again.
--
-- Deliberately excludes anything added by migrations dated 2026-08-06 or
-- later (e.g. management_fee_rate/default_management_fee_rate) — those
-- already have their own real migration files layered on top of this one.
create extension if not exists pgcrypto;

create sequence if not exists public.quote_number_seq;
create sequence if not exists public.invoice_number_seq;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  default_currency text not null default 'SGD',
  default_gst_rate numeric not null default 9.00,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  billing_address text,
  display_currency_preference text not null default 'original',
  ai_instructions text,
  xero_contact_id uuid,
  salesforce_account_id text,
  default_payment_terms_days integer
);

create table public.client_billing_addresses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  label text not null,
  address text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index client_billing_addresses_client_id_idx on public.client_billing_addresses using btree (client_id);
create unique index client_billing_addresses_client_id_label_key on public.client_billing_addresses using btree (client_id, lower(label));

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  quote_number text unique,
  quote_date date not null default current_date,
  currency text not null default 'SGD',
  gst_rate numeric not null default 9.00,
  status text not null default 'Draft' check (status = any (array['Draft'::text, 'Sent'::text, 'Accepted'::text, 'Invoiced'::text])),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  gst_applicable boolean not null default true,
  exchange_rate numeric,
  display_currency text not null default 'original',
  billing_address_id uuid references public.client_billing_addresses(id) on delete set null,
  billing_address text,
  valid_until date,
  salesforce_quote_id text,
  salesforce_quote_number text,
  salesforce_pushed_at timestamptz,
  salesforce_push_error text,
  salesforce_opportunity_id text,
  title text,
  internal_notes text,
  external_quote_file_path text
);

create table public.quotation_line_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  description text not null,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  sort_order integer not null default 0
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  quotation_id uuid references public.quotations(id) on delete set null,
  client_id uuid not null references public.clients(id) on delete restrict,
  invoice_number text unique,
  invoice_date date not null default current_date,
  due_date date,
  currency text not null default 'SGD',
  gst_rate numeric not null default 9.00,
  status text not null default 'Draft' check (status = any (array['Draft'::text, 'Sent'::text, 'Paid'::text])),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  gst_applicable boolean not null default true,
  reference text,
  exchange_rate numeric,
  display_currency text not null default 'original',
  billing_address_id uuid references public.client_billing_addresses(id) on delete set null,
  billing_address text,
  xero_invoice_id uuid,
  xero_status text,
  xero_pushed_at timestamptz,
  xero_push_error text,
  xero_idempotency_key uuid,
  external_quote_status text check (external_quote_status = any (array['has_external_quote'::text, 'no_quote'::text])),
  external_quote_number text,
  external_quote_file_path text,
  internal_notes text
);
create unique index invoices_xero_invoice_id_key on public.invoices using btree (xero_invoice_id) where (xero_invoice_id is not null);

create table public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  sort_order integer not null default 0
);

create table public.unmatched_email_quotes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  sender_email text not null,
  sender_name text,
  subject text,
  parsed_data jsonb not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_quotation_id uuid references public.quotations(id),
  suggested_client_id uuid references public.clients(id),
  suggested_client_source text,
  gmail_message_id text,
  slack_channel_id text,
  slack_message_ts text
);

create table public.unmatched_email_pos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  sender_email text not null,
  sender_name text,
  subject text,
  parsed_data jsonb not null,
  status text not null default 'pending',
  suggested_client_id uuid references public.clients(id),
  suggested_client_source text,
  suggested_invoice_id uuid references public.invoices(id),
  resolved_at timestamptz,
  resolved_invoice_id uuid references public.invoices(id),
  created_at timestamptz not null default now(),
  suggested_invoice_source text,
  suggested_quotation_id uuid references public.quotations(id)
);

create table public.gmail_connections (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  refresh_token_encrypted text not null,
  watched_label_id text,
  watched_label_name text,
  processed_label_id text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  po_watched_label_id text,
  po_watched_label_name text,
  po_last_checked_at timestamptz
);

create table public.profiles (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  signature_path text,
  dp_bubble text
);

create table public.xero_connections (
  id integer primary key default 1 check (id = 1),
  tenant_id text,
  tenant_name text,
  refresh_token_encrypted text,
  gst_tax_type text,
  gst_tax_rate numeric,
  no_gst_tax_type text,
  default_account_code text,
  connected_by uuid references auth.users(id),
  connected_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.salesforce_connections (
  id integer primary key default 1 check (id = 1),
  instance_url text,
  refresh_token_encrypted text,
  connected_by uuid references auth.users(id),
  connected_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  submitted_by_email text not null,
  message text not null,
  page_path text,
  image_paths text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.email_client_corrections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  sender_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, sender_email)
);

-- Functions + triggers

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

create or replace function public.set_quote_number()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.quote_number is null then
    new.quote_number := 'Q-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.quote_number_seq')::text, 4, '0');
  end if;
  return new;
end;
$function$;

create or replace function public.set_invoice_number()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.invoice_number is null then
    new.invoice_number := 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 4, '0');
  end if;
  return new;
end;
$function$;

create trigger trg_clients_updated_at before update on public.clients for each row execute function public.set_updated_at();
create trigger trg_email_client_corrections_updated_at before update on public.email_client_corrections for each row execute function public.set_updated_at();
create trigger trg_invoices_updated_at before update on public.invoices for each row execute function public.set_updated_at();
create trigger trg_set_invoice_number before insert on public.invoices for each row execute function public.set_invoice_number();
create trigger trg_quotations_updated_at before update on public.quotations for each row execute function public.set_updated_at();
create trigger trg_set_quote_number before insert on public.quotations for each row execute function public.set_quote_number();

-- RLS

alter table public.clients enable row level security;
alter table public.client_billing_addresses enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_line_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.unmatched_email_quotes enable row level security;
alter table public.unmatched_email_pos enable row level security;
alter table public.gmail_connections enable row level security;
alter table public.profiles enable row level security;
alter table public.xero_connections enable row level security;
alter table public.salesforce_connections enable row level security;
alter table public.feedback enable row level security;
alter table public.email_client_corrections enable row level security;

create policy clients_select_own on public.clients for select using (owner_id = auth.uid());
create policy clients_insert_own on public.clients for insert with check (owner_id = auth.uid());
create policy clients_update_own on public.clients for update using (owner_id = auth.uid());
create policy clients_delete_own on public.clients for delete using (owner_id = auth.uid());

create policy client_billing_addresses_select_own on public.client_billing_addresses for select using (owner_id = auth.uid());
create policy client_billing_addresses_insert_own on public.client_billing_addresses for insert with check (owner_id = auth.uid());
create policy client_billing_addresses_update_own on public.client_billing_addresses for update using (owner_id = auth.uid());
create policy client_billing_addresses_delete_own on public.client_billing_addresses for delete using (owner_id = auth.uid());

create policy quotations_select_own on public.quotations for select using (owner_id = auth.uid());
create policy quotations_insert_own on public.quotations for insert with check (owner_id = auth.uid());
create policy quotations_update_own on public.quotations for update using (owner_id = auth.uid());
create policy quotations_delete_own on public.quotations for delete using (owner_id = auth.uid());

create policy qli_select_own on public.quotation_line_items for select using (exists (select 1 from public.quotations q where q.id = quotation_line_items.quotation_id and q.owner_id = auth.uid()));
create policy qli_insert_own on public.quotation_line_items for insert with check (exists (select 1 from public.quotations q where q.id = quotation_line_items.quotation_id and q.owner_id = auth.uid()));
create policy qli_update_own on public.quotation_line_items for update using (exists (select 1 from public.quotations q where q.id = quotation_line_items.quotation_id and q.owner_id = auth.uid()));
create policy qli_delete_own on public.quotation_line_items for delete using (exists (select 1 from public.quotations q where q.id = quotation_line_items.quotation_id and q.owner_id = auth.uid()));

create policy invoices_select_own on public.invoices for select using (owner_id = auth.uid());
create policy invoices_insert_own on public.invoices for insert with check (owner_id = auth.uid());
create policy invoices_update_own on public.invoices for update using (owner_id = auth.uid());
create policy invoices_delete_own on public.invoices for delete using (owner_id = auth.uid());

create policy ili_select_own on public.invoice_line_items for select using (exists (select 1 from public.invoices i where i.id = invoice_line_items.invoice_id and i.owner_id = auth.uid()));
create policy ili_insert_own on public.invoice_line_items for insert with check (exists (select 1 from public.invoices i where i.id = invoice_line_items.invoice_id and i.owner_id = auth.uid()));
create policy ili_update_own on public.invoice_line_items for update using (exists (select 1 from public.invoices i where i.id = invoice_line_items.invoice_id and i.owner_id = auth.uid()));
create policy ili_delete_own on public.invoice_line_items for delete using (exists (select 1 from public.invoices i where i.id = invoice_line_items.invoice_id and i.owner_id = auth.uid()));

create policy unmatched_email_quotes_select_own on public.unmatched_email_quotes for select to authenticated using (owner_id = auth.uid());
create policy unmatched_email_quotes_update_own on public.unmatched_email_quotes for update to authenticated using (owner_id = auth.uid());

create policy "owner can manage their unmatched POs" on public.unmatched_email_pos for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "owner manages own gmail connection" on public.gmail_connections for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "owner manages own profile" on public.profiles for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "authenticated can manage the shared xero connection" on public.xero_connections for all to authenticated using (true) with check (true);

create policy "shared salesforce connection" on public.salesforce_connections for all to authenticated using (true) with check (true);

create policy "submit own feedback" on public.feedback for insert to authenticated with check (owner_id = auth.uid());
create policy "only the app owner can read feedback" on public.feedback for select to authenticated using (auth.email() = 'yuanwen@dp.sg');

create policy email_client_corrections_select_own on public.email_client_corrections for select using (owner_id = auth.uid());
create policy email_client_corrections_insert_own on public.email_client_corrections for insert with check (owner_id = auth.uid());
create policy email_client_corrections_update_own on public.email_client_corrections for update using (owner_id = auth.uid());
create policy email_client_corrections_delete_own on public.email_client_corrections for delete using (owner_id = auth.uid());

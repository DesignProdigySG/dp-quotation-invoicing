-- Salesforce integration is being removed (nobody checks it after a quote is
-- pushed; see docs/DECISIONS.md). quote_number already self-generates via
-- trg_set_quote_number/set_quote_number() — pushQuotationToSalesforce was
-- just overwriting that value afterward with Salesforce's own number.
--
-- To keep new quote numbers visually continuous with the Salesforce-era
-- ones (confirmed live: Q-2608902 .. Q-2608910, a flat 7-digit integer
-- incrementing by 1, no year/date encoding), fast-forward the existing
-- sequence and switch the trigger function's format to match.

select setval('public.quote_number_seq', 2608910, true);

create or replace function public.set_quote_number()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.quote_number is null then
    new.quote_number := 'Q-' || lpad(nextval('public.quote_number_seq')::text, 7, '0');
  end if;
  return new;
end;
$function$;

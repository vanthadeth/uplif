-- Exchange rates for payroll: 1 unit of a currency = rate_home units of the company's home currency, from a date.
create table public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  rate_home numeric(18,8) not null check (rate_home > 0),
  effective_date date not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (company_id, currency_code, effective_date)
);
alter table public.exchange_rates enable row level security;
alter table public.exchange_rates force row level security;
create policy exchange_rates_read on public.exchange_rates for select to authenticated
  using (company_id = (select app.company_id()) and (select app.payroll_can('payroll.settings.manage') or app.payroll_can_prepare()));
revoke all on public.exchange_rates from anon, authenticated;
grant select on public.exchange_rates to authenticated;

create function app.rate_for(p_company uuid, p_code text, p_on date) returns numeric
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.company_currencies where company_id = p_company and code = p_code and is_home) then 1::numeric
    else (select rate_home from public.exchange_rates where company_id = p_company and currency_code = p_code and effective_date <= p_on order by effective_date desc limit 1)
  end
$$;
revoke all on function app.rate_for(uuid, text, date) from public, anon, authenticated;

-- A new payslip takes the rate in force today unless one is given; none known leaves it empty.
create function app.payslips_fill_rate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.rate_home is null then new.rate_home := app.rate_for(new.company_id, new.currency_code, current_date); end if;
  return new;
end $$;
create trigger payslips_fill_rate before insert on public.payslips for each row execute function app.payslips_fill_rate();

create function public.payroll_rate_set(p_currency text, p_rate numeric, p_date date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); c text := upper(btrim(coalesce(p_currency, ''))); rid uuid;
begin
  if not app.payroll_can('payroll.settings.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  if c !~ '^[A-Z]{3}$' or p_rate is null or p_rate <= 0 or p_date is null then raise exception 'payroll: reason' using errcode = 'P0001'; end if;
  if exists (select 1 from public.company_currencies where company_id = cid and code = c and is_home) then raise exception 'payroll: reason' using errcode = 'P0001'; end if;
  insert into public.exchange_rates (company_id, currency_code, rate_home, effective_date, created_by)
  values (cid, c, p_rate, p_date, app.membership_id())
  on conflict (company_id, currency_code, effective_date) do update set rate_home = excluded.rate_home, created_by = excluded.created_by
  returning id into rid;
  perform app.payroll_event(null, 'rate.set', jsonb_build_object('currency', c, 'rate', p_rate, 'date', p_date));
  return rid;
end $$;
revoke all on function public.payroll_rate_set(text, numeric, date) from public, anon;
grant execute on function public.payroll_rate_set(text, numeric, date) to authenticated;

create function public.payroll_rate_delete(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id();
begin
  if not app.payroll_can('payroll.settings.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from public.exchange_rates where id = p_id and company_id = cid;
  if not found then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  perform app.payroll_event(null, 'rate.delete', jsonb_build_object('rate_id', p_id));
end $$;
revoke all on function public.payroll_rate_delete(uuid) from public, anon;
grant execute on function public.payroll_rate_delete(uuid) to authenticated;

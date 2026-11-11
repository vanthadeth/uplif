-- Migration 17: subscription invoices for the super-admin app. Payments are recorded by hand for now.
-- Same pattern as migration 16: the table is closed (RLS forced, no grants) and only the platform_* functions
-- below can touch it. Each one checks app.assert_platform_admin() first and writes to the append-only platform log.
-- Invoices hold account facts only (who, plan, amount, dates). They never contain a company's business data.

create sequence public.invoice_number_seq;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  owner_user_id uuid not null references public.subscriptions (owner_user_id) on delete restrict,
  plan_id uuid not null references public.plans (id),
  plan_name text not null,
  cycle text not null check (cycle in ('month', 'year')),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'open' check (status in ('open', 'paid', 'void')),
  due_date date not null,
  issued_at timestamptz not null default now(),
  paid_at date,
  payment_method text check (payment_method in ('bank_transfer', 'khqr', 'cash', 'other')),
  payment_ref text check (payment_ref is null or length(payment_ref) <= 120),
  voided_at timestamptz,
  check ((status = 'paid') = (paid_at is not null and payment_method is not null)),
  check ((status = 'void') = (voided_at is not null))
);
create index invoices_owner_idx on public.invoices (owner_user_id, issued_at desc);
create index invoices_status_due_idx on public.invoices (status, due_date);
-- One open invoice per account at a time: settle or void it before issuing the next.
create unique index invoices_one_open_per_owner on public.invoices (owner_user_id) where status = 'open';

alter table public.invoices enable row level security;
alter table public.invoices force row level security;
revoke all on public.invoices from public, anon, authenticated;
revoke all on sequence public.invoice_number_seq from public, anon, authenticated;

-- A paid or voided invoice is a record: it cannot be edited or deleted, even by the table owner.
create function app.invoice_settled_is_final() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'invoices cannot be deleted' using errcode = '42501';
  end if;
  if old.status <> 'open' then
    raise exception 'a paid or void invoice cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger invoices_final before update or delete on public.invoices
  for each row execute function app.invoice_settled_is_final();

-- ---------- list ----------
-- "overdue" is derived (open and past its due date), so it never goes stale.
create function public.platform_list_invoices()
returns table (id uuid, number text, owner_user_id uuid, owner_name text, owner_email text, plan_name text, cycle text,
               period_start date, period_end date, amount_cents integer, status text, due_date date, issued_at timestamptz,
               paid_at date, payment_method text, payment_ref text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.assert_platform_admin();
  return query
    select i.id, i.number, i.owner_user_id, p.full_name, u.email::text, i.plan_name, i.cycle, i.period_start, i.period_end,
           i.amount_cents,
           case when i.status = 'open' and i.due_date < current_date then 'overdue' else i.status end,
           i.due_date, i.issued_at, i.paid_at, i.payment_method, i.payment_ref
    from public.invoices i
    left join auth.users u on u.id = i.owner_user_id
    left join public.profiles p on p.user_id = i.owner_user_id
    order by i.issued_at desc, i.number desc;
end $$;

-- ---------- issue ----------
-- Bills the account's current plan and cycle for the next period, due in p_due_days days.
create function public.platform_issue_invoice(p_owner uuid, p_due_days integer default 7) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := app.assert_platform_admin();
  s public.subscriptions;
  pl public.plans;
  amount integer;
  pstart date := current_date;
  pend date;
  inv_id uuid;
  num text;
begin
  if p_due_days is null or p_due_days < 0 or p_due_days > 90 then raise exception 'due days must be 0 to 90' using errcode = '22023'; end if;
  select * into s from public.subscriptions where owner_user_id = p_owner for update;
  if not found then raise exception 'subscriber not found' using errcode = 'P0002'; end if;
  if s.status = 'suspended' then raise exception 'this account is suspended' using errcode = 'P0001'; end if;
  if exists (select 1 from public.invoices where owner_user_id = p_owner and status = 'open') then
    raise exception 'settle or void the open invoice first' using errcode = 'P0001';
  end if;
  select * into pl from public.plans where id = s.plan_id;
  amount := case s.cycle when 'month' then pl.price_month_cents else pl.price_year_cents end;
  if amount is null then raise exception 'this plan has no price for the cycle' using errcode = 'P0001'; end if;
  pend := case s.cycle when 'month' then (pstart + interval '1 month')::date - 1 else (pstart + interval '1 year')::date - 1 end;
  num := 'UP-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 4, '0');
  insert into public.invoices (number, owner_user_id, plan_id, plan_name, cycle, period_start, period_end, amount_cents, due_date)
    values (num, p_owner, pl.id, pl.name, s.cycle, pstart, pend, amount, current_date + p_due_days)
    returning id into inv_id;
  update public.subscriptions set next_invoice_at = (pend + 1)::timestamptz where owner_user_id = p_owner;
  perform app.platform_write_log(admin, 'invoice.issue', p_owner,
    jsonb_build_object('number', num, 'amount_cents', amount, 'plan', pl.name, 'cycle', s.cycle));
  return inv_id;
end $$;

-- ---------- mark paid ----------
-- Recorded by hand. A past-due account returns to active once nothing else is overdue.
create function public.platform_mark_invoice_paid(p_id uuid, p_method text, p_ref text default null, p_paid_on date default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := app.assert_platform_admin();
  i public.invoices;
  on_day date := coalesce(p_paid_on, current_date);
begin
  if p_method is null or p_method not in ('bank_transfer', 'khqr', 'cash', 'other') then
    raise exception 'choose how it was paid' using errcode = '22023';
  end if;
  if on_day > current_date then raise exception 'the payment date cannot be in the future' using errcode = '22023'; end if;
  select * into i from public.invoices where id = p_id for update;
  if not found then raise exception 'invoice not found' using errcode = 'P0002'; end if;
  if i.status <> 'open' then raise exception 'only an open invoice can be marked as paid' using errcode = 'P0001'; end if;
  update public.invoices set status = 'paid', paid_at = on_day, payment_method = p_method, payment_ref = nullif(btrim(p_ref), '') where id = p_id;
  update public.subscriptions set status = 'active'
    where owner_user_id = i.owner_user_id and status = 'past_due'
      and not exists (select 1 from public.invoices o where o.owner_user_id = i.owner_user_id and o.status = 'open' and o.due_date < current_date);
  perform app.platform_write_log(admin, 'invoice.paid', i.owner_user_id,
    jsonb_build_object('number', i.number, 'amount_cents', i.amount_cents, 'method', p_method, 'paid_on', on_day));
end $$;

-- ---------- void ----------
create function public.platform_void_invoice(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := app.assert_platform_admin();
  i public.invoices;
begin
  select * into i from public.invoices where id = p_id for update;
  if not found then raise exception 'invoice not found' using errcode = 'P0002'; end if;
  if i.status <> 'open' then raise exception 'only an open invoice can be voided' using errcode = 'P0001'; end if;
  update public.invoices set status = 'void', voided_at = now() where id = p_id;
  perform app.platform_write_log(admin, 'invoice.void', i.owner_user_id, jsonb_build_object('number', i.number, 'amount_cents', i.amount_cents));
end $$;

revoke all on function
  public.platform_list_invoices(), public.platform_issue_invoice(uuid, integer),
  public.platform_mark_invoice_paid(uuid, text, text, date), public.platform_void_invoice(uuid)
  from public, anon;
grant execute on function
  public.platform_list_invoices(), public.platform_issue_invoice(uuid, integer),
  public.platform_mark_invoice_paid(uuid, text, text, date), public.platform_void_invoice(uuid)
  to authenticated;

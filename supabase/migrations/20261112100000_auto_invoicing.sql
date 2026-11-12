-- Migration 21: automatic invoicing.
-- A daily job (01:00 UTC) issues the next invoice for every active or past-due account whose billing date has come
-- and that has no open invoice, using exactly the same rules as issuing by hand. It also marks an active account
-- "past due" once an open invoice is past its due date. It never suspends an account and never touches trials:
-- what happens when a trial ends is still the owner's decision. Payments are still recorded by hand, and a payment
-- returns a past-due account to active (migration 17).
-- System actions are logged with the nil UUID as the actor, which the admin app shows as "System".

-- ---------- one issuing routine, used by the admin button and by the job ----------
create function app.issue_invoice(p_owner uuid, p_due_days integer, p_actor uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
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
  perform app.platform_write_log(p_actor, 'invoice.issue', p_owner,
    jsonb_build_object('number', num, 'amount_cents', amount, 'plan', pl.name, 'cycle', s.cycle)
      || case when p_actor = '00000000-0000-0000-0000-000000000000'::uuid then jsonb_build_object('auto', true) else '{}'::jsonb end);
  return inv_id;
end $$;
revoke all on function app.issue_invoice(uuid, integer, uuid) from public, anon, authenticated;

create or replace function public.platform_issue_invoice(p_owner uuid, p_due_days integer default 7) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  return app.issue_invoice(p_owner, p_due_days, app.assert_platform_admin());
end $$;

-- ---------- the daily run ----------
create function app.run_billing() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  sys constant uuid := '00000000-0000-0000-0000-000000000000';
  r record;
  issued integer := 0;
  failed integer := 0;
  flagged integer := 0;
begin
  for r in
    select s.owner_user_id from public.subscriptions s
    where s.status in ('active', 'past_due') and s.next_invoice_at is not null and s.next_invoice_at <= now()
      and not exists (select 1 from public.invoices i where i.owner_user_id = s.owner_user_id and i.status = 'open')
    order by s.next_invoice_at
  loop
    begin
      perform app.issue_invoice(r.owner_user_id, 7, sys);
      issued := issued + 1;
    exception when others then
      failed := failed + 1;
      perform app.platform_write_log(sys, 'invoice.auto_failed', r.owner_user_id, jsonb_build_object('reason', sqlerrm));
    end;
  end loop;

  for r in
    update public.subscriptions s set status = 'past_due'
    where s.status = 'active'
      and exists (select 1 from public.invoices i where i.owner_user_id = s.owner_user_id and i.status = 'open' and i.due_date < current_date)
    returning s.owner_user_id
  loop
    flagged := flagged + 1;
    perform app.platform_write_log(sys, 'subscription.past_due', r.owner_user_id, '{}'::jsonb);
  end loop;

  return jsonb_build_object('issued', issued, 'failed', failed, 'past_due', flagged);
end $$;
revoke all on function app.run_billing() from public, anon, authenticated;

-- The admin app can run it on demand.
create function public.platform_run_billing() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := app.assert_platform_admin();
  res jsonb;
begin
  res := app.run_billing();
  perform app.platform_write_log(admin, 'billing.run', null, res);
  return res;
end $$;
revoke all on function public.platform_run_billing() from public, anon;
grant execute on function public.platform_run_billing() to authenticated;

-- The activity log names the nil actor "System".
create or replace function public.platform_list_log(p_limit integer default 50, p_before bigint default null)
returns table (id bigint, created_at timestamptz, admin_name text, action text, subject_name text, subject_user_id uuid, details jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.assert_platform_admin();
  return query
    select l.id, l.created_at,
           coalesce(ap.full_name, case when l.admin_user_id = '00000000-0000-0000-0000-000000000000'::uuid then 'System' end),
           l.action, sp.full_name, l.subject_user_id, l.details
    from public.platform_log l
    left join public.profiles ap on ap.user_id = l.admin_user_id
    left join public.profiles sp on sp.user_id = l.subject_user_id
    where p_before is null or l.id < p_before
    order by l.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- ---------- schedule (skipped where pg_cron is not available, such as the local test database) ----------
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron is not available; schedule the daily run by hand: select app.run_billing()';
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('uplif-daily-billing', '0 1 * * *', 'select app.run_billing()');
  end if;
end $$;

-- Migration 22: what happens when a trial ends.
-- The daily billing run suspends an account whose trial has ended. A suspended account is locked: its companies
-- stop working for everyone in them (the database refuses, not just the screen) until the platform admin assigns a
-- plan or extends the trial. The owner sees a message to choose a plan, and can ask for one; the admin sees the
-- request, and assigning a plan unlocks the account and starts its first invoice.
-- Only a trial-ended suspension is lifted by these actions. Other suspensions (reason null) stay in place.

alter table public.subscriptions
  add column suspended_reason text check (suspended_reason in ('trial_ended')),
  add column requested_plan_id uuid references public.plans (id),
  add column requested_cycle text check (requested_cycle in ('month', 'year')),
  add column requested_at timestamptz,
  add constraint subscriptions_reason_only_when_suspended check (suspended_reason is null or status = 'suspended'),
  add constraint subscriptions_request_complete check ((requested_plan_id is null) = (requested_cycle is null) and (requested_plan_id is null) = (requested_at is null));

-- ---------- the lock ----------
create function app.company_locked(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.subscriptions s where s.owner_user_id = app.company_owner_user(p_company) and s.status = 'suspended')
$$;
revoke all on function app.company_locked(uuid) from public, anon, authenticated;

-- The company and membership in the caller's token. These two raw readers never look at the lock.
create function app.claimed_company_id() returns uuid
language sql stable set search_path = '' as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'company_id', '')::uuid
$$;
create function app.claimed_membership_id() returns uuid
language sql stable set search_path = '' as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'membership_id', '')::uuid
$$;
revoke all on function app.claimed_company_id(), app.claimed_membership_id() from public, anon, authenticated;

-- The lock itself: while the owner's account is suspended, the company and membership in a member's token read as
-- "none". Every policy and function in the system starts from these two, so nothing in a locked company matches
-- (no rows, no permissions, every function refuses). Only the three functions below read the raw token.
create or replace function app.company_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select case when app.company_locked(app.claimed_company_id()) then null else app.claimed_company_id() end
$$;
create or replace function app.membership_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select case when app.company_locked(app.claimed_company_id()) then null else app.claimed_membership_id() end
$$;

-- The caller is the Owner of the company in their token, whether or not it is locked.
create function app.caller_is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    join public.membership_roles mr on mr.membership_id = m.id and mr.company_id = m.company_id
    join public.roles r on r.id = mr.role_id and r.company_id = mr.company_id
    where m.id = app.claimed_membership_id() and m.company_id = app.claimed_company_id() and m.user_id = (select auth.uid()) and m.status = 'active'
      and r.is_system and r.name = 'Owner')
$$;
revoke all on function app.caller_is_owner() from public, anon, authenticated;

-- A suspended account cannot open more companies.
create or replace function app.limit_companies() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  s public.subscriptions;
  pl public.plans;
begin
  if uid is null then return new; end if;
  select * into s from public.subscriptions where owner_user_id = uid;
  if not found then return new; end if;
  if s.status = 'suspended' then raise exception 'account suspended' using errcode = 'P0001'; end if;
  select * into pl from public.plans where id = s.plan_id;
  if (select count(*) from app.owned_company_ids(uid)) >= pl.max_companies then
    raise exception 'plan limit: companies' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ---------- what the company sees (works even when locked) ----------
create function public.my_account_lock()
returns table (locked boolean, reason text, is_owner boolean, status text, trial_ends_at timestamptz,
               requested_plan text, requested_cycle text, requested_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare s public.subscriptions;
begin
  if not exists (select 1 from public.memberships m where m.id = app.claimed_membership_id() and m.company_id = app.claimed_company_id()
                 and m.user_id = (select auth.uid()) and m.status = 'active') then
    return;
  end if;
  select * into s from public.subscriptions where owner_user_id = app.company_owner_user(app.claimed_company_id());
  if not found then return; end if;
  return query select s.status = 'suspended', s.suspended_reason, app.caller_is_owner(), s.status, s.trial_ends_at,
    (select p.name from public.plans p where p.id = s.requested_plan_id), s.requested_cycle, s.requested_at;
end $$;

-- Plans an owner may choose from: the standard, current ones. Prices and limits are not secret.
create function public.list_available_plans()
returns table (id uuid, name text, price_month_cents integer, price_year_cents integer, max_companies integer,
               max_branches integer, max_users integer, modules text[])
language sql stable security definer set search_path = '' as $$
  select p.id, p.name, p.price_month_cents, p.price_year_cents, p.max_companies, p.max_branches, p.max_users, p.modules
  from public.plans p
  where (select auth.uid()) is not null and p.kind = 'standard' and p.archived_at is null
  order by p.price_year_cents
$$;

-- The owner asks for a plan. Payment is still arranged with UPLIF; the admin assigns the plan once it is settled.
create function public.request_plan(p_plan uuid, p_cycle text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  owner uuid := app.company_owner_user(app.claimed_company_id());
  pl public.plans;
begin
  if not app.caller_is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_cycle not in ('month', 'year') then raise exception 'bad billing cycle' using errcode = '22023'; end if;
  select * into pl from public.plans where id = p_plan and kind = 'standard' and archived_at is null;
  if not found then raise exception 'plan not available' using errcode = 'P0002'; end if;
  update public.subscriptions set requested_plan_id = p_plan, requested_cycle = p_cycle, requested_at = now() where owner_user_id = owner;
  perform app.write_audit(app.claimed_company_id(), app.claimed_membership_id(), 'plan.request', 'company', app.claimed_company_id(),
    jsonb_build_object('plan', pl.name, 'cycle', p_cycle));
  perform app.platform_write_log((select auth.uid()), 'plan.requested_by_owner', owner, jsonb_build_object('plan_id', p_plan, 'cycle', p_cycle));
end $$;

revoke all on function public.my_account_lock(), public.list_available_plans(), public.request_plan(uuid, text) from public, anon;
grant execute on function public.my_account_lock(), public.list_available_plans(), public.request_plan(uuid, text) to authenticated;

-- ---------- the daily run now also ends trials ----------
create or replace function app.run_billing() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  sys constant uuid := '00000000-0000-0000-0000-000000000000';
  r record;
  issued integer := 0;
  failed integer := 0;
  flagged integer := 0;
  ended integer := 0;
begin
  for r in
    update public.subscriptions s set status = 'suspended', suspended_reason = 'trial_ended'
    where s.status = 'trial' and s.trial_ends_at is not null and s.trial_ends_at <= now()
    returning s.owner_user_id
  loop
    ended := ended + 1;
    perform app.platform_write_log(sys, 'subscription.trial_ended', r.owner_user_id, '{}'::jsonb);
  end loop;

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

  return jsonb_build_object('issued', issued, 'failed', failed, 'past_due', flagged, 'trials_ended', ended);
end $$;

-- ---------- platform admin ----------
create function public.platform_extend_trial(p_owner uuid, p_days integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := app.assert_platform_admin();
  s public.subscriptions;
  new_end timestamptz;
begin
  if p_days is null or p_days < 1 or p_days > 60 then raise exception 'extend by 1 to 60 days' using errcode = '22023'; end if;
  select * into s from public.subscriptions where owner_user_id = p_owner for update;
  if not found then raise exception 'subscriber not found' using errcode = 'P0002'; end if;
  if not (s.status = 'trial' or (s.status = 'suspended' and s.suspended_reason is not distinct from 'trial_ended')) then
    raise exception 'only a trial can be extended' using errcode = 'P0001';
  end if;
  new_end := greatest(coalesce(s.trial_ends_at, now()), now()) + make_interval(days => p_days);
  update public.subscriptions set status = 'trial', suspended_reason = null, trial_ends_at = new_end, next_invoice_at = new_end
    where owner_user_id = p_owner;
  perform app.platform_write_log(admin, 'trial.extend', p_owner, jsonb_build_object('days', p_days, 'trial_ends_at', new_end));
end $$;

-- Assigning a plan to a trial (or a trial-ended account) makes it a paying account that is invoiced next.
create or replace function public.platform_assign_plan(p_owner uuid, p_plan uuid, p_cycle text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := app.assert_platform_admin();
  s public.subscriptions;
  np public.plans;
  us record;
  over text[] := '{}';
  from_trial boolean;
begin
  if p_cycle not in ('month', 'year') then raise exception 'bad billing cycle' using errcode = '22023'; end if;
  select * into s from public.subscriptions where owner_user_id = p_owner for update;
  if not found then raise exception 'subscriber not found' using errcode = 'P0002'; end if;
  select * into np from public.plans where id = p_plan;
  if not found or np.archived_at is not null then raise exception 'plan not available' using errcode = 'P0002'; end if;
  if p_cycle = 'month' and np.price_month_cents is null then raise exception 'this package is billed yearly' using errcode = 'P0001'; end if;
  select * into us from app.owner_usage(p_owner);
  if us.companies > np.max_companies then over := array_append(over, 'companies'); end if;
  if us.users_active + us.users_pending > np.max_users then over := array_append(over, 'users'); end if;
  if np.max_branches is not null and us.branches_max > np.max_branches then over := array_append(over, 'branches'); end if;
  if array_length(over, 1) > 0 then
    raise exception 'over the limit: %', array_to_string(over, ', ') using errcode = 'P0001';
  end if;
  from_trial := s.status = 'trial' or (s.status = 'suspended' and s.suspended_reason is not distinct from 'trial_ended');
  update public.subscriptions set
    plan_id = p_plan, cycle = p_cycle,
    status = case when from_trial then 'active' else status end,
    suspended_reason = case when from_trial then null else suspended_reason end,
    trial_ends_at = case when from_trial then null else trial_ends_at end,
    next_invoice_at = case when from_trial then now() else next_invoice_at end,
    requested_plan_id = null, requested_cycle = null, requested_at = null
    where owner_user_id = p_owner;
  perform app.platform_write_log(admin, case when np.kind = 'custom' then 'package.assign' else 'plan.assign' end, p_owner,
    jsonb_build_object('old_plan_id', s.plan_id, 'new_plan_id', p_plan, 'old_cycle', s.cycle, 'new_cycle', p_cycle));
end $$;

-- The subscriber detail shows the lock reason and any requested plan.
create or replace function public.platform_get_subscriber(p_owner uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := app.assert_platform_admin();
  r jsonb;
begin
  select jsonb_build_object(
    'owner_user_id', s.owner_user_id, 'owner_name', p.full_name, 'owner_email', u.email, 'plan_id', s.plan_id, 'plan_name', pl.name,
    'cycle', s.cycle, 'status', s.status, 'started_at', s.started_at, 'trial_ends_at', s.trial_ends_at, 'next_invoice_at', s.next_invoice_at,
    'billing_email', s.billing_email, 'suspended_reason', s.suspended_reason,
    'requested_plan_id', s.requested_plan_id, 'requested_plan', (select rp.name from public.plans rp where rp.id = s.requested_plan_id),
    'requested_cycle', s.requested_cycle, 'requested_at', s.requested_at,
    'companies', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'name_local', c.name_local, 'country_code', c.country_code,
        'created_at', c.created_at) order by c.created_at) from public.companies c where c.id in (select app.owned_company_ids(s.owner_user_id))), '[]'::jsonb),
    'usage', (select to_jsonb(us) from app.owner_usage(s.owner_user_id) us))
  into r
  from public.subscriptions s
  join public.plans pl on pl.id = s.plan_id
  left join auth.users u on u.id = s.owner_user_id
  left join public.profiles p on p.user_id = s.owner_user_id
  where s.owner_user_id = p_owner;
  if r is null then raise exception 'subscriber not found' using errcode = 'P0002'; end if;
  perform app.platform_write_log(admin, 'subscriber.view', p_owner, '{}'::jsonb);
  return r;
end $$;

revoke all on function public.platform_extend_trial(uuid, integer) from public, anon;
grant execute on function public.platform_extend_trial(uuid, integer) to authenticated;

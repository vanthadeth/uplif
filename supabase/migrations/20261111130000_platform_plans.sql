-- Migration 16: plans, subscriptions and the platform log, for the super-admin app.
--
-- Safety model: these tables are closed to the API (RLS on and forced, no policies, no grants). The super-admin
-- app only ever calls the platform_* functions below. Each one checks is_platform_admin() first and returns
-- account facts only (name, plan, status, counts of people, branches and companies). Nothing here returns a
-- company's team, customers, sales or stock. Every change, and every subscriber record opened, is written to an
-- append-only platform log.

-- ---------- plans ----------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]{2,60}$'),
  name text not null check (length(btrim(name)) between 1 and 60),
  kind text not null check (kind in ('standard', 'custom')),
  price_month_cents integer check (price_month_cents is null or price_month_cents >= 0),
  price_year_cents integer not null check (price_year_cents >= 0),
  max_companies integer not null check (max_companies between 1 and 1000),
  max_branches integer check (max_branches is null or max_branches between 1 and 10000),
  max_users integer not null check (max_users between 1 and 100000),
  modules text[] not null default '{}' check (modules <@ array['attendance', 'field_sales', 'inventory']::text[]),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'custom' or price_month_cents is not null)
);
create trigger touch_plans before update on public.plans for each row execute function app.touch_updated_at();

insert into public.plans (code, name, kind, price_month_cents, price_year_cents, max_companies, max_branches, max_users, modules) values
  ('lite', 'Lite', 'standard', 500, 4900, 1, 3, 5, array['attendance']),
  ('premium', 'Premium', 'standard', 700, 6800, 3, 10, 20, array['attendance', 'field_sales', 'inventory']);

-- ---------- subscriptions: one per owner account ----------
create table public.subscriptions (
  owner_user_id uuid primary key references auth.users (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  cycle text not null check (cycle in ('month', 'year')),
  status text not null check (status in ('trial', 'active', 'past_due', 'suspended')),
  started_at timestamptz not null default now(),
  trial_ends_at timestamptz,
  next_invoice_at timestamptz,
  billing_email text check (billing_email is null or length(billing_email) <= 200),
  updated_at timestamptz not null default now()
);
create index subscriptions_plan_idx on public.subscriptions (plan_id);
create trigger touch_subscriptions before update on public.subscriptions for each row execute function app.touch_updated_at();

-- ---------- platform log: append-only ----------
create table public.platform_log (
  id bigint generated always as identity primary key,
  admin_user_id uuid not null,
  action text not null check (length(action) between 1 and 80),
  subject_user_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create function app.platform_log_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'the platform log cannot be changed' using errcode = '42501'; end $$;
create trigger platform_log_no_update before update or delete on public.platform_log
  for each row execute function app.platform_log_append_only();
create trigger platform_log_no_truncate before truncate on public.platform_log
  for each statement execute function app.platform_log_append_only();

alter table public.plans enable row level security;
alter table public.plans force row level security;
alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;
alter table public.platform_log enable row level security;
alter table public.platform_log force row level security;
revoke all on public.plans, public.subscriptions, public.platform_log from public, anon, authenticated;

-- ---------- helpers ----------
create function app.assert_platform_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null or not exists (select 1 from public.platform_admins where user_id = uid) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return uid;
end $$;
revoke all on function app.assert_platform_admin() from public, anon, authenticated;

create function app.platform_write_log(p_admin uuid, p_action text, p_subject uuid, p_details jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.platform_log (admin_user_id, action, subject_user_id, details) values (p_admin, p_action, p_subject, coalesce(p_details, '{}'::jsonb))
$$;
revoke all on function app.platform_write_log(uuid, text, uuid, jsonb) from public, anon, authenticated;

-- Companies an account owns: the ones where they hold the system Owner role.
create function app.owned_company_ids(p_owner uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct m.company_id
  from public.memberships m
  join public.membership_roles mr on mr.membership_id = m.id and mr.company_id = m.company_id
  join public.roles r on r.id = mr.role_id and r.company_id = mr.company_id
  where m.user_id = p_owner and r.is_system and r.name = 'Owner'
$$;
revoke all on function app.owned_company_ids(uuid) from public, anon, authenticated;

-- A new owner starts a 14-day trial on Premium. Existing owners get the same, counted from now.
create function app.start_trial_for_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  if exists (select 1 from public.roles where id = new.role_id and company_id = new.company_id and is_system and name = 'Owner') then
    select user_id into uid from public.memberships where id = new.membership_id;
    insert into public.subscriptions (owner_user_id, plan_id, cycle, status, trial_ends_at, next_invoice_at)
      select uid, p.id, 'month', 'trial', now() + interval '14 days', now() + interval '14 days'
      from public.plans p where p.code = 'premium'
      on conflict (owner_user_id) do nothing;
  end if;
  return new;
end $$;
create trigger start_trial_after_owner_role after insert on public.membership_roles
  for each row execute function app.start_trial_for_owner();
revoke all on function app.start_trial_for_owner() from public, anon, authenticated;

insert into public.subscriptions (owner_user_id, plan_id, cycle, status, trial_ends_at, next_invoice_at)
  select distinct m.user_id, (select id from public.plans where code = 'premium'), 'month', 'trial', now() + interval '14 days', now() + interval '14 days'
  from public.memberships m
  join public.membership_roles mr on mr.membership_id = m.id and mr.company_id = m.company_id
  join public.roles r on r.id = mr.role_id and r.company_id = mr.company_id
  where r.is_system and r.name = 'Owner'
  on conflict (owner_user_id) do nothing;

-- Usage of one owner account, as plain counts.
create function app.owner_usage(p_owner uuid)
returns table (companies integer, users_active integer, users_pending integer, branches_max integer)
language sql stable security definer set search_path = '' as $$
  select
    (select count(*)::int from app.owned_company_ids(p_owner)),
    (select count(*)::int from public.memberships m where m.status = 'active' and m.company_id in (select app.owned_company_ids(p_owner))),
    (select count(*)::int from public.invitations i where i.status = 'pending' and i.expires_at > now() and i.company_id in (select app.owned_company_ids(p_owner))),
    coalesce((select max(n)::int from (select count(*) n from public.branches b where b.company_id in (select app.owned_company_ids(p_owner)) group by b.company_id) x), 0)
$$;
revoke all on function app.owner_usage(uuid) from public, anon, authenticated;

-- ---------- plans: read and edit ----------
create function public.platform_list_plans()
returns table (id uuid, code text, name text, kind text, price_month_cents integer, price_year_cents integer,
               max_companies integer, max_branches integer, max_users integer, modules text[], archived boolean, subscribers integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.assert_platform_admin();
  return query
    select p.id, p.code, p.name, p.kind, p.price_month_cents, p.price_year_cents, p.max_companies, p.max_branches, p.max_users,
           p.modules, p.archived_at is not null, (select count(*)::int from public.subscriptions s where s.plan_id = p.id)
    from public.plans p order by p.kind, p.price_year_cents, p.name;
end $$;

-- Create a custom package (p_id null) or edit a plan. A standard plan keeps its name; a custom package has no monthly price.
create function public.platform_save_plan(
  p_id uuid, p_name text, p_price_month_cents integer, p_price_year_cents integer,
  p_max_companies integer, p_max_branches integer, p_max_users integer, p_modules text[]
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := app.assert_platform_admin();
  pid uuid := p_id;
  cur public.plans;
begin
  if p_id is null then
    insert into public.plans (code, name, kind, price_month_cents, price_year_cents, max_companies, max_branches, max_users, modules)
      values ('custom_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), btrim(p_name), 'custom', null,
              p_price_year_cents, p_max_companies, p_max_branches, p_max_users, coalesce(p_modules, '{}'))
      returning id into pid;
    perform app.platform_write_log(admin, 'package.create', null, jsonb_build_object('plan_id', pid, 'name', btrim(p_name)));
  else
    select * into cur from public.plans where id = p_id for update;
    if not found then raise exception 'plan not found' using errcode = 'P0002'; end if;
    update public.plans set
      name = case when cur.kind = 'custom' then btrim(p_name) else name end,
      price_month_cents = case when cur.kind = 'standard' then p_price_month_cents else null end,
      price_year_cents = p_price_year_cents, max_companies = p_max_companies, max_branches = p_max_branches,
      max_users = p_max_users, modules = coalesce(p_modules, '{}')
      where id = p_id;
    perform app.platform_write_log(admin, case when cur.kind = 'custom' then 'package.update' else 'plan.update' end, null,
      jsonb_build_object('plan_id', p_id, 'old', jsonb_build_object('price_month_cents', cur.price_month_cents, 'price_year_cents', cur.price_year_cents,
        'max_companies', cur.max_companies, 'max_branches', cur.max_branches, 'max_users', cur.max_users, 'modules', cur.modules),
        'new', jsonb_build_object('price_month_cents', p_price_month_cents, 'price_year_cents', p_price_year_cents,
        'max_companies', p_max_companies, 'max_branches', p_max_branches, 'max_users', p_max_users, 'modules', coalesce(p_modules, '{}'))));
  end if;
  return pid;
end $$;

-- Custom packages are archived, not deleted, and only when nobody is on them. Standard plans cannot be archived.
create function public.platform_archive_plan(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := app.assert_platform_admin();
  cur public.plans;
begin
  select * into cur from public.plans where id = p_id for update;
  if not found then raise exception 'plan not found' using errcode = 'P0002'; end if;
  if cur.kind <> 'custom' then raise exception 'standard plans cannot be archived' using errcode = 'P0001'; end if;
  if exists (select 1 from public.subscriptions where plan_id = p_id) then
    raise exception 'package is in use' using errcode = 'P0001';
  end if;
  update public.plans set archived_at = now() where id = p_id and archived_at is null;
  perform app.platform_write_log(admin, 'package.archive', null, jsonb_build_object('plan_id', p_id, 'name', cur.name));
end $$;

-- ---------- subscribers ----------
create function public.platform_list_subscribers()
returns table (owner_user_id uuid, owner_name text, owner_email text, plan_id uuid, plan_name text, cycle text, status text,
               started_at timestamptz, trial_ends_at timestamptz, next_invoice_at timestamptz, billing_email text,
               companies integer, users_active integer, users_pending integer, branches_max integer, country_codes text[])
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.assert_platform_admin();
  return query
    select s.owner_user_id, p.full_name, u.email::text, s.plan_id, pl.name, s.cycle, s.status, s.started_at, s.trial_ends_at, s.next_invoice_at,
           s.billing_email, us.companies, us.users_active, us.users_pending, us.branches_max,
           coalesce((select array_agg(distinct c.country_code order by c.country_code) from public.companies c where c.id in (select app.owned_company_ids(s.owner_user_id))), '{}')
    from public.subscriptions s
    join public.plans pl on pl.id = s.plan_id
    left join auth.users u on u.id = s.owner_user_id
    left join public.profiles p on p.user_id = s.owner_user_id
    cross join lateral app.owner_usage(s.owner_user_id) us
    order by s.started_at desc;
end $$;

-- One subscriber, with the names of their companies. Opening it is written to the platform log.
create function public.platform_get_subscriber(p_owner uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := app.assert_platform_admin();
  r jsonb;
begin
  select jsonb_build_object(
    'owner_user_id', s.owner_user_id, 'owner_name', p.full_name, 'owner_email', u.email, 'plan_id', s.plan_id, 'plan_name', pl.name,
    'cycle', s.cycle, 'status', s.status, 'started_at', s.started_at, 'trial_ends_at', s.trial_ends_at, 'next_invoice_at', s.next_invoice_at,
    'billing_email', s.billing_email,
    'companies', coalesce((select jsonb_agg(jsonb_build_object('name', c.name, 'name_local', c.name_local, 'country_code', c.country_code,
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

-- Move an account to another plan. Refused when the account already uses more than the new plan allows.
create function public.platform_assign_plan(p_owner uuid, p_plan uuid, p_cycle text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := app.assert_platform_admin();
  s public.subscriptions;
  np public.plans;
  us record;
  over text[] := '{}';
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
  update public.subscriptions set
    plan_id = p_plan, cycle = p_cycle,
    status = case when status = 'trial' then 'active' else status end,
    trial_ends_at = case when status = 'trial' then null else trial_ends_at end,
    next_invoice_at = case when status = 'trial' then now() else next_invoice_at end
    where owner_user_id = p_owner;
  perform app.platform_write_log(admin, case when np.kind = 'custom' then 'package.assign' else 'plan.assign' end, p_owner,
    jsonb_build_object('old_plan_id', s.plan_id, 'new_plan_id', p_plan, 'old_cycle', s.cycle, 'new_cycle', p_cycle));
end $$;

revoke all on function
  public.platform_list_plans(), public.platform_save_plan(uuid, text, integer, integer, integer, integer, integer, text[]),
  public.platform_archive_plan(uuid), public.platform_list_subscribers(), public.platform_get_subscriber(uuid),
  public.platform_assign_plan(uuid, uuid, text)
  from public, anon;
grant execute on function
  public.platform_list_plans(), public.platform_save_plan(uuid, text, integer, integer, integer, integer, integer, text[]),
  public.platform_archive_plan(uuid), public.platform_list_subscribers(), public.platform_get_subscriber(uuid),
  public.platform_assign_plan(uuid, uuid, text)
  to authenticated;

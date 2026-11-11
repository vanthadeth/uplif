-- Migration 18: support access and the admin activity log.
-- A platform admin may ask to look inside one company. The company's Owner must approve; access is for 1 to 24
-- hours and the owner can end it at any time. Every step is written twice: to the append-only platform log
-- (admin side) and to the company's own audit log (company side).
--
-- This migration only records requests and decisions. It does NOT let anyone read company data: no function here
-- (and no policy anywhere) lets a platform admin see a company's team, customers, sales or stock. A later slice adds
-- a read-only viewer that must check an approved, unexpired grant.

create table public.support_grants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  requested_by uuid not null,
  reason text not null check (length(reason) between 5 and 300),
  hours integer not null check (hours between 1 and 24),
  status text not null default 'requested' check (status in ('requested', 'approved', 'declined', 'cancelled', 'ended')),
  requested_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  expires_at timestamptz,
  check (status <> 'approved' or (expires_at is not null and decided_at is not null))
);
create index support_grants_company_idx on public.support_grants (company_id, requested_at desc);
-- One live request or grant per company at a time.
create unique index support_grants_one_live on public.support_grants (company_id) where status in ('requested', 'approved');

alter table public.support_grants enable row level security;
alter table public.support_grants force row level security;
revoke all on public.support_grants from public, anon, authenticated;

-- Only the status and decision fields may change; nothing can be deleted, even by the table owner.
create function app.support_grant_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'support grants cannot be deleted' using errcode = '42501'; end if;
  if old.status in ('declined', 'cancelled', 'ended') then raise exception 'a closed support grant cannot be changed' using errcode = '42501'; end if;
  if (new.company_id, new.requested_by, new.reason, new.hours, new.requested_at) is distinct from
     (old.company_id, old.requested_by, old.reason, old.hours, old.requested_at) then
    raise exception 'a support grant request cannot be edited' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger support_grant_guard before update or delete on public.support_grants
  for each row execute function app.support_grant_guard();

-- Derived state: an unanswered request goes stale after 7 days; an approved grant stops at its expiry.
create function app.support_status(g public.support_grants) returns text
language sql stable set search_path = '' as $$
  select case
    when g.status = 'requested' and g.requested_at < now() - interval '7 days' then 'expired'
    when g.status = 'approved' and g.expires_at <= now() then 'expired'
    else g.status end
$$;

-- Company-side audit entry for something the platform did. No actor is recorded: the company sees "UPLIF support".
create function app.write_support_audit(p_company uuid, p_action text, p_entity uuid, p_details jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (company_id, membership_id, actor_user_id, action, entity_type, entity_id, details)
  values (p_company, null, null, p_action, 'support_grant', p_entity, coalesce(p_details, '{}'::jsonb))
$$;

-- The caller holds the system Owner role in the company they are working in.
create function app.is_company_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select app.is_active_member()) and exists (
    select 1 from public.membership_roles mr
    join public.roles r on r.id = mr.role_id and r.company_id = mr.company_id
    where mr.membership_id = (select app.membership_id()) and mr.company_id = (select app.company_id())
      and r.is_system and r.name = 'Owner')
$$;

-- The account that owns a company, for the platform log subject.
create function app.company_owner_user(p_company uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.user_id from public.memberships m
  join public.membership_roles mr on mr.membership_id = m.id and mr.company_id = m.company_id
  join public.roles r on r.id = mr.role_id and r.company_id = mr.company_id
  where m.company_id = p_company and r.is_system and r.name = 'Owner'
  order by m.created_at limit 1
$$;
revoke all on function app.support_status(public.support_grants), app.write_support_audit(uuid, text, uuid, jsonb),
  app.is_company_owner(), app.company_owner_user(uuid) from public, anon, authenticated;

-- ---------- platform side ----------
create function public.platform_request_support_access(p_company uuid, p_reason text, p_hours integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := app.assert_platform_admin();
  c public.companies;
  why text := btrim(coalesce(p_reason, ''));
  gid uuid;
  owner uuid;
begin
  if length(why) < 5 or length(why) > 300 then raise exception 'give a reason of 5 to 300 characters' using errcode = '22023'; end if;
  if p_hours is null or p_hours < 1 or p_hours > 24 then raise exception 'access lasts 1 to 24 hours' using errcode = '22023'; end if;
  select * into c from public.companies where id = p_company;
  if not found then raise exception 'company not found' using errcode = 'P0002'; end if;
  owner := app.company_owner_user(p_company);
  if exists (select 1 from public.subscriptions s where s.owner_user_id = owner and s.status = 'suspended') then
    raise exception 'this account is suspended' using errcode = 'P0001';
  end if;
  -- an approved grant that ran out or a stale request no longer blocks a new one
  update public.support_grants set status = 'ended'
    where company_id = p_company and ((status = 'approved' and expires_at <= now()) or (status = 'requested' and requested_at < now() - interval '7 days'));
  if exists (select 1 from public.support_grants where company_id = p_company and status in ('requested', 'approved')) then
    raise exception 'this company already has an open request' using errcode = 'P0001';
  end if;
  insert into public.support_grants (company_id, requested_by, reason, hours) values (p_company, admin, why, p_hours) returning id into gid;
  perform app.platform_write_log(admin, 'support_access.request', owner,
    jsonb_build_object('grant_id', gid, 'company_id', p_company, 'company', c.name, 'hours', p_hours, 'reason', why));
  perform app.write_support_audit(p_company, 'support_access.request', gid, jsonb_build_object('hours', p_hours, 'reason', why));
  return gid;
end $$;

create function public.platform_list_support_grants()
returns table (id uuid, company_id uuid, company_name text, company_name_local text, owner_name text, requested_by_name text,
               reason text, hours integer, status text, requested_at timestamptz, decided_at timestamptz, expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.assert_platform_admin();
  return query
    select g.id, g.company_id, c.name, c.name_local, op.full_name, ap.full_name, g.reason, g.hours, app.support_status(g),
           g.requested_at, g.decided_at, g.expires_at
    from public.support_grants g
    join public.companies c on c.id = g.company_id
    left join public.profiles op on op.user_id = app.company_owner_user(g.company_id)
    left join public.profiles ap on ap.user_id = g.requested_by
    order by g.requested_at desc;
end $$;

-- Withdraw a request nobody has answered yet.
create function public.platform_cancel_support_request(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := app.assert_platform_admin();
  g public.support_grants;
begin
  select * into g from public.support_grants where id = p_id for update;
  if not found then raise exception 'request not found' using errcode = 'P0002'; end if;
  if g.status <> 'requested' then raise exception 'only an unanswered request can be withdrawn' using errcode = 'P0001'; end if;
  update public.support_grants set status = 'cancelled', decided_by = admin, decided_at = now() where id = p_id;
  perform app.platform_write_log(admin, 'support_access.cancel', app.company_owner_user(g.company_id), jsonb_build_object('grant_id', p_id, 'company_id', g.company_id));
  perform app.write_support_audit(g.company_id, 'support_access.cancel', p_id, '{}'::jsonb);
end $$;

-- The platform side can always stop looking early.
create function public.platform_end_support_access(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := app.assert_platform_admin();
  g public.support_grants;
begin
  select * into g from public.support_grants where id = p_id for update;
  if not found then raise exception 'grant not found' using errcode = 'P0002'; end if;
  if g.status <> 'approved' then raise exception 'only approved access can be ended' using errcode = 'P0001'; end if;
  update public.support_grants set status = 'ended' where id = p_id;
  perform app.platform_write_log(admin, 'support_access.end', app.company_owner_user(g.company_id), jsonb_build_object('grant_id', p_id, 'company_id', g.company_id, 'by', 'platform'));
  perform app.write_support_audit(g.company_id, 'support_access.end', p_id, jsonb_build_object('by', 'platform'));
end $$;

-- ---------- admin activity log ----------
create function public.platform_list_log(p_limit integer default 50, p_before bigint default null)
returns table (id bigint, created_at timestamptz, admin_name text, action text, subject_name text, subject_user_id uuid, details jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.assert_platform_admin();
  return query
    select l.id, l.created_at, ap.full_name, l.action, sp.full_name, l.subject_user_id, l.details
    from public.platform_log l
    left join public.profiles ap on ap.user_id = l.admin_user_id
    left join public.profiles sp on sp.user_id = l.subject_user_id
    where p_before is null or l.id < p_before
    order by l.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- ---------- company side: only the Owner of the company they are working in ----------
create function public.my_support_grants()
returns table (id uuid, reason text, hours integer, status text, requested_at timestamptz, decided_at timestamptz, expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select app.is_company_owner()) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select g.id, g.reason, g.hours, app.support_status(g), g.requested_at, g.decided_at, g.expires_at
    from public.support_grants g where g.company_id = (select app.company_id())
    order by g.requested_at desc limit 50;
end $$;

create function public.respond_support_access(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.support_grants;
begin
  if not (select app.is_company_owner()) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into g from public.support_grants where id = p_id and company_id = (select app.company_id()) for update;
  if not found then raise exception 'request not found' using errcode = 'P0002'; end if;
  if app.support_status(g) <> 'requested' then raise exception 'this request is no longer open' using errcode = 'P0001'; end if;
  if p_approve then
    update public.support_grants set status = 'approved', decided_by = (select auth.uid()), decided_at = now(), expires_at = now() + make_interval(hours => g.hours) where id = p_id;
  else
    update public.support_grants set status = 'declined', decided_by = (select auth.uid()), decided_at = now() where id = p_id;
  end if;
  perform app.write_audit(g.company_id, (select app.membership_id()), case when p_approve then 'support_access.approve' else 'support_access.decline' end,
    'support_grant', p_id, jsonb_build_object('hours', g.hours));
  perform app.platform_write_log((select auth.uid()), case when p_approve then 'support_access.approved_by_owner' else 'support_access.declined_by_owner' end,
    (select auth.uid()), jsonb_build_object('grant_id', p_id, 'company_id', g.company_id));
end $$;

create function public.end_support_access(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.support_grants;
begin
  if not (select app.is_company_owner()) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into g from public.support_grants where id = p_id and company_id = (select app.company_id()) for update;
  if not found then raise exception 'grant not found' using errcode = 'P0002'; end if;
  if g.status <> 'approved' or g.expires_at <= now() then raise exception 'this access is not active' using errcode = 'P0001'; end if;
  update public.support_grants set status = 'ended' where id = p_id;
  perform app.write_audit(g.company_id, (select app.membership_id()), 'support_access.end', 'support_grant', p_id, jsonb_build_object('by', 'owner'));
  perform app.platform_write_log((select auth.uid()), 'support_access.ended_by_owner', (select auth.uid()), jsonb_build_object('grant_id', p_id, 'company_id', g.company_id));
end $$;

-- Subscriber detail now carries each company's id, so the admin app can ask for access to one company.
create or replace function public.platform_get_subscriber(p_owner uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := app.assert_platform_admin();
  r jsonb;
begin
  select jsonb_build_object(
    'owner_user_id', s.owner_user_id, 'owner_name', p.full_name, 'owner_email', u.email, 'plan_id', s.plan_id, 'plan_name', pl.name,
    'cycle', s.cycle, 'status', s.status, 'started_at', s.started_at, 'trial_ends_at', s.trial_ends_at, 'next_invoice_at', s.next_invoice_at,
    'billing_email', s.billing_email,
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

revoke all on function
  public.platform_request_support_access(uuid, text, integer), public.platform_list_support_grants(),
  public.platform_cancel_support_request(uuid), public.platform_end_support_access(uuid), public.platform_list_log(integer, bigint),
  public.my_support_grants(), public.respond_support_access(uuid, boolean), public.end_support_access(uuid)
  from public, anon;
grant execute on function
  public.platform_request_support_access(uuid, text, integer), public.platform_list_support_grants(),
  public.platform_cancel_support_request(uuid), public.platform_end_support_access(uuid), public.platform_list_log(integer, bigint),
  public.my_support_grants(), public.respond_support_access(uuid, boolean), public.end_support_access(uuid)
  to authenticated;

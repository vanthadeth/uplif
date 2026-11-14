-- Migration: an owner can delete their company. The company is hidden at once and its data is kept for a grace
-- period (90 days), during which the owner can restore it. After that a daily job removes it for good.
--
-- While deleted: nobody can read or write the company's data (RLS helpers treat it as gone), it does not count
-- against the owner's plan limit, and it no longer appears for members. The owner still sees it in the company
-- list, marked with the purge date and a Restore button.

alter table public.companies
  add column deleted_at timestamptz,
  add column purge_after timestamptz,
  add column deleted_by uuid references auth.users (id) on delete set null,
  add constraint companies_deletion_pair check ((deleted_at is null) = (purge_after is null));
create index companies_purge_idx on public.companies (purge_after) where purge_after is not null;

-- A record that outlives the company: who deleted what, when, and when it was purged. No business data.
create table public.company_deletions (
  company_id uuid primary key,
  name text not null,
  deleted_by uuid,
  deleted_at timestamptz not null,
  purge_after timestamptz not null,
  restored_at timestamptz,
  purged_at timestamptz
);
alter table public.company_deletions enable row level security;
alter table public.company_deletions force row level security;
revoke all on public.company_deletions from anon, authenticated;

-- ---------- a deleted company is closed to its members ----------
create or replace function app.is_active_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    join public.companies c on c.id = m.company_id and c.deleted_at is null
    where m.id = app.membership_id()
      and m.company_id = app.company_id()
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
$$;

create or replace function app.permission_scope(p_key text) returns public.data_scope
language sql stable security definer set search_path = '' as $$
  with me as (
    select m.id from public.memberships m
    join public.companies c on c.id = m.company_id and c.deleted_at is null
    where m.id = app.membership_id() and m.company_id = app.company_id()
      and m.user_id = (select auth.uid()) and m.status = 'active'
  ), ov as (
    select o.data_scope from public.membership_permission_overrides o join me on o.membership_id = me.id
    where o.company_id = app.company_id() and o.permission_key = p_key
      and (o.expires_at is null or o.expires_at > now())
  )
  select case
    when exists (select 1 from ov) then (select data_scope from ov)
    else (
      select case when mr.branch_id is not null and rp.data_scope = 'company'
                  then 'branch'::public.data_scope else rp.data_scope end
      from public.role_permissions rp
      join public.membership_roles mr on mr.role_id = rp.role_id and mr.company_id = rp.company_id
      join me on me.id = mr.membership_id
      where rp.permission_key = p_key and mr.company_id = app.company_id()
      order by 1 desc
      limit 1)
  end
  where exists (select 1 from me)
$$;

-- New tokens never point at a deleted company.
create or replace function app.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (event ->> 'user_id')::uuid;
  mid uuid;
  cid uuid;
  claims jsonb := event -> 'claims';
  meta jsonb := coalesce(event -> 'claims' -> 'app_metadata', '{}'::jsonb) - 'company_id' - 'membership_id';
begin
  select m.id, m.company_id into mid, cid
  from public.memberships m
  join public.companies c on c.id = m.company_id and c.deleted_at is null
  left join app.user_context uc
    on uc.user_id = m.user_id and uc.active_membership_id = m.id
  where m.user_id = uid and m.status = 'active'
  order by (uc.user_id is not null) desc, m.created_at, m.id
  limit 1;

  if mid is not null then
    meta := meta || jsonb_build_object('company_id', cid, 'membership_id', mid);
  end if;
  claims := jsonb_set(claims, '{app_metadata}', meta);
  return jsonb_set(event, '{claims}', claims);
end $$;

-- Companies an account owns do not include deleted ones, so deleting one frees a place on the plan.
create or replace function app.owned_company_ids(p_owner uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct m.company_id
  from public.memberships m
  join public.companies c on c.id = m.company_id and c.deleted_at is null
  join public.membership_roles mr on mr.membership_id = m.id and mr.company_id = m.company_id
  join public.roles r on r.id = mr.role_id and r.company_id = mr.company_id
  where m.user_id = p_owner and r.is_system and r.name = 'Owner'
$$;
revoke all on function app.owned_company_ids(uuid) from public, anon, authenticated;

-- Members do not switch into a deleted company.
create or replace function public.switch_company(p_membership_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if not exists (
    select 1 from public.memberships m join public.companies c on c.id = m.company_id
    where m.id = p_membership_id and m.user_id = uid and m.status = 'active' and c.deleted_at is null
  ) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  insert into app.user_context (user_id, active_membership_id) values (uid, p_membership_id)
    on conflict (user_id) do update set active_membership_id = excluded.active_membership_id;
end $$;

-- ---------- the company list: members see live companies; owners also see their deleted ones ----------
drop function public.list_my_companies();
create function public.list_my_companies() returns table (
  membership_id uuid, company_id uuid, name text, name_local text, is_active boolean,
  is_owner boolean, deleted_at timestamptz, purge_after timestamptz
)
language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as uid)
  select m.id, c.id, c.name, c.name_local,
         (uc.active_membership_id = m.id) as is_active,
         exists (
           select 1 from public.membership_roles mr join public.roles r on r.id = mr.role_id and r.company_id = mr.company_id
           where mr.membership_id = m.id and mr.company_id = m.company_id and r.is_system and r.name = 'Owner'
         ) as is_owner,
         c.deleted_at, c.purge_after
  from public.memberships m
  join public.companies c on c.id = m.company_id
  left join app.user_context uc on uc.user_id = m.user_id
  where m.user_id = (select uid from me) and m.status = 'active'
    and (c.deleted_at is null or exists (
      select 1 from public.membership_roles mr join public.roles r on r.id = mr.role_id and r.company_id = mr.company_id
      where mr.membership_id = m.id and mr.company_id = m.company_id and r.is_system and r.name = 'Owner'))
  order by (c.deleted_at is not null), c.name
$$;
revoke all on function public.list_my_companies() from public, anon;
grant execute on function public.list_my_companies() to authenticated;

-- ---------- delete and restore ----------
create function app.is_company_owner_of(p_company uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    join public.membership_roles mr on mr.membership_id = m.id and mr.company_id = m.company_id
    join public.roles r on r.id = mr.role_id and r.company_id = mr.company_id
    where m.company_id = p_company and m.user_id = p_user and m.status = 'active' and r.is_system and r.name = 'Owner'
  )
$$;
revoke all on function app.is_company_owner_of(uuid, uuid) from public, anon, authenticated;

-- Only an owner can do this, and they confirm by typing the company name.
create function public.delete_company(p_company uuid, p_confirm_name text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  c public.companies;
  purge timestamptz := now() + interval '90 days';
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into c from public.companies where id = p_company for update;
  if not found or c.deleted_at is not null or not app.is_company_owner_of(p_company, uid) then
    raise exception 'only an owner can delete a company' using errcode = '42501';
  end if;
  if btrim(p_confirm_name) is distinct from c.name then
    raise exception 'name does not match' using errcode = 'P0001';
  end if;

  perform app.write_audit(p_company, nullif(auth.jwt() -> 'app_metadata' ->> 'membership_id', '')::uuid,
    'company.delete', 'company', p_company, jsonb_build_object('purge_after', purge));
  update public.companies set deleted_at = now(), purge_after = purge, deleted_by = uid where id = p_company;
  insert into public.company_deletions (company_id, name, deleted_by, deleted_at, purge_after)
    values (p_company, c.name, uid, now(), purge)
    on conflict (company_id) do update set deleted_by = excluded.deleted_by, deleted_at = excluded.deleted_at,
      purge_after = excluded.purge_after, restored_at = null;
  -- Anyone who had it open lands back on the company list at their next token refresh.
  update app.user_context set active_membership_id = null
    where active_membership_id in (select id from public.memberships where company_id = p_company);
  return purge;
end $$;
revoke all on function public.delete_company(uuid, text) from public, anon;
grant execute on function public.delete_company(uuid, text) to authenticated;

create function public.restore_company(p_company uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  pl public.plans;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.companies where id = p_company and deleted_at is not null and purge_after > now())
     or not app.is_company_owner_of(p_company, uid) then
    raise exception 'cannot restore this company' using errcode = '42501';
  end if;
  -- The plan's company limit applies again once it is live.
  select p.* into pl from public.subscriptions s join public.plans p on p.id = s.plan_id where s.owner_user_id = uid;
  if found and (select count(*) from app.owned_company_ids(uid)) >= pl.max_companies then
    raise exception 'plan limit: companies' using errcode = 'P0001';
  end if;
  update public.companies set deleted_at = null, purge_after = null, deleted_by = null where id = p_company;
  update public.company_deletions set restored_at = now() where company_id = p_company;
  perform app.write_audit(p_company, null, 'company.restore', 'company', p_company, '{}'::jsonb);
end $$;
revoke all on function public.restore_company(uuid) from public, anon;
grant execute on function public.restore_company(uuid) to authenticated;

-- ---------- permanent removal ----------
-- The audit log refuses deletes, except for the rows of the one company being purged inside this job.
create or replace function app.forbid_audit_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and old.company_id::text = current_setting('app.purging_company', true) then
    return old;
  end if;
  raise exception 'audit_log is append-only' using errcode = '42501';
end $$;

create function app.purge_deleted_companies() returns integer
language plpgsql security definer set search_path = '' as $$
declare c record; n integer := 0;
begin
  for c in select id from public.companies where purge_after is not null and purge_after <= now() loop
    perform set_config('app.purging_company', c.id::text, true);
    delete from public.companies where id = c.id;
    update public.company_deletions set purged_at = now() where company_id = c.id;
    n := n + 1;
  end loop;
  perform set_config('app.purging_company', '', true);
  return n;
end $$;
revoke all on function app.purge_deleted_companies() from public, anon, authenticated;

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron is not available; schedule by hand: select app.purge_deleted_companies()';
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('uplif-purge-deleted-companies', '30 1 * * *', 'select app.purge_deleted_companies()');
  end if;
end $$;

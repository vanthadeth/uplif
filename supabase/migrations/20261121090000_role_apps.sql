-- Roles, step 1 of 2: roles are now set app by app. A role is allowed or denied each app, and only then
-- decides what it can do inside the app. Backward compatible: every existing permission key stays, and a
-- role that has no row for an app is treated as allowed, exactly as before.
--
-- Which app owns a permission key is decided by its prefix. org.branch.read belongs to no app because
-- every app needs it (UPLIF Me uses it for the clock-in geofence), so it can never be switched off here.
create function app.app_of_permission(p_key text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_key = 'org.branch.read' then null
    when p_key ~ '^(org|leave|learn|performance|career)\.' then 'admin'
    when p_key like 'attendance.%' then 'time'
    when p_key like 'sales.%' then 'go'
    when p_key like 'orders.%' then 'orders'
    when p_key like 'stock.%' then 'stock'
    when p_key like 'pos.%' then 'pos'
    when p_key like 'sites.%' then 'sites'
  end
$$;
revoke all on function app.app_of_permission(text) from public, anon;
grant execute on function app.app_of_permission(text) to authenticated;

-- UPLIF Me is always on for everyone, so it has no row here.
create table public.role_apps (
  company_id uuid not null,
  role_id uuid not null,
  app_key text not null check (app_key in ('admin', 'time', 'go', 'orders', 'stock', 'pos', 'sites')),
  allowed boolean not null,
  primary key (role_id, app_key),
  foreign key (company_id, role_id) references public.roles (company_id, id) on delete cascade
);
create index role_apps_company_idx on public.role_apps (company_id, role_id);
alter table public.role_apps enable row level security;
alter table public.role_apps force row level security;
-- Read only (no write grants, no write policies). All writes go through public.save_role_access() so apps and actions change together.
grant select on public.role_apps to authenticated;
create policy role_apps_select on public.role_apps for select to authenticated
  using (company_id = (select app.company_id()) and (select app.permission_scope('org.role.read')) is not null);
create trigger immutable_company_role_apps before update on public.role_apps for each row execute function app.forbid_company_change();
create trigger audit_role_apps after insert or update or delete on public.role_apps for each row execute function app.audit_row();

-- Backfill: an app is allowed where the role already holds one of its permissions. Owner and Admin get every app.
insert into public.role_apps (company_id, role_id, app_key, allowed)
select r.company_id, r.id, a.k,
       (r.is_system and r.name in ('Owner', 'Admin'))
       or exists (select 1 from public.role_permissions rp where rp.role_id = r.id and app.app_of_permission(rp.permission_key) = a.k)
from public.roles r
cross join (values ('admin'), ('time'), ('go'), ('orders'), ('stock'), ('pos'), ('sites')) a(k)
on conflict do nothing;

-- A permission through a role only counts while the role is allowed its app (a missing row means allowed).
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
        and not exists (select 1 from public.role_apps ra
                        where ra.role_id = rp.role_id and not ra.allowed and ra.app_key = app.app_of_permission(rp.permission_key))
      order by 1 desc
      limit 1)
  end
  where exists (select 1 from me)
$$;

create or replace function public.my_permissions() returns table (permission_key text, data_scope public.data_scope)
language sql stable security definer set search_path = '' as $$
  with me as (
    select m.id from public.memberships m
    where m.id = app.membership_id() and m.company_id = app.company_id()
      and m.user_id = (select auth.uid()) and m.status = 'active'
  ), ov as (
    select o.permission_key, o.effect, o.data_scope from public.membership_permission_overrides o join me on o.membership_id = me.id
    where o.company_id = app.company_id() and (o.expires_at is null or o.expires_at > now())
  )
  select rp.permission_key,
         max(case when mr.branch_id is not null and rp.data_scope = 'company'
                  then 'branch'::public.data_scope else rp.data_scope end)
  from public.role_permissions rp
  join public.membership_roles mr on mr.role_id = rp.role_id and mr.company_id = rp.company_id
  join me on me.id = mr.membership_id
  where mr.company_id = app.company_id()
    and not exists (select 1 from ov where ov.permission_key = rp.permission_key)
    and not exists (select 1 from public.role_apps ra
                    where ra.role_id = rp.role_id and not ra.allowed and ra.app_key = app.app_of_permission(rp.permission_key))
  group by rp.permission_key
  union all
  select ov.permission_key, ov.data_scope from ov where ov.effect = 'grant'
$$;

-- Save one role's apps and actions in a single step. p_apps = {"go": true, ...} (apps missing from it are left
-- alone); p_perms = {"org.member.read": "team", ...} is the complete list of actions the role holds afterwards.
-- Needs org.role.manage at company scope; the Owner role stays fixed. Every changed row is audited by its trigger.
create function public.save_role_access(p_role_id uuid, p_apps jsonb, p_perms jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  r public.roles;
  e record;
begin
  if not app.is_active_member() or (select app.permission_scope('org.role.manage')) is distinct from 'company' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into r from public.roles where id = p_role_id and company_id = cid;
  if not found then raise exception 'not allowed' using errcode = '42501'; end if;
  if r.is_system and r.name = 'Owner' then raise exception 'the Owner role is fixed' using errcode = '42501'; end if;
  if jsonb_typeof(p_apps) is distinct from 'object' or jsonb_typeof(p_perms) is distinct from 'object' then
    raise exception 'invalid request' using errcode = '22023';
  end if;

  for e in select key, value from jsonb_each(p_apps) loop
    if jsonb_typeof(e.value) <> 'boolean' or e.key not in ('admin', 'time', 'go', 'orders', 'stock', 'pos', 'sites') then
      raise exception 'invalid app' using errcode = '22023';
    end if;
    insert into public.role_apps (company_id, role_id, app_key, allowed) values (cid, p_role_id, e.key, (e.value)::text::boolean)
    on conflict (role_id, app_key) do update set allowed = excluded.allowed where public.role_apps.allowed is distinct from excluded.allowed;
  end loop;

  delete from public.role_permissions rp
  where rp.role_id = p_role_id and rp.company_id = cid and not (p_perms ? rp.permission_key);
  for e in select key, value from jsonb_each_text(p_perms) loop
    if e.value not in ('own', 'team', 'branch', 'company') or not exists (select 1 from public.permissions where key = e.key) then
      raise exception 'invalid permission' using errcode = '22023';
    end if;
    insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
    values (cid, p_role_id, e.key, e.value::public.data_scope)
    on conflict (role_id, permission_key) do update set data_scope = excluded.data_scope
      where public.role_permissions.data_scope is distinct from excluded.data_scope;
  end loop;
end $$;
revoke all on function public.save_role_access(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_role_access(uuid, jsonb, jsonb) to authenticated;

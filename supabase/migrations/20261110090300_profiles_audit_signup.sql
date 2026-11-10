-- Migration 4: user profiles, append-only audit log, and the signup / company RPCs.
-- Company creation, switching and listing go through security-definer RPCs because the caller
-- has no company claim yet (RLS on tenant tables would otherwise hide everything).

insert into public.permissions (key, description) values
  ('org.audit.read', 'View the audit log'),
  ('org.invitation.manage', 'Invite people and revoke invitations')
on conflict do nothing;

-- Profiles: one per auth user, readable and editable only by that user.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) > 0),
  full_name_local text,
  locale text not null default 'en' check (locale in ('en', 'km')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger touch_profiles before update on public.profiles for each row execute function app.touch_updated_at();
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
create policy profiles_select on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy profiles_insert on public.profiles for insert to authenticated with check (user_id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert (user_id, full_name, full_name_local, locale), update (full_name, full_name_local, locale)
  on public.profiles to authenticated;

-- Audit log: append-only, partitioned by month. Rows are written only by app.write_audit().
create table public.audit_log (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  membership_id uuid,
  actor_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (id, created_at)
) partition by range (created_at);
create table public.audit_log_default partition of public.audit_log default;
create index audit_log_company_created_idx on public.audit_log (company_id, created_at desc);

alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;
alter table public.audit_log_default enable row level security;
alter table public.audit_log_default force row level security;
create policy audit_log_select on public.audit_log for select to authenticated
  using (company_id = (select app.company_id()) and (select app.permission_scope('org.audit.read')) = 'company');
create policy audit_log_default_select on public.audit_log_default for select to authenticated
  using (company_id = (select app.company_id()) and (select app.permission_scope('org.audit.read')) = 'company');
grant select on public.audit_log, public.audit_log_default to authenticated;

create function app.forbid_audit_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_log is append-only' using errcode = '42501';
end $$;
create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function app.forbid_audit_change();
create trigger audit_log_default_no_update before update or delete on public.audit_log_default
  for each row execute function app.forbid_audit_change();

create function app.write_audit(
  p_company_id uuid, p_membership_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_details jsonb
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (company_id, membership_id, actor_user_id, action, entity_type, entity_id, details)
  values (p_company_id, p_membership_id, (select auth.uid()), p_action, p_entity_type, p_entity_id,
          coalesce(p_details, '{}'::jsonb))
$$;

-- Seven system roles and their default permissions (scope).
create function app.seed_system_roles(p_company_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid;
  r record;
begin
  insert into public.roles (company_id, name, is_system) values
    (p_company_id, 'Owner', true) returning id into owner_id;
  insert into public.roles (company_id, name, is_system) values
    (p_company_id, 'Admin', true), (p_company_id, 'Manager', true), (p_company_id, 'Sales rep', true),
    (p_company_id, 'Warehouse', true), (p_company_id, 'Accountant', true), (p_company_id, 'Staff', true);

  -- Owner and Admin: everything at company scope.
  insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select p_company_id, ro.id, p.key, 'company'
  from public.roles ro cross join public.permissions p
  where ro.company_id = p_company_id and ro.name in ('Owner', 'Admin');

  -- Manager: read-oriented organisation access.
  insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select p_company_id, ro.id, p.key, 'company'
  from public.roles ro cross join public.permissions p
  where ro.company_id = p_company_id and ro.name = 'Manager'
    and p.key in ('org.branch.read', 'org.member.read', 'org.role.read', 'org.audit.read');

  -- Everyone else: can see their own branches.
  insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select p_company_id, ro.id, 'org.branch.read', 'branch'
  from public.roles ro
  where ro.company_id = p_company_id and ro.name in ('Sales rep', 'Warehouse', 'Accountant', 'Staff');
  return owner_id;
end $$;

-- Create a company for the signed-in user: company, settings, home currency, first branch,
-- system roles, owner membership, active-company pointer and an audit entry.
create function public.create_company(
  p_name text, p_name_local text, p_country_code text, p_home_currency text, p_branch_name text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  cid uuid; mid uuid; bid uuid; owner_role uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where user_id = uid) then
    raise exception 'profile required' using errcode = 'P0001';
  end if;
  if (select count(*) from public.memberships where user_id = uid and status = 'active') >= 5 then
    raise exception 'company limit reached' using errcode = 'P0001';
  end if;

  insert into public.companies (name, name_local, country_code)
    values (btrim(p_name), nullif(btrim(p_name_local), ''), upper(p_country_code)) returning id into cid;
  insert into public.company_settings (company_id) values (cid);
  insert into public.company_currencies (company_id, code, is_home) values (cid, upper(p_home_currency), true);
  insert into public.branches (company_id, name) values (cid, coalesce(nullif(btrim(p_branch_name), ''), 'Main'))
    returning id into bid;
  owner_role := app.seed_system_roles(cid);
  insert into public.memberships (company_id, user_id, display_name)
    values (cid, uid, (select full_name from public.profiles where user_id = uid)) returning id into mid;
  insert into public.membership_roles (company_id, membership_id, role_id) values (cid, mid, owner_role);
  insert into app.user_context (user_id, active_membership_id) values (uid, mid)
    on conflict (user_id) do update set active_membership_id = excluded.active_membership_id;
  perform app.write_audit(cid, mid, 'company.create', 'company', cid, jsonb_build_object('name', p_name));
  return jsonb_build_object('company_id', cid, 'membership_id', mid, 'branch_id', bid);
end $$;

-- Companies the caller belongs to (for the company picker).
create function public.list_my_companies() returns table (
  membership_id uuid, company_id uuid, name text, name_local text, is_active boolean
)
language sql stable security definer set search_path = '' as $$
  select m.id, c.id, c.name, c.name_local,
         (uc.active_membership_id = m.id) as is_active
  from public.memberships m
  join public.companies c on c.id = m.company_id
  left join app.user_context uc on uc.user_id = m.user_id
  where m.user_id = (select auth.uid()) and m.status = 'active'
  order by c.name
$$;

-- Switch the active company; the client then refreshes its session to get new claims.
create function public.switch_company(p_membership_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if not exists (select 1 from public.memberships where id = p_membership_id and user_id = uid and status = 'active') then
    raise exception 'not a member' using errcode = '42501';
  end if;
  insert into app.user_context (user_id, active_membership_id) values (uid, p_membership_id)
    on conflict (user_id) do update set active_membership_id = excluded.active_membership_id;
end $$;

revoke all on function app.write_audit(uuid, uuid, text, text, uuid, jsonb), app.seed_system_roles(uuid),
  app.forbid_audit_change() from public, anon, authenticated;
revoke all on function public.create_company(text, text, text, text, text), public.list_my_companies(),
  public.switch_company(uuid) from public, anon;
grant execute on function public.create_company(text, text, text, text, text), public.list_my_companies(),
  public.switch_company(uuid) to authenticated;

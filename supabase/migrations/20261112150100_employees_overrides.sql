-- Migration 26b: employees, departments, positions, the reporting line, and per-user permission overrides.
-- Rules (decided with Vantha, 2026-11-12):
--  * An employee is the company's HR record. It may or may not be linked to an app user (membership).
--    Only memberships use plan seats; employees are free.
--  * The company hierarchy is the reporting line (employees.reports_to_id). Departments are a flat grouping.
--  * A live user override on a permission wins over roles and the team scope: deny removes it, grant sets the
--    scope stated on the override. Expired overrides are ignored.
--  * Overrides are written only by public.set_permission_override / clear_permission_override.
-- Run migration 26a first.

-- ---------- permission keys ----------
insert into public.permissions (key, description) values
  ('org.employee.read', 'View employees'),
  ('org.employee.manage', 'Create and edit employees, and link them to app users'),
  ('org.department.manage', 'Manage departments'),
  ('org.position.manage', 'Manage positions')
on conflict (key) do nothing;

-- Owner and Admin of every existing company: everything at company scope. Manager: read employees.
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, p.key, 'company'
from public.roles ro cross join public.permissions p
where ro.is_system and ro.name in ('Owner', 'Admin') and p.key in
  ('org.employee.read', 'org.employee.manage', 'org.department.manage', 'org.position.manage')
on conflict do nothing;
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, 'org.employee.read', 'company'
from public.roles ro where ro.is_system and ro.name = 'Manager'
on conflict do nothing;

-- Companies created from now on get the same defaults.
create or replace function app.seed_system_roles(p_company_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid;
begin
  insert into public.roles (company_id, name, is_system) values
    (p_company_id, 'Owner', true) returning id into owner_id;
  insert into public.roles (company_id, name, is_system) values
    (p_company_id, 'Admin', true), (p_company_id, 'Manager', true), (p_company_id, 'Sales rep', true),
    (p_company_id, 'Warehouse', true), (p_company_id, 'Accountant', true), (p_company_id, 'Staff', true);

  insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select p_company_id, ro.id, p.key, 'company'
  from public.roles ro cross join public.permissions p
  where ro.company_id = p_company_id and ro.name in ('Owner', 'Admin');

  insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select p_company_id, ro.id, p.key, 'company'
  from public.roles ro cross join public.permissions p
  where ro.company_id = p_company_id and ro.name = 'Manager'
    and p.key in ('org.branch.read', 'org.member.read', 'org.role.read', 'org.audit.read', 'org.employee.read');

  insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select p_company_id, ro.id, 'org.branch.read', 'branch'
  from public.roles ro
  where ro.company_id = p_company_id and ro.name in ('Sales rep', 'Warehouse', 'Accountant', 'Staff');
  return owner_id;
end $$;

-- ---------- tables ----------
create type public.employee_status as enum ('active', 'on_leave', 'left');
create type public.override_effect as enum ('grant', 'deny');

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  name_local text,
  head_employee_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, name)
);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  name_local text,
  department_id uuid,
  default_role_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, name),
  foreign key (company_id, department_id) references public.departments (company_id, id) on delete set null (department_id),
  foreign key (company_id, default_role_id) references public.roles (company_id, id) on delete set null (default_role_id)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_no text check (employee_no is null or length(btrim(employee_no)) between 1 and 40),
  name text not null check (length(btrim(name)) > 0),
  name_local text,
  department_id uuid,
  position_id uuid,
  branch_id uuid,
  reports_to_id uuid,
  membership_id uuid,
  employment_date date,
  end_date date,
  status public.employee_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, department_id) references public.departments (company_id, id) on delete set null (department_id),
  foreign key (company_id, position_id) references public.positions (company_id, id) on delete set null (position_id),
  foreign key (company_id, branch_id) references public.branches (company_id, id) on delete set null (branch_id),
  foreign key (company_id, reports_to_id) references public.employees (company_id, id) on delete set null (reports_to_id),
  foreign key (company_id, membership_id) references public.memberships (company_id, id) on delete set null (membership_id),
  check (reports_to_id is null or reports_to_id <> id)
);
create unique index employees_employee_no_key on public.employees (company_id, lower(employee_no)) where employee_no is not null;
create unique index employees_membership_key on public.employees (membership_id) where membership_id is not null;
create index employees_reports_to_idx on public.employees (company_id, reports_to_id);
create index employees_department_idx on public.employees (company_id, department_id);

alter table public.departments
  add foreign key (company_id, head_employee_id) references public.employees (company_id, id) on delete set null (head_employee_id);

create table public.membership_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  membership_id uuid not null,
  permission_key text not null references public.permissions (key) on delete cascade,
  effect public.override_effect not null,
  data_scope public.data_scope,
  reason text not null check (length(btrim(reason)) > 0),
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, membership_id) references public.memberships (company_id, id) on delete cascade,
  foreign key (company_id, created_by) references public.memberships (company_id, id) on delete set null (created_by),
  unique (membership_id, permission_key),
  check ((effect = 'grant' and data_scope is not null) or (effect = 'deny' and data_scope is null))
);
create index overrides_company_idx on public.membership_permission_overrides (company_id, membership_id);

-- ---------- triggers ----------
create trigger touch_departments before update on public.departments for each row execute function app.touch_updated_at();
create trigger touch_positions before update on public.positions for each row execute function app.touch_updated_at();
create trigger touch_employees before update on public.employees for each row execute function app.touch_updated_at();
create trigger touch_overrides before update on public.membership_permission_overrides for each row execute function app.touch_updated_at();
create trigger immutable_company_departments before update on public.departments for each row execute function app.forbid_company_change();
create trigger immutable_company_positions before update on public.positions for each row execute function app.forbid_company_change();
create trigger immutable_company_employees before update on public.employees for each row execute function app.forbid_company_change();
create trigger immutable_company_overrides before update on public.membership_permission_overrides for each row execute function app.forbid_company_change();

-- A position cannot suggest the Owner role.
create function app.guard_position() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.default_role_id is not null and exists (
      select 1 from public.roles where company_id = new.company_id and id = new.default_role_id and is_system and name = 'Owner') then
    raise exception 'a position cannot default to the Owner role' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger guard_position before insert or update on public.positions for each row execute function app.guard_position();

-- Reporting line: no cycles, the manager must not have left, and when someone leaves their own reports move up
-- to their manager. An Owner cannot be marked as left; end_date defaults to today.
create function app.guard_employee() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.reports_to_id is not null and (tg_op = 'INSERT' or new.reports_to_id is distinct from old.reports_to_id) then
    if new.reports_to_id = new.id then
      raise exception 'an employee cannot report to themselves' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.employees where company_id = new.company_id and id = new.reports_to_id and status = 'left') then
      raise exception 'the manager has left the company' using errcode = 'P0001';
    end if;
    if exists (
      with recursive up as (
        select e.id, e.reports_to_id from public.employees e where e.company_id = new.company_id and e.id = new.reports_to_id
        union
        select e.id, e.reports_to_id from public.employees e join up on e.id = up.reports_to_id where e.company_id = new.company_id
      ) select 1 from up where up.id = new.id) then
      raise exception 'reporting line would form a loop' using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.status = 'left' and old.status <> 'left' then
    if new.membership_id is not null and exists (
        select 1 from public.membership_roles mr join public.roles ro on ro.company_id = mr.company_id and ro.id = mr.role_id
        where mr.company_id = new.company_id and mr.membership_id = new.membership_id and ro.is_system and ro.name = 'Owner') then
      raise exception 'an owner cannot be marked as left' using errcode = 'P0001';
    end if;
    new.end_date := coalesce(new.end_date, current_date);
    update public.employees set reports_to_id = new.reports_to_id
      where company_id = new.company_id and reports_to_id = new.id and id <> new.id;
    update public.departments set head_employee_id = null where company_id = new.company_id and head_employee_id = new.id;
    if new.membership_id is not null then
      update public.memberships set status = 'suspended'
        where company_id = new.company_id and id = new.membership_id and status = 'active';
    end if;
  end if;
  return new;
end $$;
create trigger guard_employee before insert or update on public.employees for each row execute function app.guard_employee();

-- Audit: only when the row belongs to the caller's active company (also protects the shared audit trigger).
create or replace function app.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  cid uuid;
  eid uuid;
  details jsonb;
begin
  if app.membership_id() is null then
    return coalesce(new, old);
  end if;
  cid := case when tg_table_name = 'companies' then (rec ->> 'id')::uuid else (rec ->> 'company_id')::uuid end;
  if cid is distinct from app.company_id() then
    return coalesce(new, old);
  end if;
  eid := case when tg_table_name = 'company_settings' then cid else (rec ->> 'id')::uuid end;
  if tg_op = 'UPDATE' then
    select jsonb_build_object('old', coalesce(jsonb_object_agg(o.key, o.value), '{}'::jsonb),
                              'new', coalesce(jsonb_object_agg(o.key, n.value), '{}'::jsonb))
    into details
    from jsonb_each(to_jsonb(old)) o
    join jsonb_each(to_jsonb(new)) n using (key)
    where o.value is distinct from n.value and o.key <> 'updated_at';
  else
    details := jsonb_build_object('row', rec);
  end if;
  perform app.write_audit(cid, app.membership_id(), tg_table_name || '.' || lower(tg_op), tg_table_name, eid, details);
  return coalesce(new, old);
end $$;
create trigger audit_departments after insert or update or delete on public.departments for each row execute function app.audit_row();
create trigger audit_positions after insert or update or delete on public.positions for each row execute function app.audit_row();
create trigger audit_employees after insert or update or delete on public.employees for each row execute function app.audit_row();

-- ---------- the team below the caller ----------
create function app.my_employee_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select e.id from public.employees e
  where e.company_id = app.company_id() and e.membership_id = app.membership_id() and (select app.is_active_member())
$$;

-- The caller's employee and everyone below them in the reporting line (leavers stay under their old manager).
create function app.team_employee_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  with recursive team as (
    select e.id from public.employees e where e.id = (select app.my_employee_id())
    union
    select e.id from public.employees e join team t on e.reports_to_id = t.id where e.company_id = app.company_id()
  ) select id from team
$$;

-- Memberships of the caller's team plus the caller: what a "team" scope policy on a record owner should use.
create function app.team_membership_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select (select app.membership_id()) where (select app.is_active_member())
  union
  select e.membership_id from public.employees e
  where e.company_id = app.company_id() and e.membership_id is not null and e.id in (select app.team_employee_ids())
$$;

-- ---------- effective permissions: a live override wins over roles ----------
create or replace function app.permission_scope(p_key text) returns public.data_scope
language sql stable security definer set search_path = '' as $$
  with me as (
    select m.id from public.memberships m
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
  group by rp.permission_key
  union all
  select ov.permission_key, ov.data_scope from ov where ov.effect = 'grant'
$$;

-- ---------- RLS ----------
alter table public.departments enable row level security;
alter table public.positions enable row level security;
alter table public.employees enable row level security;
alter table public.membership_permission_overrides enable row level security;
alter table public.departments force row level security;
alter table public.positions force row level security;
alter table public.employees force row level security;
alter table public.membership_permission_overrides force row level security;

create policy departments_select on public.departments for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member()));
create policy departments_insert on public.departments for insert to authenticated
  with check (company_id = (select app.company_id()) and (select app.permission_scope('org.department.manage')) = 'company');
create policy departments_update on public.departments for update to authenticated
  using (company_id = (select app.company_id()) and (select app.permission_scope('org.department.manage')) = 'company')
  with check (company_id = (select app.company_id()));
create policy departments_delete on public.departments for delete to authenticated
  using (company_id = (select app.company_id()) and (select app.permission_scope('org.department.manage')) = 'company');

create policy positions_select on public.positions for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member()));
create policy positions_insert on public.positions for insert to authenticated
  with check (company_id = (select app.company_id()) and (select app.permission_scope('org.position.manage')) = 'company');
create policy positions_update on public.positions for update to authenticated
  using (company_id = (select app.company_id()) and (select app.permission_scope('org.position.manage')) = 'company')
  with check (company_id = (select app.company_id()));
create policy positions_delete on public.positions for delete to authenticated
  using (company_id = (select app.company_id()) and (select app.permission_scope('org.position.manage')) = 'company');

-- Employees: your own record always; your team with a team-scope read; everyone with a company-scope read.
create policy employees_select on public.employees for select to authenticated
  using (
    company_id = (select app.company_id())
    and (
      (membership_id is not null and membership_id = (select app.membership_id()) and (select app.is_active_member()))
      or (select app.permission_scope('org.employee.read')) = 'company'
      or ((select app.permission_scope('org.employee.read')) = 'team' and id in (select app.team_employee_ids()))
    )
  );
create policy employees_insert on public.employees for insert to authenticated
  with check (company_id = (select app.company_id()) and (select app.permission_scope('org.employee.manage')) = 'company');
create policy employees_update on public.employees for update to authenticated
  using (company_id = (select app.company_id()) and (select app.permission_scope('org.employee.manage')) = 'company')
  with check (company_id = (select app.company_id()));
create policy employees_delete on public.employees for delete to authenticated
  using (company_id = (select app.company_id()) and (select app.permission_scope('org.employee.manage')) = 'company');

-- Overrides: read by people who can read roles at company scope, and your own (so the console can explain a missing menu).
create policy overrides_select on public.membership_permission_overrides for select to authenticated
  using (
    company_id = (select app.company_id())
    and (
      (membership_id = (select app.membership_id()) and (select app.is_active_member()))
      or (select app.permission_scope('org.role.read')) = 'company'
    )
  );

grant select, insert (company_id, name, name_local, head_employee_id), update (name, name_local, head_employee_id, is_active), delete
  on public.departments to authenticated;
grant select, insert (company_id, name, name_local, department_id, default_role_id), update (name, name_local, department_id, default_role_id, is_active), delete
  on public.positions to authenticated;
grant select,
  insert (company_id, employee_no, name, name_local, department_id, position_id, branch_id, reports_to_id, employment_date, end_date, status),
  update (employee_no, name, name_local, department_id, position_id, branch_id, reports_to_id, employment_date, end_date, status),
  delete
  on public.employees to authenticated;
grant select on public.membership_permission_overrides to authenticated;

-- ---------- RPCs ----------
-- Link or unlink (p_membership_id null) an employee and an app user of the same company.
create function public.link_employee(p_employee_id uuid, p_membership_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select app.is_active_member()) or (select app.permission_scope('org.employee.manage')) is distinct from 'company' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.employees where id = p_employee_id and company_id = app.company_id()) then
    raise exception 'employee not found' using errcode = 'P0002';
  end if;
  if p_membership_id is not null then
    if not exists (select 1 from public.memberships where id = p_membership_id and company_id = app.company_id()) then
      raise exception 'member not found' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.employees where membership_id = p_membership_id and id <> p_employee_id) then
      raise exception 'that member is already linked to another employee' using errcode = '23505';
    end if;
  end if;
  update public.employees set membership_id = p_membership_id where id = p_employee_id and company_id = app.company_id();
  perform app.write_audit(app.company_id(), app.membership_id(), case when p_membership_id is null then 'employee.unlink' else 'employee.link' end,
    'employee', p_employee_id, jsonb_build_object('membership_id', p_membership_id));
end $$;

create function app.scope_rank(s public.data_scope) returns integer
language sql immutable set search_path = '' as $$
  select case s when 'own' then 1 when 'team' then 2 when 'branch' then 3 when 'company' then 4 else 0 end
$$;

-- Grant or deny one permission for one member. Guards: caller manages roles at company scope, not on yourself,
-- not on an Owner, never above your own access, platform keys are not in the catalog, a reason is required.
create function public.set_permission_override(
  p_membership_id uuid, p_permission_key text, p_effect text, p_scope public.data_scope, p_reason text, p_expires_at timestamptz default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  eff public.override_effect;
  oid uuid;
  mine public.data_scope;
begin
  if not (select app.is_active_member()) or (select app.permission_scope('org.role.manage')) is distinct from 'company' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_effect not in ('grant', 'deny') then raise exception 'effect must be grant or deny' using errcode = 'P0001'; end if;
  eff := p_effect::public.override_effect;
  if p_membership_id = app.membership_id() then
    raise exception 'you cannot change your own permissions' using errcode = '42501';
  end if;
  if not exists (select 1 from public.memberships where id = p_membership_id and company_id = app.company_id()) then
    raise exception 'member not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.membership_roles mr join public.roles ro on ro.company_id = mr.company_id and ro.id = mr.role_id
             where mr.company_id = app.company_id() and mr.membership_id = p_membership_id and ro.is_system and ro.name = 'Owner') then
    raise exception 'an owner cannot be overridden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.permissions where key = p_permission_key) then
    raise exception 'unknown permission' using errcode = 'P0002';
  end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'a reason is required' using errcode = 'P0001'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'expiry must be in the future' using errcode = 'P0001'; end if;
  if eff = 'grant' then
    if p_scope is null then raise exception 'a grant needs a scope' using errcode = 'P0001'; end if;
    mine := app.permission_scope(p_permission_key);
    if mine is null or app.scope_rank(p_scope) > app.scope_rank(mine) then
      raise exception 'you cannot grant more than you have' using errcode = '42501';
    end if;
  elsif p_scope is not null then
    raise exception 'a deny has no scope' using errcode = 'P0001';
  end if;
  insert into public.membership_permission_overrides
    (company_id, membership_id, permission_key, effect, data_scope, reason, expires_at, created_by)
  values (app.company_id(), p_membership_id, p_permission_key, eff, p_scope, btrim(p_reason), p_expires_at, app.membership_id())
  on conflict (membership_id, permission_key) do update
    set effect = excluded.effect, data_scope = excluded.data_scope, reason = excluded.reason,
        expires_at = excluded.expires_at, created_by = excluded.created_by
  returning id into oid;
  perform app.write_audit(app.company_id(), app.membership_id(), 'permission_override.set', 'membership', p_membership_id,
    jsonb_build_object('permission', p_permission_key, 'effect', p_effect, 'scope', p_scope, 'reason', btrim(p_reason), 'expires_at', p_expires_at));
  return oid;
end $$;

create function public.clear_permission_override(p_membership_id uuid, p_permission_key text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select app.is_active_member()) or (select app.permission_scope('org.role.manage')) is distinct from 'company' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_membership_id = app.membership_id() then
    raise exception 'you cannot change your own permissions' using errcode = '42501';
  end if;
  delete from public.membership_permission_overrides
    where company_id = app.company_id() and membership_id = p_membership_id and permission_key = p_permission_key;
  if found then
    perform app.write_audit(app.company_id(), app.membership_id(), 'permission_override.clear', 'membership', p_membership_id,
      jsonb_build_object('permission', p_permission_key));
  end if;
end $$;

-- ---------- every new membership gets an employee record ----------
create function app.employee_for_new_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pid uuid;
begin
  if exists (select 1 from public.employees where membership_id = new.id) then return new; end if;
  select id into pid from public.positions where company_id = new.company_id and lower(name) = lower(btrim(new.job_title));
  insert into public.employees (company_id, employee_no, name, position_id, employment_date, membership_id)
  values (new.company_id, new.employee_id, coalesce(nullif(btrim(new.display_name), ''), 'Unnamed'), pid, new.employment_date, new.id)
  on conflict do nothing;
  return new;
end $$;
create trigger employee_for_new_membership after insert on public.memberships
  for each row execute function app.employee_for_new_membership();

-- Backfill: one position per distinct job title, one employee per existing membership.
insert into public.positions (company_id, name)
select distinct m.company_id, btrim(m.job_title) from public.memberships m
where nullif(btrim(m.job_title), '') is not null
on conflict do nothing;
insert into public.employees (company_id, employee_no, name, position_id, employment_date, membership_id)
select m.company_id, m.employee_id, coalesce(nullif(btrim(m.display_name), ''), 'Unnamed'),
       (select p.id from public.positions p where p.company_id = m.company_id and lower(p.name) = lower(btrim(m.job_title))),
       m.employment_date, m.id
from public.memberships m
where not exists (select 1 from public.employees e where e.membership_id = m.id)
on conflict do nothing;

revoke all on function app.guard_position(), app.guard_employee(), app.my_employee_id(), app.team_employee_ids(),
  app.team_membership_ids(), app.scope_rank(public.data_scope), app.employee_for_new_membership() from public, anon, authenticated;
grant execute on function app.my_employee_id(), app.team_employee_ids(), app.team_membership_ids(), app.scope_rank(public.data_scope) to authenticated;
revoke all on function public.link_employee(uuid, uuid), public.set_permission_override(uuid, text, text, public.data_scope, text, timestamptz),
  public.clear_permission_override(uuid, text) from public, anon;
grant execute on function public.link_employee(uuid, uuid), public.set_permission_override(uuid, text, text, public.data_scope, text, timestamptz),
  public.clear_permission_override(uuid, text) to authenticated;

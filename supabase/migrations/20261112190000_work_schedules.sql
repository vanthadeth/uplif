-- Migration 30: working time (slice 1 of work schedules, holidays and leave).
-- Rules (plan approved 2026-11-12):
--  * A schedule is a named weekly pattern. Editing it saves a new version that takes effect from a date; earlier days keep
--    the old version. Schedules are archived, never deleted.
--  * Assignments say who uses which schedule: employee, then department, then branch, then the company default; the
--    first level that has an assignment wins. Each assignment has a start date, so earlier days never change. An
--    employee, department or branch assignment with no schedule means "inherit from the next level".
--  * app.work_day(employee, date) is the single answer to "what is this person expected to do on this date?". Attendance,
--    leave and reports will all call it. Holidays and leave extend it in later slices.
--  * Everything is written through the RPCs below (same style as the permission override calls); tables are read-only
--    to the app. The company timezone (and an optional branch timezone) decides what "today" means.
-- Run migration 29 first.

-- ---------- permission keys ----------
insert into public.permissions (key, description) values
  ('attendance.schedule.read', 'See work schedules and who uses which'),
  ('attendance.schedule.manage', 'Create work schedules and assign them')
on conflict (key) do nothing;

insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, p.key, 'company'
from public.roles ro cross join public.permissions p
where ro.is_system and ro.name in ('Owner', 'Admin') and p.key in ('attendance.schedule.read', 'attendance.schedule.manage')
on conflict do nothing;
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, 'attendance.schedule.read', 'team'
from public.roles ro where ro.is_system and ro.name = 'Manager'
on conflict do nothing;
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, 'attendance.schedule.read', 'own'
from public.roles ro where ro.is_system and ro.name in ('Sales rep', 'Warehouse', 'Accountant', 'Staff')
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
  select p_company_id, ro.id, 'attendance.schedule.read', 'team'
  from public.roles ro where ro.company_id = p_company_id and ro.name = 'Manager';

  insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select p_company_id, ro.id, 'org.branch.read', 'branch'
  from public.roles ro
  where ro.company_id = p_company_id and ro.name in ('Sales rep', 'Warehouse', 'Accountant', 'Staff');

  insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select p_company_id, ro.id, 'attendance.schedule.read', 'own'
  from public.roles ro
  where ro.company_id = p_company_id and ro.name in ('Sales rep', 'Warehouse', 'Accountant', 'Staff');
  return owner_id;
end $$;

-- ---------- timezone and setup flag ----------
alter table public.company_settings
  add column timezone text not null default 'Asia/Phnom_Penh',
  add column work_setup_done boolean not null default false;
alter table public.branches add column timezone text;

create function app.guard_timezone() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.timezone is not null and not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'unknown timezone' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger guard_timezone_settings before insert or update on public.company_settings for each row execute function app.guard_timezone();
create trigger guard_timezone_branches before insert or update on public.branches for each row execute function app.guard_timezone();

grant update (timezone) on public.company_settings to authenticated;
grant update (name, name_local, is_active, timezone) on public.branches to authenticated;

-- ---------- tables ----------
create type public.schedule_day_kind as enum ('full', 'half', 'off');
create type public.assignment_scope as enum ('company', 'branch', 'department', 'employee');

create table public.work_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  name_local text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, name)
);

create table public.work_schedule_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  schedule_id uuid not null,
  valid_from date not null,
  grace_late_min integer not null default 10 check (grace_late_min between 0 and 720),
  grace_early_min integer not null default 0 check (grace_early_min between 0 and 720),
  earliest_clock_in_min integer not null default 60 check (earliest_clock_in_min between 0 and 720),
  half_day_late_min integer not null default 120 check (half_day_late_min between 0 and 720),
  overtime_after_min integer not null default 30 check (overtime_after_min between 0 and 720),
  overtime_needs_approval boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (schedule_id, valid_from),
  foreign key (company_id, schedule_id) references public.work_schedules (company_id, id) on delete cascade
);
create index work_schedule_versions_idx on public.work_schedule_versions (company_id, schedule_id, valid_from desc);

create table public.work_schedule_days (
  company_id uuid not null,
  version_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),  -- ISO: 1 = Monday ... 7 = Sunday
  day_kind public.schedule_day_kind not null,
  start_time time,
  end_time time,
  break_min integer not null default 0 check (break_min between 0 and 480),
  primary key (version_id, weekday),
  foreign key (company_id, version_id) references public.work_schedule_versions (company_id, id) on delete cascade,
  check ((day_kind = 'off' and start_time is null and end_time is null)
      or (day_kind <> 'off' and start_time is not null and end_time is not null and start_time <> end_time))
);
create index work_schedule_days_company_idx on public.work_schedule_days (company_id);

create table public.work_schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  scope public.assignment_scope not null,
  target_id uuid,
  schedule_id uuid,
  effective_from date not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, schedule_id) references public.work_schedules (company_id, id) on delete restrict,
  foreign key (company_id, created_by) references public.memberships (company_id, id) on delete set null (created_by),
  check ((scope = 'company') = (target_id is null)),
  check (scope <> 'company' or schedule_id is not null)
);
create unique index work_assignments_key on public.work_schedule_assignments
  (company_id, scope, coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid), effective_from);
create index work_assignments_target_idx on public.work_schedule_assignments (company_id, scope, target_id, effective_from desc);

-- ---------- triggers ----------
create trigger touch_work_schedules before update on public.work_schedules for each row execute function app.touch_updated_at();
create trigger touch_work_versions before update on public.work_schedule_versions for each row execute function app.touch_updated_at();
create trigger touch_work_assignments before update on public.work_schedule_assignments for each row execute function app.touch_updated_at();
create trigger immutable_company_work_schedules before update on public.work_schedules for each row execute function app.forbid_company_change();
create trigger immutable_company_work_versions before update on public.work_schedule_versions for each row execute function app.forbid_company_change();
create trigger immutable_company_work_days before update on public.work_schedule_days for each row execute function app.forbid_company_change();
create trigger immutable_company_work_assignments before update on public.work_schedule_assignments for each row execute function app.forbid_company_change();
create trigger audit_work_schedules after insert or update or delete on public.work_schedules for each row execute function app.audit_row();
create trigger audit_work_versions after insert or update or delete on public.work_schedule_versions for each row execute function app.audit_row();
create trigger audit_work_assignments after insert or update or delete on public.work_schedule_assignments for each row execute function app.audit_row();

-- An assignment's target must belong to the same company.
create function app.guard_work_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.scope = 'branch' and not exists (select 1 from public.branches where company_id = new.company_id and id = new.target_id)
     or new.scope = 'department' and not exists (select 1 from public.departments where company_id = new.company_id and id = new.target_id)
     or new.scope = 'employee' and not exists (select 1 from public.employees where company_id = new.company_id and id = new.target_id) then
    raise exception 'assignment target not found' using errcode = 'P0002';
  end if;
  return new;
end $$;
create trigger guard_work_assignment before insert or update on public.work_schedule_assignments for each row execute function app.guard_work_assignment();

-- Assignments go away with their target.
create function app.drop_work_assignments() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.work_schedule_assignments
  where company_id = old.company_id and scope = tg_argv[0]::public.assignment_scope and target_id = old.id;
  return old;
end $$;
create trigger drop_assignments_branches after delete on public.branches for each row execute function app.drop_work_assignments('branch');
create trigger drop_assignments_departments after delete on public.departments for each row execute function app.drop_work_assignments('department');
create trigger drop_assignments_employees after delete on public.employees for each row execute function app.drop_work_assignments('employee');

-- ---------- read access helpers ----------
-- Today's date in the company's timezone, or in the employee's branch timezone when it has one.
create function app.local_today(p_branch_id uuid default null) returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce(
    (select b.timezone from public.branches b where b.company_id = app.company_id() and b.id = p_branch_id),
    (select cs.timezone from public.company_settings cs where cs.company_id = app.company_id()),
    'Asia/Phnom_Penh'))::date
$$;

-- May the caller see this employee's schedule? Own record always; team, branch or company by the scope of the permission.
create function app.can_read_employee_schedule(p_employee_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select app.is_active_member()) and exists (
    select 1 from public.employees e
    where e.id = p_employee_id and e.company_id = app.company_id()
      and (select app.permission_scope('attendance.schedule.read')) is not null
      and (
        e.id = (select app.my_employee_id())
        or (select app.permission_scope('attendance.schedule.read')) = 'company'
        or ((select app.permission_scope('attendance.schedule.read')) = 'team' and e.id in (select app.team_employee_ids()))
        or ((select app.permission_scope('attendance.schedule.read')) = 'branch' and e.branch_id = any (app.my_branch_ids()))
      ))
$$;

-- ---------- the work-day resolver ----------
-- day_kind: work, half, off, none (no schedule applies) or not_employed (before the start or after the end date).
create function app.work_day(p_employee_id uuid, p_date date)
returns table (day_kind text, schedule_id uuid, version_id uuid, source public.assignment_scope,
               start_time time, end_time time, break_min integer, hours numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.employees%rowtype;
  sid uuid;
  src public.assignment_scope;
  vid uuid;
  d public.work_schedule_days%rowtype;
  mins numeric;
begin
  select * into e from public.employees where id = p_employee_id;
  if not found then return; end if;
  if (e.employment_date is not null and p_date < e.employment_date) or (e.end_date is not null and p_date > e.end_date) then
    return query select 'not_employed'::text, null::uuid, null::uuid, null::public.assignment_scope, null::time, null::time, null::integer, 0::numeric;
    return;
  end if;
  -- The newest assignment of each level that has started; the most specific level with a schedule wins.
  select l.schedule_id, l.scope into sid, src from (
    select distinct on (x.scope) x.scope, x.schedule_id
    from public.work_schedule_assignments x
    where x.company_id = e.company_id and x.effective_from <= p_date
      and (x.scope = 'company'
        or (x.scope = 'employee' and x.target_id = e.id)
        or (x.scope = 'department' and x.target_id = e.department_id)
        or (x.scope = 'branch' and x.target_id = e.branch_id))
    order by x.scope, x.effective_from desc
  ) l
  where l.schedule_id is not null
  order by case l.scope when 'employee' then 1 when 'department' then 2 when 'branch' then 3 else 4 end
  limit 1;
  if sid is null then
    return query select 'none'::text, null::uuid, null::uuid, null::public.assignment_scope, null::time, null::time, null::integer, 0::numeric;
    return;
  end if;
  select v.id into vid from public.work_schedule_versions v
  where v.company_id = e.company_id and v.schedule_id = sid and v.valid_from <= p_date
  order by v.valid_from desc limit 1;
  select * into d from public.work_schedule_days sd where sd.version_id = vid and sd.weekday = extract(isodow from p_date)::int;
  if vid is null or not found then
    return query select 'none'::text, sid, vid, src, null::time, null::time, null::integer, 0::numeric;
    return;
  end if;
  if d.day_kind = 'off' then
    return query select 'off'::text, sid, vid, src, null::time, null::time, null::integer, 0::numeric;
    return;
  end if;
  -- A shift that ends at or before its start crosses midnight and belongs to the day it starts.
  mins := extract(epoch from (d.end_time - d.start_time)) / 60;
  if mins <= 0 then mins := mins + 1440; end if;
  return query select case d.day_kind when 'half' then 'half' else 'work' end, sid, vid, src,
    d.start_time, d.end_time, d.break_min, round(greatest(mins - d.break_min, 0) / 60, 2);
end $$;
revoke execute on function app.work_day(uuid, date) from public, anon, authenticated;

-- Hours in one week of a version (used by the pages).
create function app.version_week_hours(p_version_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(round(greatest(
    (case when d.end_time > d.start_time then extract(epoch from (d.end_time - d.start_time)) / 60
          else extract(epoch from (d.end_time - d.start_time)) / 60 + 1440 end) - d.break_min, 0) / 60, 2)), 0)
  from public.work_schedule_days d where d.version_id = p_version_id and d.day_kind <> 'off'
$$;
revoke execute on function app.version_week_hours(uuid) from public, anon, authenticated;

-- ---------- RLS ----------
alter table public.work_schedules enable row level security;
alter table public.work_schedule_versions enable row level security;
alter table public.work_schedule_days enable row level security;
alter table public.work_schedule_assignments enable row level security;
alter table public.work_schedules force row level security;
alter table public.work_schedule_versions force row level security;
alter table public.work_schedule_days force row level security;
alter table public.work_schedule_assignments force row level security;

-- Anyone with any scope of the read permission may see the schedule patterns (they are company settings, not people data).
create policy work_schedules_select on public.work_schedules for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and (select app.permission_scope('attendance.schedule.read')) is not null);
create policy work_versions_select on public.work_schedule_versions for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and (select app.permission_scope('attendance.schedule.read')) is not null);
create policy work_days_select on public.work_schedule_days for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and (select app.permission_scope('attendance.schedule.read')) is not null);

-- Assignments name employees, so they follow the scope: company sees all; others see the company default, their own
-- branch and department, and employees they may read.
create policy work_assignments_select on public.work_schedule_assignments for select to authenticated
  using (
    company_id = (select app.company_id()) and (select app.is_active_member())
    and (select app.permission_scope('attendance.schedule.read')) is not null
    and (
      (select app.permission_scope('attendance.schedule.read')) = 'company'
      or scope = 'company'
      or (scope = 'employee' and (select app.can_read_employee_schedule(target_id)))
      or (scope = 'department' and target_id = (select e.department_id from public.employees e where e.id = (select app.my_employee_id())))
      or (scope = 'branch' and target_id = (select e.branch_id from public.employees e where e.id = (select app.my_employee_id())))
    )
  );

grant select on public.work_schedules, public.work_schedule_versions, public.work_schedule_days, public.work_schedule_assignments to authenticated;

-- ---------- internals ----------
create function app.require_schedule_manage() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select app.is_active_member()) or (select app.permission_scope('attendance.schedule.manage')) is distinct from 'company' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end $$;
revoke execute on function app.require_schedule_manage() from public, anon, authenticated;

-- Days for one of the three starting patterns. weekday 1 = Monday.
create function app.pattern_days(p_pattern text) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_agg(case
      when w <= 5 or (p_pattern = 'mon_sat' and w = 6)
        then jsonb_build_object('weekday', w, 'kind', 'full', 'start', '08:00', 'end', '17:00', 'break_min', 60)
      when w = 6 and p_pattern = 'mon_fri_sat_half'
        then jsonb_build_object('weekday', w, 'kind', 'half', 'start', '08:00', 'end', '12:00', 'break_min', 0)
      else jsonb_build_object('weekday', w, 'kind', 'off') end order by w)
  from generate_series(1, 7) w
  where p_pattern in ('mon_fri', 'mon_fri_sat_half', 'mon_sat')
$$;

-- Writes one version of a schedule. A version that already starts on that date and has not started yet is replaced.
create function app.write_schedule_version(p_company_id uuid, p_schedule_id uuid, p_valid_from date, p_rules jsonb, p_days jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  vid uuid;
  today date := app.local_today();
  n integer;
begin
  if p_days is null or jsonb_typeof(p_days) <> 'array' then
    raise exception 'days are required' using errcode = 'P0001';
  end if;
  select count(distinct (x ->> 'weekday')::int) into n from jsonb_array_elements(p_days) x
    where (x ->> 'weekday')::int between 1 and 7;
  if n <> 7 or jsonb_array_length(p_days) <> 7 then
    raise exception 'seven different weekdays are required' using errcode = 'P0001';
  end if;
  select id into vid from public.work_schedule_versions where schedule_id = p_schedule_id and valid_from = p_valid_from;
  if vid is not null then
    if p_valid_from <= today then
      raise exception 'a version already starts on that date' using errcode = 'P0001';
    end if;
    delete from public.work_schedule_days where version_id = vid;
    update public.work_schedule_versions set
      grace_late_min = coalesce((p_rules ->> 'grace_late_min')::int, 10),
      grace_early_min = coalesce((p_rules ->> 'grace_early_min')::int, 0),
      earliest_clock_in_min = coalesce((p_rules ->> 'earliest_clock_in_min')::int, 60),
      half_day_late_min = coalesce((p_rules ->> 'half_day_late_min')::int, 120),
      overtime_after_min = coalesce((p_rules ->> 'overtime_after_min')::int, 30),
      overtime_needs_approval = coalesce((p_rules ->> 'overtime_needs_approval')::boolean, true)
    where id = vid;
  else
    insert into public.work_schedule_versions (company_id, schedule_id, valid_from, grace_late_min, grace_early_min,
      earliest_clock_in_min, half_day_late_min, overtime_after_min, overtime_needs_approval)
    values (p_company_id, p_schedule_id, p_valid_from,
      coalesce((p_rules ->> 'grace_late_min')::int, 10), coalesce((p_rules ->> 'grace_early_min')::int, 0),
      coalesce((p_rules ->> 'earliest_clock_in_min')::int, 60), coalesce((p_rules ->> 'half_day_late_min')::int, 120),
      coalesce((p_rules ->> 'overtime_after_min')::int, 30), coalesce((p_rules ->> 'overtime_needs_approval')::boolean, true))
    returning id into vid;
  end if;
  insert into public.work_schedule_days (company_id, version_id, weekday, day_kind, start_time, end_time, break_min)
  select p_company_id, vid, (x ->> 'weekday')::int, (x ->> 'kind')::public.schedule_day_kind,
         case when x ->> 'kind' = 'off' then null else (x ->> 'start')::time end,
         case when x ->> 'kind' = 'off' then null else (x ->> 'end')::time end,
         case when x ->> 'kind' = 'off' then 0 else coalesce((x ->> 'break_min')::int, 0) end
  from jsonb_array_elements(p_days) x;
  return vid;
end $$;
revoke execute on function app.write_schedule_version(uuid, uuid, date, jsonb, jsonb) from public, anon, authenticated;

-- ---------- RPCs ----------
-- Create a schedule (p_schedule_id null) or save a new version of one. A new schedule's first version covers all time;
-- a new version of an existing schedule starts on p_effective_from, which cannot be in the past.
create function public.save_work_schedule(
  p_schedule_id uuid, p_name text, p_name_local text, p_effective_from date, p_rules jsonb, p_days jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  sid uuid := p_schedule_id;
  vfrom date;
begin
  perform app.require_schedule_manage();
  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'name is required' using errcode = 'P0001';
  end if;
  if sid is null then
    if (select count(*) from public.work_schedules where company_id = cid) >= 50 then
      raise exception 'schedule limit reached' using errcode = 'P0001';
    end if;
    insert into public.work_schedules (company_id, name, name_local)
      values (cid, btrim(p_name), nullif(btrim(coalesce(p_name_local, '')), '')) returning id into sid;
    vfrom := date '2000-01-01';
  else
    if not exists (select 1 from public.work_schedules where id = sid and company_id = cid) then
      raise exception 'schedule not found' using errcode = 'P0002';
    end if;
    if p_effective_from is null or p_effective_from < app.local_today() then
      raise exception 'a new version cannot start in the past' using errcode = 'P0001';
    end if;
    update public.work_schedules set name = btrim(p_name), name_local = nullif(btrim(coalesce(p_name_local, '')), '')
      where id = sid and company_id = cid;
    vfrom := p_effective_from;
  end if;
  perform app.write_schedule_version(cid, sid, vfrom, coalesce(p_rules, '{}'::jsonb), p_days);
  return sid;
end $$;

create function public.set_work_schedule_active(p_schedule_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  today date := app.local_today();
begin
  perform app.require_schedule_manage();
  if not exists (select 1 from public.work_schedules where id = p_schedule_id and company_id = cid) then
    raise exception 'schedule not found' using errcode = 'P0002';
  end if;
  if not p_active and exists (
      select 1 from public.work_schedule_assignments a
      where a.company_id = cid and a.schedule_id = p_schedule_id
        and not exists (select 1 from public.work_schedule_assignments b
                        where b.company_id = a.company_id and b.scope = a.scope
                          and b.target_id is not distinct from a.target_id
                          and b.effective_from > a.effective_from and b.effective_from <= today)) then
    raise exception 'schedule is in use' using errcode = 'P0001';
  end if;
  update public.work_schedules set is_active = p_active where id = p_schedule_id and company_id = cid;
end $$;

-- Say who uses a schedule from a date. p_schedule_id null (not for the company level) means "inherit from the next level".
create function public.assign_work_schedule(
  p_scope public.assignment_scope, p_target_id uuid, p_schedule_id uuid, p_effective_from date
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  new_id uuid;
  cur record;
begin
  perform app.require_schedule_manage();
  if p_effective_from is null or p_effective_from < app.local_today() then
    raise exception 'an assignment cannot start in the past' using errcode = 'P0001';
  end if;
  if p_schedule_id is not null and not exists (
      select 1 from public.work_schedules where id = p_schedule_id and company_id = cid and is_active) then
    raise exception 'schedule not found' using errcode = 'P0002';
  end if;
  select a.id, a.effective_from into cur from public.work_schedule_assignments a
    where a.company_id = cid and a.scope = p_scope and a.target_id is not distinct from p_target_id and a.effective_from = p_effective_from;
  if found then
    -- Replacing one that already started would rewrite history; only a future one may be replaced.
    if cur.effective_from <= app.local_today() then
      raise exception 'an assignment already starts on that date' using errcode = 'P0001';
    end if;
    update public.work_schedule_assignments set schedule_id = p_schedule_id, created_by = app.membership_id() where id = cur.id;
    return cur.id;
  end if;
  insert into public.work_schedule_assignments (company_id, scope, target_id, schedule_id, effective_from, created_by)
    values (cid, p_scope, p_target_id, p_schedule_id, p_effective_from, app.membership_id()) returning work_schedule_assignments.id into new_id;
  return new_id;
end $$;

-- Only an assignment that has not started yet can be removed; earlier ones are history.
create function public.remove_work_assignment(p_assignment_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  a public.work_schedule_assignments%rowtype;
begin
  perform app.require_schedule_manage();
  select * into a from public.work_schedule_assignments where id = p_assignment_id and company_id = cid;
  if not found then
    raise exception 'assignment not found' using errcode = 'P0002';
  end if;
  if a.effective_from <= app.local_today() then
    raise exception 'an assignment that has started cannot be removed' using errcode = 'P0001';
  end if;
  delete from public.work_schedule_assignments where id = p_assignment_id and company_id = cid;
end $$;

-- First-time setup: one pattern becomes the company's "Standard week" default. Safe to call again: if the company
-- already has a default, nothing is created and the setup is just marked done.
create function public.setup_working_time(p_pattern text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  sid uuid;
  days jsonb := app.pattern_days(p_pattern);
begin
  perform app.require_schedule_manage();
  if days is null then
    raise exception 'unknown pattern' using errcode = 'P0001';
  end if;
  select a.schedule_id into sid from public.work_schedule_assignments a
    where a.company_id = cid and a.scope = 'company' order by a.effective_from limit 1;
  if sid is null then
    insert into public.work_schedules (company_id, name, name_local)
      values (cid, 'Standard week', 'សប្តាហ៍ធម្មតា')
      on conflict (company_id, name) do update set is_active = true returning id into sid;
    if not exists (select 1 from public.work_schedule_versions where schedule_id = sid) then
      perform app.write_schedule_version(cid, sid, date '2000-01-01', '{}'::jsonb, days);
    end if;
    insert into public.work_schedule_assignments (company_id, scope, target_id, schedule_id, effective_from, created_by)
      values (cid, 'company', null, sid, date '2000-01-01', app.membership_id());
  end if;
  update public.company_settings set work_setup_done = true where company_id = cid;
  return sid;
end $$;

-- What one employee is expected to do on each day of a range (at most 62 days), as the resolver answers it.
create function public.employee_work_days(p_employee_id uuid, p_from date, p_days integer default 14)
returns table (day date, day_kind text, schedule_id uuid, source public.assignment_scope,
               start_time time, end_time time, break_min integer, hours numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select app.can_read_employee_schedule(p_employee_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_from is null or p_days is null or p_days < 1 or p_days > 62 then
    raise exception 'range not allowed' using errcode = 'P0001';
  end if;
  return query
    select d::date, w.day_kind, w.schedule_id, w.source, w.start_time, w.end_time, w.break_min, w.hours
    from generate_series(p_from::timestamp, (p_from + (p_days - 1))::timestamp, interval '1 day') d,
         lateral app.work_day(p_employee_id, d::date) w
    order by 1;
end $$;

-- Hours per week of every version the caller may see (the pages show it beside each schedule).
create function public.work_schedule_week_hours() returns table (version_id uuid, hours numeric)
language sql stable security definer set search_path = '' as $$
  select v.id, app.version_week_hours(v.id)
  from public.work_schedule_versions v
  where v.company_id = app.company_id() and (select app.is_active_member())
    and (select app.permission_scope('attendance.schedule.read')) is not null
$$;

revoke execute on function public.save_work_schedule(uuid, text, text, date, jsonb, jsonb) from public, anon;
revoke execute on function public.set_work_schedule_active(uuid, boolean) from public, anon;
revoke execute on function public.assign_work_schedule(public.assignment_scope, uuid, uuid, date) from public, anon;
revoke execute on function public.remove_work_assignment(uuid) from public, anon;
revoke execute on function public.setup_working_time(text) from public, anon;
revoke execute on function public.employee_work_days(uuid, date, integer) from public, anon;
revoke execute on function public.work_schedule_week_hours() from public, anon;
grant execute on function public.save_work_schedule(uuid, text, text, date, jsonb, jsonb) to authenticated;
grant execute on function public.set_work_schedule_active(uuid, boolean) to authenticated;
grant execute on function public.assign_work_schedule(public.assignment_scope, uuid, uuid, date) to authenticated;
grant execute on function public.remove_work_assignment(uuid) to authenticated;
grant execute on function public.setup_working_time(text) to authenticated;
grant execute on function public.employee_work_days(uuid, date, integer) to authenticated;
grant execute on function public.work_schedule_week_hours() to authenticated;

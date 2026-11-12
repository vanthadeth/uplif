-- Migration 32: company holidays (slice 2 of work schedules, holidays and leave).
-- Rules (plan approved 2026-11-12):
--  * A company keeps its own holiday calendar. A holiday has a date, a name, and may repeat every year (same month and day)
--    or be one-off. It applies to the whole company or to one branch. A one-off holiday may be observed on another day
--    (for example a Sunday holiday taken on the Monday); the original date is then a normal day.
--  * Public-holiday presets per country are shared reference data. A company imports a year's presets with one click;
--    an import only adds days the company does not have yet, it never changes or removes the company's own days.
--  * A holiday that has already passed is history: it cannot be edited or deleted (attendance and leave were based on it).
--  * app.work_day now answers "holiday" for a day the employee would otherwise work. A holiday on an off day changes nothing.
--  * Presets are filled by the yearly fetch (migration 33) or by staff by hand.
-- Run migration 31 first.

-- ---------- permission keys ----------
insert into public.permissions (key, description) values
  ('attendance.holiday.read', 'See the company holiday calendar'),
  ('attendance.holiday.manage', 'Add, change and import company holidays')
on conflict (key) do nothing;

insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, p.key, 'company'
from public.roles ro cross join public.permissions p
where ro.is_system and ro.name in ('Owner', 'Admin') and p.key in ('attendance.holiday.read', 'attendance.holiday.manage')
on conflict do nothing;
-- Everyone else may see the calendar (it is company information, and it explains why a day is off).
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, 'attendance.holiday.read', 'company'
from public.roles ro where ro.is_system and ro.name in ('Manager', 'Sales rep', 'Warehouse', 'Accountant', 'Staff')
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

  insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select p_company_id, ro.id, 'attendance.holiday.read', 'company'
  from public.roles ro
  where ro.company_id = p_company_id and ro.name in ('Manager', 'Sales rep', 'Warehouse', 'Accountant', 'Staff');
  return owner_id;
end $$;

-- ---------- tables ----------
-- Public-holiday presets: reference data shared by every company, not tenant data. Written only by the yearly fetch
-- (service role) or by platform staff; companies can only read them.
create table public.holiday_presets (
  id uuid primary key default gen_random_uuid(),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  holiday_date date not null,
  name text not null check (length(btrim(name)) > 0),
  name_local text,
  source text not null check (source in ('nager', 'manual')),
  -- Lunar-calendar dates are often announced late. A provisional date may still change.
  provisional boolean not null default false,
  fetched_at timestamptz not null default now(),
  unique (country_code, holiday_date, name)
);
create index holiday_presets_country_year_idx on public.holiday_presets (country_code, holiday_date);

create table public.company_holidays (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  branch_id uuid,
  name text not null check (length(btrim(name)) > 0 and length(name) <= 120),
  name_local text check (name_local is null or length(name_local) <= 120),
  holiday_date date not null,
  -- Repeats on the same month and day every year from holiday_date's year on.
  repeats_yearly boolean not null default false,
  -- The day actually taken off when it differs from holiday_date. One-off holidays only.
  observed_date date,
  provisional boolean not null default false,
  source text not null default 'manual' check (source in ('manual', 'preset')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, branch_id) references public.branches (company_id, id) on delete cascade,
  foreign key (company_id, created_by) references public.memberships (company_id, id) on delete set null (created_by),
  check (observed_date is null or (not repeats_yearly and observed_date <> holiday_date))
);
create unique index company_holidays_key on public.company_holidays
  (company_id, holiday_date, lower(name), coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index company_holidays_date_idx on public.company_holidays (company_id, holiday_date);
create index company_holidays_observed_idx on public.company_holidays (company_id, observed_date) where observed_date is not null;

-- What a company has done with each year's presets: imported them, or dismissed the notice.
create table public.company_holiday_imports (
  company_id uuid not null references public.companies (id) on delete cascade,
  year integer not null check (year between 2000 and 2100),
  status text not null check (status in ('imported', 'dismissed')),
  added_count integer not null default 0,
  decided_by uuid,
  decided_at timestamptz not null default now(),
  primary key (company_id, year),
  foreign key (company_id, decided_by) references public.memberships (company_id, id) on delete set null (decided_by)
);

create trigger touch_company_holidays before update on public.company_holidays for each row execute function app.touch_updated_at();
create trigger immutable_company_company_holidays before update on public.company_holidays for each row execute function app.forbid_company_change();
create trigger audit_company_holidays after insert or update or delete on public.company_holidays for each row execute function app.audit_row();

-- ---------- RLS ----------
alter table public.holiday_presets enable row level security;
alter table public.holiday_presets force row level security;
alter table public.company_holidays enable row level security;
alter table public.company_holidays force row level security;
alter table public.company_holiday_imports enable row level security;
alter table public.company_holiday_imports force row level security;

-- Presets are the same for everybody; any signed-in active member with the read permission may see them.
create policy holiday_presets_select on public.holiday_presets for select to authenticated
  using ((select app.is_active_member()) and (select app.permission_scope('attendance.holiday.read')) is not null);
create policy company_holidays_select on public.company_holidays for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and (select app.permission_scope('attendance.holiday.read')) is not null);
create policy company_holiday_imports_select on public.company_holiday_imports for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and (select app.permission_scope('attendance.holiday.manage')) = 'company');

grant select on public.holiday_presets, public.company_holidays, public.company_holiday_imports to authenticated;

-- ---------- internals ----------
create function app.require_holiday_manage() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select app.is_active_member()) or (select app.permission_scope('attendance.holiday.manage')) is distinct from 'company' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end $$;
revoke execute on function app.require_holiday_manage() from public, anon, authenticated;

-- The first date a holiday row still takes effect on (its observed day when there is one). A holiday that repeats yearly
-- is never history, because next year's copy is still ahead.
create function app.holiday_is_history(h public.company_holidays) returns boolean
language sql stable set search_path = '' as $$
  select not h.repeats_yearly and coalesce(h.observed_date, h.holiday_date) < app.local_today()
$$;
revoke execute on function app.holiday_is_history(public.company_holidays) from public, anon, authenticated;

-- ---------- the work-day resolver, now with holidays ----------
-- day_kind: work, half, off, holiday, none or not_employed. A holiday replaces a work or half day only.
drop function app.work_day(uuid, date);
create function app.work_day(p_employee_id uuid, p_date date)
returns table (day_kind text, schedule_id uuid, version_id uuid, source public.assignment_scope,
               start_time time, end_time time, break_min integer, hours numeric, holiday_name text, holiday_name_local text)
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.employees%rowtype;
  sid uuid;
  src public.assignment_scope;
  vid uuid;
  d public.work_schedule_days%rowtype;
  mins numeric;
  hol public.company_holidays%rowtype;
begin
  select * into e from public.employees where id = p_employee_id;
  if not found then return; end if;
  if (e.employment_date is not null and p_date < e.employment_date) or (e.end_date is not null and p_date > e.end_date) then
    return query select 'not_employed'::text, null::uuid, null::uuid, null::public.assignment_scope, null::time, null::time, null::integer, 0::numeric, null::text, null::text;
    return;
  end if;
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
    return query select 'none'::text, null::uuid, null::uuid, null::public.assignment_scope, null::time, null::time, null::integer, 0::numeric, null::text, null::text;
    return;
  end if;
  select v.id into vid from public.work_schedule_versions v
  where v.company_id = e.company_id and v.schedule_id = sid and v.valid_from <= p_date
  order by v.valid_from desc limit 1;
  select * into d from public.work_schedule_days sd where sd.version_id = vid and sd.weekday = extract(isodow from p_date)::int;
  if vid is null or not found then
    return query select 'none'::text, sid, vid, src, null::time, null::time, null::integer, 0::numeric, null::text, null::text;
    return;
  end if;
  if d.day_kind = 'off' then
    return query select 'off'::text, sid, vid, src, null::time, null::time, null::integer, 0::numeric, null::text, null::text;
    return;
  end if;
  -- A company-wide holiday, or one for this employee's branch, on a day the employee would work. Branch-specific first,
  -- then the earliest created, so the answer never depends on row order.
  select h.* into hol from public.company_holidays h
  where h.company_id = e.company_id
    and (h.branch_id is null or h.branch_id = e.branch_id)
    and (case
           when h.repeats_yearly then
             extract(month from h.holiday_date) = extract(month from p_date) and extract(day from h.holiday_date) = extract(day from p_date)
             and extract(year from h.holiday_date) <= extract(year from p_date)
           else coalesce(h.observed_date, h.holiday_date) = p_date
         end)
  order by (h.branch_id is null), h.created_at, h.id
  limit 1;
  if found then
    return query select 'holiday'::text, sid, vid, src, d.start_time, d.end_time, d.break_min, 0::numeric, hol.name, hol.name_local;
    return;
  end if;
  mins := extract(epoch from (d.end_time - d.start_time)) / 60;
  if mins <= 0 then mins := mins + 1440; end if;
  return query select case d.day_kind when 'half' then 'half' else 'work' end, sid, vid, src,
    d.start_time, d.end_time, d.break_min, round(greatest(mins - d.break_min, 0) / 60, 2), null::text, null::text;
end $$;
revoke execute on function app.work_day(uuid, date) from public, anon, authenticated;

-- The employee page reads the resolver through this call; it gains the holiday name.
drop function public.employee_work_days(uuid, date, integer);
create function public.employee_work_days(p_employee_id uuid, p_from date, p_days integer default 14)
returns table (day date, day_kind text, schedule_id uuid, source public.assignment_scope,
               start_time time, end_time time, break_min integer, hours numeric, holiday_name text, holiday_name_local text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select app.can_read_employee_schedule(p_employee_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_from is null or p_days is null or p_days < 1 or p_days > 62 then
    raise exception 'range not allowed' using errcode = 'P0001';
  end if;
  return query
    select d::date, w.day_kind, w.schedule_id, w.source, w.start_time, w.end_time, w.break_min, w.hours, w.holiday_name, w.holiday_name_local
    from generate_series(p_from::timestamp, (p_from + (p_days - 1))::timestamp, interval '1 day') d,
         lateral app.work_day(p_employee_id, d::date) w
    order by 1;
end $$;
revoke execute on function public.employee_work_days(uuid, date, integer) from public, anon;
grant execute on function public.employee_work_days(uuid, date, integer) to authenticated;

-- ---------- RPCs ----------
-- Add (p_id null) or change a holiday.
create function public.save_company_holiday(
  p_id uuid, p_name text, p_name_local text, p_date date, p_repeats_yearly boolean, p_observed_date date, p_branch_id uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  cur public.company_holidays%rowtype;
  hid uuid := p_id;
begin
  perform app.require_holiday_manage();
  if p_name is null or length(btrim(p_name)) = 0 or length(p_name) > 120 then
    raise exception 'name is required' using errcode = 'P0001';
  end if;
  if p_date is null or p_date < date '2000-01-01' or p_date > date '2100-12-31' then
    raise exception 'date is required' using errcode = 'P0001';
  end if;
  if p_observed_date is not null and (p_repeats_yearly or p_observed_date = p_date) then
    raise exception 'an observed day needs a one-off holiday on a different date' using errcode = 'P0001';
  end if;
  if p_branch_id is not null and not exists (select 1 from public.branches where id = p_branch_id and company_id = cid) then
    raise exception 'branch not found' using errcode = 'P0002';
  end if;
  if hid is null then
    if (select count(*) from public.company_holidays where company_id = cid) >= 2000 then
      raise exception 'holiday limit reached' using errcode = 'P0001';
    end if;
    -- A holiday cannot be created in the past: earlier days already happened.
    if not p_repeats_yearly and coalesce(p_observed_date, p_date) < app.local_today() then
      raise exception 'a holiday cannot be added in the past' using errcode = 'P0001';
    end if;
    insert into public.company_holidays (company_id, branch_id, name, name_local, holiday_date, repeats_yearly, observed_date, created_by)
      values (cid, p_branch_id, btrim(p_name), nullif(btrim(coalesce(p_name_local, '')), ''), p_date, p_repeats_yearly, p_observed_date, app.membership_id())
      returning id into hid;
  else
    select * into cur from public.company_holidays where id = hid and company_id = cid;
    if not found then
      raise exception 'holiday not found' using errcode = 'P0002';
    end if;
    if app.holiday_is_history(cur) then
      raise exception 'a holiday that has passed cannot be changed' using errcode = 'P0001';
    end if;
    if not p_repeats_yearly and coalesce(p_observed_date, p_date) < app.local_today() then
      raise exception 'a holiday cannot be moved into the past' using errcode = 'P0001';
    end if;
    update public.company_holidays set
      name = btrim(p_name), name_local = nullif(btrim(coalesce(p_name_local, '')), ''), holiday_date = p_date,
      repeats_yearly = p_repeats_yearly, observed_date = p_observed_date, branch_id = p_branch_id,
      provisional = false
    where id = hid and company_id = cid;
  end if;
  return hid;
end $$;

create function public.delete_company_holiday(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  cur public.company_holidays%rowtype;
begin
  perform app.require_holiday_manage();
  select * into cur from public.company_holidays where id = p_id and company_id = cid;
  if not found then
    raise exception 'holiday not found' using errcode = 'P0002';
  end if;
  if app.holiday_is_history(cur) then
    raise exception 'a holiday that has passed cannot be deleted' using errcode = 'P0001';
  end if;
  delete from public.company_holidays where id = p_id and company_id = cid;
end $$;

-- Copy one year's presets for the company's country into its calendar. Only adds days the company does not already have
-- (same date and name, or the same date for the same branch scope); never changes or removes anything. Days already in
-- the past are skipped. Returns how many days were added.
create function public.import_holiday_presets(p_year integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  cc text;
  n integer;
begin
  perform app.require_holiday_manage();
  if p_year is null or p_year < 2000 or p_year > 2100 then
    raise exception 'year not allowed' using errcode = 'P0001';
  end if;
  select c.country_code into cc from public.companies c where c.id = cid;
  insert into public.company_holidays (company_id, name, name_local, holiday_date, provisional, source, created_by)
  select cid, p.name, p.name_local, p.holiday_date, p.provisional, 'preset', app.membership_id()
  from public.holiday_presets p
  where p.country_code = cc and extract(year from p.holiday_date) = p_year
    and p.holiday_date >= app.local_today()
    and not exists (
      select 1 from public.company_holidays h
      where h.company_id = cid and h.branch_id is null
        and (h.holiday_date = p.holiday_date or (h.repeats_yearly and extract(month from h.holiday_date) = extract(month from p.holiday_date)
             and extract(day from h.holiday_date) = extract(day from p.holiday_date) and extract(year from h.holiday_date) <= p_year)))
  on conflict do nothing;
  get diagnostics n = row_count;
  insert into public.company_holiday_imports (company_id, year, status, added_count, decided_by)
    values (cid, p_year, 'imported', n, app.membership_id())
  on conflict (company_id, year) do update set status = 'imported', added_count = public.company_holiday_imports.added_count + excluded.added_count,
    decided_by = excluded.decided_by, decided_at = now();
  return n;
end $$;

create function public.dismiss_holiday_notice(p_year integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_holiday_manage();
  if p_year is null or p_year < 2000 or p_year > 2100 then
    raise exception 'year not allowed' using errcode = 'P0001';
  end if;
  insert into public.company_holiday_imports (company_id, year, status, decided_by)
    values (app.company_id(), p_year, 'dismissed', app.membership_id())
  on conflict (company_id, year) do nothing;
end $$;

-- The notice for the owner dashboard card and the Holidays banner: next year's presets exist for the company's country
-- and nobody has imported or dismissed them yet. Empty when there is nothing to say or the caller may not manage holidays.
create function public.holiday_notice() returns table (year integer, holiday_count integer, provisional boolean)
language sql stable security definer set search_path = '' as $$
  select y.year, count(*)::integer, bool_or(p.provisional)
  from (select (extract(year from app.local_today())::integer + 1) as year) y
  join public.companies c on c.id = app.company_id()
  join public.holiday_presets p on p.country_code = c.country_code and extract(year from p.holiday_date) = y.year
  where (select app.is_active_member()) and (select app.permission_scope('attendance.holiday.manage')) = 'company'
    and not exists (select 1 from public.company_holiday_imports i where i.company_id = c.id and i.year = y.year)
  group by y.year
$$;

revoke execute on function public.save_company_holiday(uuid, text, text, date, boolean, date, uuid) from public, anon;
revoke execute on function public.delete_company_holiday(uuid) from public, anon;
revoke execute on function public.import_holiday_presets(integer) from public, anon;
revoke execute on function public.dismiss_holiday_notice(integer) from public, anon;
revoke execute on function public.holiday_notice() from public, anon;
grant execute on function public.save_company_holiday(uuid, text, text, date, boolean, date, uuid) to authenticated;
grant execute on function public.delete_company_holiday(uuid) to authenticated;
grant execute on function public.import_holiday_presets(integer) to authenticated;
grant execute on function public.dismiss_holiday_notice(integer) to authenticated;
grant execute on function public.holiday_notice() to authenticated;

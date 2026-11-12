-- Migration 36: attendance, slice A1 (clock in and out, online).
-- Rules (plan approved 2026-11-12, all recommendations):
--  * An employee clocks in and out from the staff app with a live selfie and GPS. Every clock is one append-only
--    event; nobody can edit or delete an event through the app. Corrections arrive in a later slice as adjustments.
--  * All writes go through public.attendance_clock(). It checks the plan includes Attendance, that the caller is an
--    active employee, that the selfie really exists in the private bucket, and it sets the flags a manager reviews.
--  * Outside the branch area is only flagged by default (geofence_mode 'flag'); a company can switch to 'block' or 'off'.
--  * Selfies live in the private bucket attendance-selfies at <company id>/<employee id>/<yyyy-mm-dd>/<file>.
--    In this slice only the employee can open their own selfies. Managers will see them through an audited call in
--    slice A4, so nobody can open a selfie without a log entry.
-- Run migration 35 first.

-- ---------- permission keys ----------
insert into public.permissions (key, description) values
  ('attendance.clock.self', 'Clock in and out for yourself'),
  ('attendance.record.read', 'See attendance records'),
  ('attendance.selfie.view', 'Open clock-in selfies'),
  ('attendance.settings.manage', 'Set the attendance rules and branch locations')
on conflict (key) do nothing;

insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, p.key, 'company'
from public.roles ro cross join public.permissions p
where ro.is_system and ro.name in ('Owner', 'Admin')
  and p.key in ('attendance.clock.self', 'attendance.record.read', 'attendance.selfie.view', 'attendance.settings.manage')
on conflict do nothing;
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, k.key, k.scope::public.data_scope
from public.roles ro cross join (values ('attendance.record.read', 'team'), ('attendance.selfie.view', 'team')) as k(key, scope)
where ro.is_system and ro.name = 'Manager'
on conflict do nothing;
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, 'attendance.clock.self', 'own'
from public.roles ro where ro.is_system and ro.name in ('Manager', 'Sales rep', 'Warehouse', 'Accountant', 'Staff')
on conflict do nothing;
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, 'attendance.record.read', 'own'
from public.roles ro where ro.is_system and ro.name in ('Sales rep', 'Warehouse', 'Accountant', 'Staff')
on conflict do nothing;

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

  insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select p_company_id, ro.id, k.key, k.scope::public.data_scope
  from public.roles ro cross join (values ('attendance.record.read', 'team'), ('attendance.selfie.view', 'team')) as k(key, scope)
  where ro.company_id = p_company_id and ro.name = 'Manager';

  insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select p_company_id, ro.id, 'attendance.clock.self', 'own'
  from public.roles ro where ro.company_id = p_company_id and ro.name in ('Manager', 'Sales rep', 'Warehouse', 'Accountant', 'Staff');

  insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select p_company_id, ro.id, 'attendance.record.read', 'own'
  from public.roles ro where ro.company_id = p_company_id and ro.name in ('Sales rep', 'Warehouse', 'Accountant', 'Staff');
  return owner_id;
end $$;

-- ---------- plan: does it include Attendance, and how long are selfies kept? ----------
alter table public.plans add column selfie_retention_days integer not null default 60 check (selfie_retention_days between 7 and 3650);

-- Is this module part of the plan of the account that owns the company? No subscription row (admin and service
-- tooling, the first days of a new company) means yes, like the other plan checks.
create function app.module_enabled(p_company uuid, p_module text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p_module = any (pl.modules) from public.plans pl where pl.id = (app.company_plan(p_company)).id), true)
$$;
revoke all on function app.module_enabled(uuid, text) from public, anon, authenticated;

-- ---------- branch location ----------
alter table public.branches
  add column latitude double precision check (latitude is null or latitude between -90 and 90),
  add column longitude double precision check (longitude is null or longitude between -180 and 180),
  add column geofence_radius_m integer check (geofence_radius_m is null or geofence_radius_m between 20 and 5000),
  add constraint branches_location_pair check ((latitude is null) = (longitude is null));
grant update (latitude, longitude, geofence_radius_m) on public.branches to authenticated;

-- ---------- company attendance rules ----------
create type public.geofence_mode as enum ('off', 'flag', 'block');

create table public.attendance_settings (
  company_id uuid primary key references public.companies (id) on delete cascade,
  geofence_mode public.geofence_mode not null default 'flag',
  default_radius_m integer not null default 150 check (default_radius_m between 20 and 5000),
  late_grace_min integer not null default 5 check (late_grace_min between 0 and 120),
  early_grace_min integer not null default 5 check (early_grace_min between 0 and 120),
  day_start_hour integer not null default 4 check (day_start_hour between 0 and 12),
  selfie_required boolean not null default true,
  allow_without_selfie boolean not null default false,
  selfie_retention_days integer not null default 60 check (selfie_retention_days between 7 and 3650),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger touch_attendance_settings before update on public.attendance_settings for each row execute function app.touch_updated_at();
create trigger audit_attendance_settings after insert or update or delete on public.attendance_settings for each row execute function app.audit_row();

-- ---------- events: one row per clock in or out, append-only ----------
create type public.attendance_kind as enum ('in', 'out');

create table public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  branch_id uuid,
  kind public.attendance_kind not null,
  client_event_id uuid not null,
  device_time timestamptz not null,
  server_time timestamptz not null default clock_timestamp(),
  occurred_at timestamptz not null,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  accuracy_m integer check (accuracy_m is null or accuracy_m >= 0),
  distance_m integer,
  inside_geofence boolean,
  selfie_path text check (selfie_path is null or length(selfie_path) <= 300),
  device_id text check (device_id is null or length(device_id) <= 80),
  flags text[] not null default '{}',
  unique (company_id, id),
  unique (company_id, client_event_id),
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade,
  foreign key (company_id, branch_id) references public.branches (company_id, id) on delete set null (branch_id)
);
create index attendance_events_employee_idx on public.attendance_events (company_id, employee_id, occurred_at desc);
create index attendance_events_company_idx on public.attendance_events (company_id, occurred_at desc);

alter table public.attendance_settings enable row level security;
alter table public.attendance_events enable row level security;
alter table public.attendance_settings force row level security;
alter table public.attendance_events force row level security;

-- May the caller read this employee's attendance? Own record, or team, branch or company by the permission's scope.
create function app.can_read_attendance(p_employee_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select app.is_active_member()) and exists (
    select 1 from public.employees e
    where e.id = p_employee_id and e.company_id = app.company_id()
      and (select app.permission_scope('attendance.record.read')) is not null
      and (
        e.id = (select app.my_employee_id())
        or (select app.permission_scope('attendance.record.read')) = 'company'
        or ((select app.permission_scope('attendance.record.read')) = 'team' and e.id in (select app.team_employee_ids()))
        or ((select app.permission_scope('attendance.record.read')) = 'branch' and e.branch_id = any (app.my_branch_ids()))
      ))
$$;
revoke all on function app.can_read_attendance(uuid) from public, anon;
grant execute on function app.can_read_attendance(uuid) to authenticated;

create policy attendance_settings_select on public.attendance_settings for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and (select app.permission_scope('attendance.settings.manage')) is not null);
create policy attendance_events_select on public.attendance_events for select to authenticated
  using (company_id = (select app.company_id()) and (select app.can_read_attendance(employee_id)));

-- Read only. Writes happen in the functions below.
grant select on public.attendance_settings, public.attendance_events to authenticated;

-- ---------- selfie bucket ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('attendance-selfies', 'attendance-selfies', false, 1048576, array['image/jpeg', 'image/webp'])
  on conflict (id) do update set public = false, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg', 'image/webp'];

-- Folder 1 is the company id, folder 2 the employee id, folder 3 the date.
create function app.own_selfie_folder(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active_member()
    and app.permission_scope('attendance.clock.self') is not null
    and (string_to_array(p_name, '/'))[1] = app.company_id()::text
    and (string_to_array(p_name, '/'))[2] = app.my_employee_id()::text
    and array_length(string_to_array(p_name, '/'), 1) = 4
$$;
revoke all on function app.own_selfie_folder(text) from public, anon;
grant execute on function app.own_selfie_folder(text) to authenticated;

create policy attendance_selfies_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attendance-selfies' and app.own_selfie_folder(name));
create policy attendance_selfies_select on storage.objects for select to authenticated
  using (bucket_id = 'attendance-selfies' and app.own_selfie_folder(name));

-- ---------- distance ----------
create function app.distance_m(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision language sql immutable set search_path = '' as $$
  select 2 * 6371000 * asin(sqrt(least(1, power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2))))
$$;
revoke all on function app.distance_m(double precision, double precision, double precision, double precision) from public, anon, authenticated;

-- ---------- settings calls ----------
create function public.get_attendance_settings() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.attendance_settings%rowtype; cap integer;
begin
  if not (select app.is_active_member()) or (select app.permission_scope('attendance.settings.manage')) is distinct from 'company' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into s from public.attendance_settings where company_id = app.company_id();
  if not found then
    s.geofence_mode := 'flag'; s.default_radius_m := 150; s.late_grace_min := 5; s.early_grace_min := 5;
    s.day_start_hour := 4; s.selfie_required := true; s.allow_without_selfie := false; s.selfie_retention_days := 60;
  end if;
  cap := coalesce((app.company_plan(app.company_id())).selfie_retention_days, 60);
  return jsonb_build_object('geofence_mode', s.geofence_mode, 'default_radius_m', s.default_radius_m,
    'late_grace_min', s.late_grace_min, 'early_grace_min', s.early_grace_min, 'day_start_hour', s.day_start_hour,
    'selfie_required', s.selfie_required, 'allow_without_selfie', s.allow_without_selfie,
    'selfie_retention_days', s.selfie_retention_days, 'plan_retention_days', cap);
end $$;

create function public.save_attendance_settings(
  p_geofence_mode public.geofence_mode, p_default_radius_m integer, p_late_grace_min integer, p_early_grace_min integer,
  p_day_start_hour integer, p_allow_without_selfie boolean, p_selfie_retention_days integer
) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); cap integer;
begin
  if not (select app.is_active_member()) or (select app.permission_scope('attendance.settings.manage')) is distinct from 'company' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not app.module_enabled(cid, 'attendance') then raise exception 'module not in plan: attendance' using errcode = 'P0001'; end if;
  cap := coalesce((app.company_plan(cid)).selfie_retention_days, 60);
  if p_selfie_retention_days > cap then raise exception 'plan limit: selfie retention' using errcode = 'P0001'; end if;
  insert into public.attendance_settings (company_id, geofence_mode, default_radius_m, late_grace_min, early_grace_min,
                                          day_start_hour, allow_without_selfie, selfie_retention_days)
  values (cid, p_geofence_mode, p_default_radius_m, p_late_grace_min, p_early_grace_min, p_day_start_hour,
          coalesce(p_allow_without_selfie, false), p_selfie_retention_days)
  on conflict (company_id) do update set geofence_mode = excluded.geofence_mode, default_radius_m = excluded.default_radius_m,
    late_grace_min = excluded.late_grace_min, early_grace_min = excluded.early_grace_min, day_start_hour = excluded.day_start_hour,
    allow_without_selfie = excluded.allow_without_selfie, selfie_retention_days = excluded.selfie_retention_days;
end $$;

-- ---------- what the staff app needs to draw its screen ----------
create function public.attendance_my_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  eid uuid := app.my_employee_id();
  e public.employees%rowtype;
  b public.branches%rowtype;
  s public.attendance_settings%rowtype;
  last_ev public.attendance_events%rowtype;
begin
  if not (select app.is_active_member()) or (select app.permission_scope('attendance.clock.self')) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if eid is null then return jsonb_build_object('linked', false); end if;
  select * into e from public.employees where id = eid;
  select * into b from public.branches where id = e.branch_id and company_id = cid;
  select * into s from public.attendance_settings where company_id = cid;
  if not found then s.geofence_mode := 'flag'; s.default_radius_m := 150; s.selfie_required := true; s.allow_without_selfie := false; end if;
  select * into last_ev from public.attendance_events where company_id = cid and employee_id = eid order by occurred_at desc, server_time desc limit 1;
  return jsonb_build_object(
    'linked', true, 'module', app.module_enabled(cid, 'attendance'),
    'employee_id', eid, 'employee_name', e.name, 'employee_name_local', e.name_local, 'active', e.status = 'active',
    'company_id', cid, 'now', now(),
    'branch', case when b.id is null then null else jsonb_build_object('id', b.id, 'name', b.name, 'name_local', b.name_local,
      'latitude', b.latitude, 'longitude', b.longitude, 'radius_m', coalesce(b.geofence_radius_m, s.default_radius_m)) end,
    'geofence_mode', s.geofence_mode, 'selfie_required', s.selfie_required, 'allow_without_selfie', s.allow_without_selfie,
    'last', case when last_ev.id is null then null else jsonb_build_object('kind', last_ev.kind, 'occurred_at', last_ev.occurred_at, 'flags', last_ev.flags) end);
end $$;

-- ---------- the clock ----------
-- Returns the event. Calling again with the same client_event_id returns the same event (safe retry).
create function public.attendance_clock(
  p_kind public.attendance_kind, p_client_event_id uuid, p_device_time timestamptz,
  p_latitude double precision, p_longitude double precision, p_accuracy_m integer,
  p_selfie_path text, p_device_id text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  eid uuid := app.my_employee_id();
  e public.employees%rowtype;
  b public.branches%rowtype;
  s public.attendance_settings%rowtype;
  prev public.attendance_events%rowtype;
  ev public.attendance_events%rowtype;
  flags text[] := '{}';
  dist double precision;
  inside boolean;
  radius integer;
  tz text;
  need_selfie boolean;
begin
  if not (select app.is_active_member()) or (select app.permission_scope('attendance.clock.self')) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if eid is null then raise exception 'not an employee' using errcode = 'P0001'; end if;
  if not app.module_enabled(cid, 'attendance') then raise exception 'module not in plan: attendance' using errcode = 'P0001'; end if;
  if p_client_event_id is null or p_device_time is null then raise exception 'incomplete request' using errcode = 'P0001'; end if;

  select * into ev from public.attendance_events where company_id = cid and client_event_id = p_client_event_id;
  if found then
    if ev.employee_id <> eid then raise exception 'not allowed' using errcode = '42501'; end if;
    return jsonb_build_object('id', ev.id, 'kind', ev.kind, 'occurred_at', ev.occurred_at, 'flags', ev.flags, 'repeat', true);
  end if;

  select * into e from public.employees where id = eid;
  tz := coalesce((select bb.timezone from public.branches bb where bb.id = e.branch_id and bb.company_id = cid),
                 (select cs.timezone from public.company_settings cs where cs.company_id = cid), 'Asia/Phnom_Penh');
  if e.status <> 'active' or (e.employment_date is not null and (now() at time zone tz)::date < e.employment_date)
     or (e.end_date is not null and (now() at time zone tz)::date > e.end_date) then
    raise exception 'employee not active' using errcode = 'P0001';
  end if;

  select * into s from public.attendance_settings where company_id = cid;
  if not found then
    s.geofence_mode := 'flag'; s.default_radius_m := 150; s.selfie_required := true; s.allow_without_selfie := false;
  end if;

  -- In and out must alternate. The very first clock must be an in.
  select * into prev from public.attendance_events where company_id = cid and employee_id = eid order by occurred_at desc, server_time desc limit 1;
  if p_kind = 'in' and found and prev.kind = 'in' then raise exception 'already clocked in' using errcode = 'P0001'; end if;
  if p_kind = 'out' and (not found or prev.kind = 'out') then raise exception 'not clocked in' using errcode = 'P0001'; end if;

  -- Selfie: it must be in the caller's own folder and really uploaded.
  need_selfie := s.selfie_required;
  if p_selfie_path is not null then
    if not app.own_selfie_folder(p_selfie_path)
       or not exists (select 1 from storage.objects o where o.bucket_id = 'attendance-selfies' and o.name = p_selfie_path) then
      raise exception 'selfie not found' using errcode = 'P0001';
    end if;
  elsif need_selfie then
    if not s.allow_without_selfie then raise exception 'selfie required' using errcode = 'P0001'; end if;
    flags := array_append(flags, 'missing_selfie');
  end if;

  -- Place.
  select * into b from public.branches where id = e.branch_id and company_id = cid;
  if p_latitude is null or p_longitude is null then
    flags := array_append(flags, 'no_gps');
  else
    if p_accuracy_m is not null and p_accuracy_m > 100 then flags := array_append(flags, 'low_accuracy'); end if;
    if b.id is not null and b.latitude is not null and s.geofence_mode <> 'off' then
      dist := app.distance_m(p_latitude, p_longitude, b.latitude, b.longitude);
      radius := coalesce(b.geofence_radius_m, s.default_radius_m);
      inside := dist <= radius;
      if not inside then
        if s.geofence_mode = 'block' then raise exception 'outside area' using errcode = 'P0001'; end if;
        flags := array_append(flags, 'outside_geofence');
      end if;
    end if;
  end if;

  if abs(extract(epoch from (p_device_time - clock_timestamp()))) > 300 then flags := array_append(flags, 'clock_drift'); end if;
  if p_device_id is not null and exists (
    select 1 from public.attendance_events x
    where x.company_id = cid and x.device_id = p_device_id and x.employee_id <> eid and x.server_time > now() - interval '24 hours') then
    flags := array_append(flags, 'shared_device');
  end if;

  insert into public.attendance_events (company_id, employee_id, branch_id, kind, client_event_id, device_time, occurred_at,
    latitude, longitude, accuracy_m, distance_m, inside_geofence, selfie_path, device_id, flags)
  values (cid, eid, b.id, p_kind, p_client_event_id, p_device_time, clock_timestamp(),
    p_latitude, p_longitude, p_accuracy_m, round(dist)::int, inside, p_selfie_path, left(p_device_id, 80), flags)
  returning * into ev;
  return jsonb_build_object('id', ev.id, 'kind', ev.kind, 'occurred_at', ev.occurred_at, 'flags', ev.flags, 'repeat', false);
end $$;

revoke execute on function public.get_attendance_settings() from public, anon;
revoke execute on function public.save_attendance_settings(public.geofence_mode, integer, integer, integer, integer, boolean, integer) from public, anon;
revoke execute on function public.attendance_my_state() from public, anon;
revoke execute on function public.attendance_clock(public.attendance_kind, uuid, timestamptz, double precision, double precision, integer, text, text) from public, anon;
grant execute on function public.get_attendance_settings() to authenticated;
grant execute on function public.save_attendance_settings(public.geofence_mode, integer, integer, integer, integer, boolean, integer) to authenticated;
grant execute on function public.attendance_my_state() to authenticated;
grant execute on function public.attendance_clock(public.attendance_kind, uuid, timestamptz, double precision, double precision, integer, text, text) to authenticated;

-- Permission names in Khmer (shown in the role editor; machine drafts).
update public.permissions p set description_local = v.d from (values
  ('attendance.clock.self', 'ចូល និងចេញពីការងារសម្រាប់ខ្លួនឯង'),
  ('attendance.record.read', 'មើលកំណត់ត្រាវត្តមាន'),
  ('attendance.selfie.view', 'បើករូបថតសែលហ្វីពេលចូលធ្វើការ'),
  ('attendance.settings.manage', 'កំណត់ច្បាប់វត្តមាន និងទីតាំងសាខា')
) as v(k, d) where p.key = v.k;

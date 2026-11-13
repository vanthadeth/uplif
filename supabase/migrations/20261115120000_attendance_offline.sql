-- Offline clock-in (attendance slice A2). The phone keeps a tap made without signal and sends it later.
-- The server counts it at the time the phone recorded (never later than now), flags it 'offline', and refuses a time
-- over 7 days old or one that would land before a later event. Calling again with the same client_event_id is still safe.
drop function public.attendance_clock(public.attendance_kind, uuid, timestamptz, double precision, double precision, integer, text, text);
create function public.attendance_clock(
  p_kind public.attendance_kind, p_client_event_id uuid, p_device_time timestamptz,
  p_latitude double precision, p_longitude double precision, p_accuracy_m integer,
  p_selfie_path text, p_device_id text, p_offline boolean default false
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
  occ timestamptz := clock_timestamp();
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

  -- A clock saved on the phone while it had no signal is sent later. It counts at the time the phone recorded, marked 'offline'.
  -- A time in the future counts as now and is marked as drift. A time more than 7 days old is refused.
  if coalesce(p_offline, false) then
    if p_device_time < clock_timestamp() - interval '7 days' then raise exception 'too old' using errcode = 'P0001'; end if;
    if p_device_time > clock_timestamp() + interval '5 minutes' then flags := array_append(flags, 'clock_drift');
    else occ := least(p_device_time, clock_timestamp()); end if;
    flags := array_append(flags, 'offline');
    if exists (select 1 from public.attendance_events x where x.company_id = cid and x.employee_id = eid and x.occurred_at > occ) then
      raise exception 'out of order' using errcode = 'P0001';
    end if;
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
  select * into prev from public.attendance_events where company_id = cid and employee_id = eid and occurred_at <= occ order by occurred_at desc, server_time desc limit 1;
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

  if not coalesce(p_offline, false) and abs(extract(epoch from (p_device_time - clock_timestamp()))) > 300 then flags := array_append(flags, 'clock_drift'); end if;
  if p_device_id is not null and exists (
    select 1 from public.attendance_events x
    where x.company_id = cid and x.device_id = p_device_id and x.employee_id <> eid and x.server_time > now() - interval '24 hours') then
    flags := array_append(flags, 'shared_device');
  end if;

  insert into public.attendance_events (company_id, employee_id, branch_id, kind, client_event_id, device_time, occurred_at,
    latitude, longitude, accuracy_m, distance_m, inside_geofence, selfie_path, device_id, flags)
  values (cid, eid, b.id, p_kind, p_client_event_id, p_device_time, occ,
    p_latitude, p_longitude, p_accuracy_m, round(dist)::int, inside, p_selfie_path, left(p_device_id, 80), flags)
  returning * into ev;
  return jsonb_build_object('id', ev.id, 'kind', ev.kind, 'occurred_at', ev.occurred_at, 'flags', ev.flags, 'repeat', false);
end $$;
revoke execute on function public.attendance_clock(public.attendance_kind, uuid, timestamptz, double precision, double precision, integer, text, text, boolean) from public, anon;
grant execute on function public.attendance_clock(public.attendance_kind, uuid, timestamptz, double precision, double precision, integer, text, text, boolean) to authenticated;

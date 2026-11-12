-- Attendance slice A3: the result of each day (on time, late, early leave, absent and so on).
-- Rules (plan approved 2026-11-12):
--  * One result per employee per day, worked out from the schedule that applies that day (app.work_day) and the clock
--    events of that day. Nothing is stored: the result is always computed, so a corrected schedule or a corrected event
--    changes it everywhere at once.
--  * The attendance day runs from day_start_hour (default 04:00) to the same hour the next day, in the branch's time zone
--    (else the company's, else Asia/Phnom_Penh), so a late shift finishing after midnight stays on its own day.
--  * Late: first clock-in after the scheduled start plus the schedule's late grace. half_day is set when the lateness
--    reaches half_day_late_min. Early leave: last clock-out before the scheduled end minus the early grace.
--  * A past day with a clock-in and no clock-out is 'incomplete'. A past work day with no clock-in is 'absent' until
--    leave requests exist (a later slice will turn approved leave into 'leave').
--  * Overtime is shown, not paid: minutes after the scheduled end, once they pass overtime_after_min.
--  * Status values: not_employed, none (no schedule), off, holiday, future, pending (today, nobody clocked in yet),
--    in_progress, absent, incomplete, late, early_leave, on_time, extra (worked on a day off or holiday).
-- Run migration 39 first.

create function app.attendance_day(p_employee_id uuid, p_date date)
returns table (status text, first_in timestamptz, last_out timestamptz, late_min integer, early_min integer,
               worked_min integer, overtime_min integer, half_day boolean, flagged boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.employees%rowtype;
  w record;
  v public.work_schedule_versions%rowtype;
  s public.attendance_settings%rowtype;
  tz text;
  day_start_h integer;
  win_start timestamptz;
  win_end timestamptz;
  sched_start timestamptz;
  sched_end timestamptz;
  ev record;
  open_in timestamptz;
  worked numeric := 0;
  has_events boolean := false;
  fin timestamptz;
  lout timestamptz;
  late integer := 0;
  early integer := 0;
  ot integer := 0;
  flg boolean := false;
  half boolean := false;
  st text;
  nowts timestamptz := now();
begin
  select * into e from public.employees where id = p_employee_id;
  if not found then return; end if;
  select * into w from app.work_day(p_employee_id, p_date);
  tz := coalesce((select b.timezone from public.branches b where b.company_id = e.company_id and b.id = e.branch_id),
                 (select cs.timezone from public.company_settings cs where cs.company_id = e.company_id), 'Asia/Phnom_Penh');
  select * into s from public.attendance_settings where company_id = e.company_id;
  day_start_h := coalesce(s.day_start_hour, 4);
  win_start := (p_date::timestamp + make_interval(hours => day_start_h)) at time zone tz;
  win_end := win_start + interval '1 day';

  if w.day_kind = 'not_employed' then
    return query select 'not_employed', null::timestamptz, null::timestamptz, 0, 0, 0, 0, false, false; return;
  end if;

  -- Walk the day's events once: pair every in with the next out.
  for ev in select a.kind, a.occurred_at, a.flags from public.attendance_events a
            where a.employee_id = p_employee_id and a.company_id = e.company_id and a.occurred_at >= win_start and a.occurred_at < win_end
            order by a.occurred_at, a.server_time loop
    has_events := true;
    if cardinality(ev.flags) > 0 then flg := true; end if;
    if ev.kind = 'in' then
      if fin is null then fin := ev.occurred_at; end if;
      if open_in is null then open_in := ev.occurred_at; end if;
    elsif open_in is not null then
      worked := worked + extract(epoch from (ev.occurred_at - open_in)) / 60;
      open_in := null;
      lout := ev.occurred_at;
    end if;
  end loop;
  -- Still clocked in: count to now only while the day is still running.
  if open_in is not null and nowts < win_end then
    worked := worked + extract(epoch from (nowts - open_in)) / 60;
  end if;

  if w.day_kind in ('off', 'none', 'holiday') then
    return query select case when has_events then 'extra' else w.day_kind end, fin, lout, 0, 0, round(worked)::int, 0, false, flg;
    return;
  end if;

  -- A work or half day.
  if not has_events then
    return query select case when nowts < win_start then 'future' when nowts < win_end then 'pending' else 'absent' end,
      null::timestamptz, null::timestamptz, 0, 0, 0, 0, false, false;
    return;
  end if;

  select * into v from public.work_schedule_versions where id = w.version_id;
  sched_start := (p_date::timestamp + w.start_time) at time zone tz;
  sched_end := (p_date::timestamp + w.start_time + (case when w.end_time > w.start_time then w.end_time - w.start_time
                                                         else w.end_time - w.start_time + interval '24 hours' end)) at time zone tz;
  late := greatest(0, floor(extract(epoch from (fin - sched_start)) / 60)::int);
  half := late >= v.half_day_late_min and v.half_day_late_min > 0;
  if late <= v.grace_late_min then late := 0; half := false; end if;
  if lout is not null and open_in is null then
    early := greatest(0, ceil(extract(epoch from (sched_end - lout)) / 60)::int);
    if early <= v.grace_early_min then early := 0; end if;
    ot := greatest(0, floor(extract(epoch from (lout - sched_end)) / 60)::int);
    if ot < v.overtime_after_min then ot := 0; end if;
  end if;

  st := case
    when open_in is not null and nowts < win_end then 'in_progress'
    when open_in is not null then 'incomplete'
    when late > 0 then 'late'
    when early > 0 then 'early_leave'
    else 'on_time' end;
  return query select st, fin, lout, late, early, round(worked)::int, ot, half, flg;
end $$;
revoke execute on function app.attendance_day(uuid, date) from public, anon, authenticated;

-- One row per day for an employee the caller may read (own record, or by the scope of attendance.record.read).
create function public.employee_attendance_days(p_employee_id uuid, p_from date, p_days integer default 28)
returns table (day date, status text, first_in timestamptz, last_out timestamptz, late_min integer, early_min integer,
               worked_min integer, overtime_min integer, half_day boolean, flagged boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select app.can_read_attendance(p_employee_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_from is null or p_days is null or p_days < 1 or p_days > 62 then
    raise exception 'range not allowed' using errcode = 'P0001';
  end if;
  return query
    select d::date, r.status, r.first_in, r.last_out, r.late_min, r.early_min, r.worked_min, r.overtime_min, r.half_day, r.flagged
    from generate_series(p_from::timestamp, (p_from + (p_days - 1))::timestamp, interval '1 day') d,
         lateral app.attendance_day(p_employee_id, d::date) r
    order by 1;
end $$;
revoke execute on function public.employee_attendance_days(uuid, date, integer) from public, anon;
grant execute on function public.employee_attendance_days(uuid, date, integer) to authenticated;

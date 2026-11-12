-- Automatic achievements for the person's own record (UPLIF Me, Record > Achievements).
-- Rules (design answers, 2026-11-12): attendance achievements are automatic; others will be awarded by hand in a later slice.
--  * Nothing is stored. Every answer is worked out from the daily attendance results (app.attendance_day) when asked,
--    so a corrected schedule or event changes the achievements too.
--  * green_month: a finished calendar month (one of the last 12) where every counted work day was on time, with at
--    least 5 counted work days. Counted days are on_time, late, early_leave, absent and incomplete.
--  * progress: the current month so far (n = on-time days, total = counted days up to today; a day still in progress waits).
--  * tenure: one row for each full year since the employment date (n = years, period = the anniversary).
-- Run migration 41 first.

create function public.my_achievements()
returns table (kind text, period date, n integer, total integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  eid uuid := app.my_employee_id();
  emp public.employees%rowtype;
  this_month date;
  first_day date;
  yrs integer;
begin
  if not (select app.is_active_member()) or eid is null or not (select app.can_read_attendance(eid)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into emp from public.employees where id = eid;
  this_month := date_trunc('month', app.local_today())::date;
  first_day := (this_month - interval '12 months')::date;

  return query
  with days as (
    select date_trunc('month', d)::date as m, r.status
    from generate_series(first_day::timestamp, (app.local_today() - 1)::timestamp, interval '1 day') d,
         lateral app.attendance_day(eid, d::date) r
    where r.status in ('on_time', 'late', 'early_leave', 'absent', 'incomplete')
  ),
  per as (
    select m, count(*)::int as counted, count(*) filter (where status = 'on_time')::int as good from days group by m
  )
  select 'green_month'::text, per.m, per.good, per.counted from per
  where per.m < this_month and per.counted >= 5 and per.good = per.counted
  order by per.m desc;

  -- This month so far: yesterday and earlier, plus today once the person has clocked in and out.
  return query
  select 'progress'::text, this_month,
         count(*) filter (where r.status = 'on_time')::int, count(*)::int
  from generate_series(this_month::timestamp, app.local_today()::timestamp, interval '1 day') d,
       lateral app.attendance_day(eid, d::date) r
  where r.status in ('on_time', 'late', 'early_leave', 'absent', 'incomplete');

  if emp.employment_date is not null then
    yrs := extract(year from age(app.local_today(), emp.employment_date))::int;
    return query select 'tenure'::text, (emp.employment_date + make_interval(years => y))::date, y, null::int
                 from generate_series(1, greatest(yrs, 0)) y order by y desc;
  end if;
end $$;
revoke execute on function public.my_achievements() from public, anon;
grant execute on function public.my_achievements() to authenticated;

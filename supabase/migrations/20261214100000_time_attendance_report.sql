-- UPLIF Time, slice T1: the attendance report.
-- One row per employee the caller may read (scope team, branch or company of attendance.record.read), for up to 31 days.
-- `days` holds one status per day from p_from (index 1 = p_from), with approved leave turning an absent day into 'leave'
-- (same rule as time_today). The counters are totals over the same range. Nothing is stored. Staff who can only read
-- their own record are refused. Needs the Attendance module in the plan.
create function public.time_attendance_report(p_from date, p_days integer default 7, p_branch_id uuid default null)
returns table (employee_id uuid, name text, name_local text, branch_id uuid, position_name text, position_name_local text,
               days text[], work_days integer, on_time integer, late integer, early_leave integer, absent integer,
               leave_days integer, incomplete integer, late_min integer, overtime_min integer, worked_min integer,
               flagged_days integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  sc public.data_scope;
begin
  if not (select app.is_active_member()) then raise exception 'not allowed' using errcode = '42501'; end if;
  if not app.module_enabled(cid, 'attendance') then raise exception 'module not in plan: attendance' using errcode = 'P0001'; end if;
  sc := (select app.permission_scope('attendance.record.read'));
  if sc is null or sc = 'own' then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_from is null or p_days is null or p_days < 1 or p_days > 31 then
    raise exception 'range not allowed' using errcode = 'P0001';
  end if;
  return query
    with emp as (
      select e.id, e.name, e.name_local, e.branch_id, e.position_id
      from public.employees e
      where e.company_id = cid and e.status = 'active'
        and (p_branch_id is null or e.branch_id = p_branch_id)
        and (select app.can_read_attendance(e.id))
      order by e.name
      limit 1000
    ), d as (
      select emp.id as eid, g.n, (p_from + (g.n - 1)) as day, r.*,
             exists (select 1 from public.leave_requests lr
                     where lr.company_id = cid and lr.employee_id = emp.id and lr.status = 'approved'
                       and (p_from + (g.n - 1)) between lr.start_date and lr.end_date) as on_leave
      from emp
      cross join generate_series(1, p_days) as g(n)
      cross join lateral app.attendance_day(emp.id, p_from + (g.n - 1)) r
    ), s as (
      select d.eid, d.n, d.late_min as lm, d.overtime_min as om, d.worked_min as wm, d.flagged as fl,
             case when d.status in ('absent', 'future', 'pending') and d.on_leave then 'leave' else d.status end as st
      from d
    )
    select emp.id, emp.name, emp.name_local, emp.branch_id, p.name, p.name_local,
           array_agg(s.st order by s.n),
           (count(*) filter (where s.st in ('on_time', 'late', 'early_leave', 'incomplete', 'absent', 'in_progress')))::int,
           (count(*) filter (where s.st = 'on_time'))::int,
           (count(*) filter (where s.st = 'late'))::int,
           (count(*) filter (where s.st = 'early_leave'))::int,
           (count(*) filter (where s.st = 'absent'))::int,
           (count(*) filter (where s.st = 'leave'))::int,
           (count(*) filter (where s.st = 'incomplete'))::int,
           coalesce(sum(s.lm), 0)::int, coalesce(sum(s.om), 0)::int, coalesce(sum(s.wm), 0)::int,
           (count(*) filter (where s.fl))::int
    from emp
    join s on s.eid = emp.id
    left join public.positions p on p.company_id = cid and p.id = emp.position_id
    group by emp.id, emp.name, emp.name_local, emp.branch_id, p.name, p.name_local
    order by emp.name;
end $$;
revoke all on function public.time_attendance_report(date, integer, uuid) from public, anon;
grant execute on function public.time_attendance_report(date, integer, uuid) to authenticated;

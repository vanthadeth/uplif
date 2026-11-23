-- UPLIF Time, slice T0: the Today board.
-- One call returns today's result for every employee the caller may read (team, branch or company scope of
-- attendance.record.read), with approved leave turning an absent or pending day into a leave day, the same
-- rule as employee_attendance_days. Nothing is stored. A person who can only read their own record (staff) is
-- refused: Time is for people who look after others. Needs the Attendance module in the plan.
create function public.time_today(p_branch_id uuid default null)
returns table (employee_id uuid, name text, name_local text, branch_id uuid, position_name text, position_name_local text,
               status text, first_in timestamptz, late_min integer, overtime_min integer, flagged boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  sc public.data_scope;
begin
  if not (select app.is_active_member()) then raise exception 'not allowed' using errcode = '42501'; end if;
  if not app.module_enabled(cid, 'attendance') then raise exception 'module not in plan: attendance' using errcode = 'P0001'; end if;
  sc := (select app.permission_scope('attendance.record.read'));
  if sc is null or sc = 'own' then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select e.id, e.name, e.name_local, e.branch_id, p.name, p.name_local,
           case when r.status in ('absent', 'future', 'pending') and exists (
                  select 1 from public.leave_requests lr
                  where lr.employee_id = e.id and lr.status = 'approved' and lr.company_id = cid
                    and app.local_today(e.branch_id) between lr.start_date and lr.end_date)
                then 'leave' else r.status end,
           r.first_in, r.late_min, r.overtime_min, r.flagged
    from public.employees e
    left join public.positions p on p.company_id = e.company_id and p.id = e.position_id
    cross join lateral app.attendance_day(e.id, app.local_today(e.branch_id)) r
    where e.company_id = cid and e.status = 'active'
      and (p_branch_id is null or e.branch_id = p_branch_id)
      and (select app.can_read_attendance(e.id))
    order by e.name
    limit 1000;
end $$;
revoke all on function public.time_today(uuid) from public, anon;
grant execute on function public.time_today(uuid) to authenticated;

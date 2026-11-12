-- Working time: schedules, assignments, the work-day resolver and their isolation. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('f1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ws-owner@test.local'),
  ('f1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ws-admin@test.local'),
  ('f1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'ws-mgr@test.local'),
  ('f1000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'ws-staff@test.local'),
  ('f1000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'ws-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('f1000000-0000-0000-0000-000000000001', 'Owner'), ('f1000000-0000-0000-0000-000000000002', 'Admin'),
  ('f1000000-0000-0000-0000-000000000003', 'Manager'), ('f1000000-0000-0000-0000-000000000004', 'Staff'),
  ('f1000000-0000-0000-0000-000000000005', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Work Co', null, 'KH', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-0000-0000-000000000005', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Work Other Co', null, 'KH', 'KHR', 'Main');
reset role;

create temp table ctx as
  select c.id as cid, m.id as owner_mid,
         (select id from public.roles where company_id = c.id and name = 'Admin') as admin_role,
         (select id from public.roles where company_id = c.id and name = 'Manager') as mgr_role,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role,
         (select id from public.roles where company_id = c.id and name = 'Owner') as owner_role,
         (select m2.id from public.memberships m2 join public.companies c2 on c2.id = m2.company_id where c2.name = 'Work Other Co') as other_mid,
         (select c2.id from public.companies c2 where c2.name = 'Work Other Co') as other_cid
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'Work Co';
grant select on ctx to authenticated;

insert into public.memberships (company_id, user_id, display_name) select cid, 'f1000000-0000-0000-0000-000000000002', 'Admin' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'f1000000-0000-0000-0000-000000000003', 'Manager' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'f1000000-0000-0000-0000-000000000004', 'Staff' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select ctx.cid, m.id, case m.user_id when 'f1000000-0000-0000-0000-000000000002' then ctx.admin_role
                                       when 'f1000000-0000-0000-0000-000000000003' then ctx.mgr_role else ctx.staff_role end
  from ctx join public.memberships m on m.company_id = ctx.cid and m.user_id <> 'f1000000-0000-0000-0000-000000000001';

create temp table people as
  select m.user_id, m.id as mid, e.id as eid
  from public.memberships m join public.employees e on e.membership_id = m.id join ctx on ctx.cid = m.company_id;
grant select on people to authenticated;

create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-0000-0000-00000000000' || n, 'role', 'authenticated',
    'app_metadata', json_build_object('company_id', case when n = 5 then (select other_cid from ctx) else (select cid from ctx) end,
      'membership_id', case when n = 5 then (select other_mid from ctx)
                            else (select mid from people where user_id = ('f1000000-0000-0000-0000-00000000000' || n)::uuid) end))::text, true)
$$;


select is((select count(*)::int from people), 4, 'each member has an employee record');
create function pg_temp.eid(n int) returns uuid language sql as $$ select eid from people where user_id = ('f1000000-0000-0000-0000-00000000000' || n)::uuid $$;
grant execute on function pg_temp.eid(int) to authenticated;
create function pg_temp.dow(d date) returns text language sql as $$ select day_kind from app.work_day(pg_temp.eid(4), d) $$;

-- reporting line: staff reports to manager
select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$update public.employees set reports_to_id = pg_temp.eid(3) where id = pg_temp.eid(4)$$, 'staff reports to manager');
select lives_ok($$update public.company_settings set timezone = 'Asia/Phnom_Penh'$$, 'owner may set the company timezone');
select throws_ok($$update public.company_settings set timezone = 'Mars/Olympus'$$, 'P0001', 'unknown timezone', 'an unknown timezone is refused');
select throws_ok($$update public.branches set timezone = 'Nowhere/City'$$, 'P0001', 'unknown timezone', 'an unknown branch timezone is refused');
reset role;

-- ===== before setup nothing applies =====
select is((select day_kind from app.work_day(pg_temp.eid(4), date '2027-03-01')), 'none', 'no schedule before setup');
select is((select work_setup_done from public.company_settings where company_id = (select cid from ctx)), false, 'setup not done');

-- ===== setup =====
select pg_temp.as_user(1);
set local role authenticated;
select throws_ok($$select public.setup_working_time('every_day')$$, 'P0001', 'unknown pattern', 'unknown pattern refused');
select lives_ok($$select public.setup_working_time('mon_fri_sat_half')$$, 'owner sets up Monday to Friday plus Saturday half day');
select lives_ok($$select public.setup_working_time('mon_fri')$$, 'setup again is harmless');
select is((select count(*)::int from public.work_schedules), 1, 'one schedule, not two');
select is((select work_setup_done from public.company_settings), true, 'setup is marked done');
select is((select hours from public.work_schedule_week_hours()), 44.00::numeric, 'the week is 44 hours');
reset role;
select is(pg_temp.dow(date '2027-03-01'), 'work', 'Monday is a work day');
select is(pg_temp.dow(date '2027-03-06'), 'half', 'Saturday is a half day');
select is(pg_temp.dow(date '2027-03-07'), 'off', 'Sunday is off');
select is((select hours from app.work_day(pg_temp.eid(4), date '2027-03-01')), 8.00::numeric, 'a full day is 8 hours');
select is((select hours from app.work_day(pg_temp.eid(4), date '2027-03-06')), 4.00::numeric, 'a half day is 4 hours');
select is((select source::text from app.work_day(pg_temp.eid(4), date '2027-03-01')), 'company', 'it comes from the company default');

-- employment dates bound the answer
update public.employees set employment_date = date '2027-03-03', end_date = date '2027-03-20' where id = pg_temp.eid(4);
select is(pg_temp.dow(date '2027-03-02'), 'not_employed', 'before the employment date');
select is(pg_temp.dow(date '2027-03-03'), 'work', 'on the employment date');
select is(pg_temp.dow(date '2027-03-21'), 'not_employed', 'after the end date');
update public.employees set employment_date = null, end_date = null where id = pg_temp.eid(4);

-- ===== schedules and versions =====
select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$select public.save_work_schedule(null, 'Night guard', 'យាម', null, '{"grace_late_min": 5}',
  '[{"weekday":1,"kind":"full","start":"22:00","end":"06:00","break_min":0},{"weekday":2,"kind":"full","start":"22:00","end":"06:00","break_min":0},
    {"weekday":3,"kind":"off"},{"weekday":4,"kind":"off"},{"weekday":5,"kind":"off"},{"weekday":6,"kind":"off"},{"weekday":7,"kind":"off"}]')$$, 'create a night schedule');
create temp table sch as select id, name from public.work_schedules;
grant select on sch to authenticated;
select throws_ok($$select public.save_work_schedule(null, 'Night guard', null, null, '{}', (select app.pattern_days('mon_fri')))$$, '23505', null, 'schedule names are unique per company');
select throws_ok($$select public.save_work_schedule(null, 'Bad', null, null, '{}', '[{"weekday":1,"kind":"off"}]')$$, 'P0001', 'seven different weekdays are required', 'all seven weekdays are needed');
select throws_ok($$select public.save_work_schedule(null, 'Bad', null, null, '{}', jsonb_set((select app.pattern_days('mon_fri')), '{0,start}', '"09:00"') #- '{0,end}')$$, '23514', null, 'a work day needs both times');
select throws_ok($$select public.save_work_schedule(null, ' ', null, null, '{}', (select app.pattern_days('mon_fri')))$$, 'P0001', 'name is required', 'a name is required');
reset role;
select is((select hours from app.work_day(pg_temp.eid(4), date '2027-03-01')), 8.00::numeric, 'default still applies to staff');
select is((select app.version_week_hours(v.id) from public.work_schedule_versions v join sch on sch.id = v.schedule_id where sch.name = 'Night guard'), 16.00::numeric, 'night shift 22:00 to 06:00 is 8 hours a night');

-- assignments by level: department, then branch, employee wins
select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$insert into public.departments (company_id, name) values ((select cid from ctx), 'Security')$$, 'owner creates a department');
select lives_ok($$update public.employees set department_id = (select id from public.departments where name = 'Security') where id = pg_temp.eid(4)$$, 'staff joins it');
select lives_ok($$select public.assign_work_schedule('department', (select id from public.departments where name = 'Security'), (select id from sch where name = 'Night guard'), current_date)$$, 'department gets the night schedule');
reset role;
select is((select schedule_id from app.work_day(pg_temp.eid(4), current_date)), (select id from sch where name = 'Night guard'), 'department beats company');
select is((select source::text from app.work_day(pg_temp.eid(4), current_date)), 'department', 'the source says department');
select is((select hours from app.work_day(pg_temp.eid(4), (current_date - extract(isodow from current_date)::int + 1))), 8.00::numeric, 'Monday night shift, 8 hours');
select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$select public.assign_work_schedule('branch', (select id from public.branches limit 1), (select id from sch where name = 'Standard week'), current_date)$$, 'branch gets the standard week');
reset role;
select is((select source::text from app.work_day(pg_temp.eid(4), current_date)), 'department', 'department still beats branch');
select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$select public.assign_work_schedule('employee', pg_temp.eid(4), (select id from sch where name = 'Standard week'), current_date)$$, 'employee gets the standard week');
reset role;
select is((select source::text from app.work_day(pg_temp.eid(4), current_date)), 'employee', 'employee beats department');
select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$select public.assign_work_schedule('employee', pg_temp.eid(4), null, current_date + 7)$$, 'an employee override can be ended from a date (inherit)');
reset role;
select is((select source::text from app.work_day(pg_temp.eid(4), current_date + 7)), 'department', 'after the end it falls back to the department');
select is((select source::text from app.work_day(pg_temp.eid(4), current_date + 6)), 'employee', 'before the end the override holds');

-- history is protected
select pg_temp.as_user(1);
set local role authenticated;
select throws_ok($$select public.assign_work_schedule('company', null, (select id from sch where name = 'Standard week'), current_date - 1)$$, 'P0001', 'an assignment cannot start in the past', 'no assignment in the past');
select throws_ok($$select public.assign_work_schedule('employee', pg_temp.eid(4), (select id from sch where name = 'Night guard'), current_date)$$, 'P0001', 'an assignment already starts on that date', 'a started assignment is not rewritten');
select throws_ok($$select public.remove_work_assignment((select id from public.work_schedule_assignments where scope = 'company'))$$, 'P0001', 'an assignment that has started cannot be removed', 'a started assignment cannot be removed');
select lives_ok($$select public.remove_work_assignment((select id from public.work_schedule_assignments where scope = 'employee' and schedule_id is null))$$, 'a future assignment can be removed');
select throws_ok($$select public.set_work_schedule_active((select id from sch where name = 'Night guard'), false)$$, 'P0001', 'schedule is in use', 'a schedule in use cannot be archived');
select lives_ok($$select public.save_work_schedule((select id from sch where name = 'Standard week'), 'Standard week', null, current_date + 30, '{}', (select app.pattern_days('mon_fri')))$$, 'a new version starts in 30 days');
select throws_ok($$select public.save_work_schedule((select id from sch where name = 'Standard week'), 'Standard week', null, current_date - 1, '{}', (select app.pattern_days('mon_fri')))$$, 'P0001', 'a new version cannot start in the past', 'a version cannot start in the past');
select is((select count(*)::int from public.work_schedule_versions v join sch on sch.id = v.schedule_id where sch.name = 'Standard week'), 2, 'two versions');
reset role;
-- Saturday 30 days from now or later is off under the new version, half before it
select is((select day_kind from app.work_day(pg_temp.eid(1), current_date + 29 + ((6 - extract(isodow from current_date + 29)::int + 7) % 7))), 'off', 'Saturday under the new version is off');
select is((select day_kind from app.work_day(pg_temp.eid(1), current_date + ((6 - extract(isodow from current_date)::int + 7) % 7))), 'half', 'Saturday before the new version is still a half day');

-- ===== scopes =====
-- staff (own): sees patterns, the company default, own department; cannot manage
select pg_temp.as_user(4);
set local role authenticated;
select is((select count(*)::int from public.work_schedules), 2, 'staff reads the schedule patterns');
select ok((select count(*) from public.work_schedule_assignments where scope = 'company') > 0, 'staff sees the company default');
select is((select count(*)::int from public.work_schedule_assignments where scope = 'employee' and target_id <> pg_temp.eid(4)), 0, 'staff sees no one else''s employee assignment');
select is((select count(*)::int from public.work_schedule_assignments where scope = 'employee' and target_id = pg_temp.eid(4)), 1, 'but sees their own');
select is((select count(*)::int from public.employee_work_days(pg_temp.eid(4), current_date, 7)), 7, 'staff reads their own week');
select throws_ok($$select * from public.employee_work_days(pg_temp.eid(3), current_date, 7)$$, '42501', 'not allowed', 'staff cannot read the manager''s week');
select throws_ok($$select public.save_work_schedule(null, 'X', null, null, '{}', (select app.pattern_days('mon_fri')))$$, '42501', 'not allowed', 'staff cannot create schedules');
select throws_ok($$select public.assign_work_schedule('employee', pg_temp.eid(4), (select id from sch limit 1), current_date + 1)$$, '42501', 'not allowed', 'staff cannot assign');
select throws_ok($$select public.setup_working_time('mon_fri')$$, '42501', 'not allowed', 'staff cannot run setup');
select throws_ok($$insert into public.work_schedules (company_id, name) values ((select cid from ctx), 'Direct')$$, '42501', null, 'no direct inserts');
select throws_ok($$update public.work_schedule_assignments set schedule_id = null$$, '42501', null, 'no direct updates');
select throws_ok($$delete from public.work_schedule_days$$, '42501', null, 'no direct deletes');
reset role;

-- manager (team): reads their team (staff) but not the owner
select pg_temp.as_user(3);
set local role authenticated;
select is((select count(*)::int from public.employee_work_days(pg_temp.eid(4), current_date, 3)), 3, 'manager reads a team member''s week');
select throws_ok($$select * from public.employee_work_days(pg_temp.eid(1), current_date, 3)$$, '42501', 'not allowed', 'manager cannot read someone outside the team');
reset role;

-- permission removed: nothing is visible
delete from public.role_permissions where role_id = (select staff_role from ctx) and permission_key = 'attendance.schedule.read';
select pg_temp.as_user(4);
set local role authenticated;
select is((select count(*)::int from public.work_schedules), 0, 'without the permission no schedules are visible');
select is((select count(*)::int from public.work_schedule_assignments), 0, 'nor assignments');
select throws_ok($$select * from public.employee_work_days(pg_temp.eid(4), current_date, 3)$$, '42501', 'not allowed', 'nor their own week');
reset role;

-- ===== other company =====
select pg_temp.as_user(5);
set local role authenticated;
select is((select count(*)::int from public.work_schedules), 0, 'other company sees none of our schedules');
select is((select count(*)::int from public.work_schedule_versions), 0, 'nor versions');
select is((select count(*)::int from public.work_schedule_days), 0, 'nor days');
select is((select count(*)::int from public.work_schedule_assignments), 0, 'nor assignments');
select throws_ok($$select * from public.employee_work_days(pg_temp.eid(4), current_date, 3)$$, '42501', 'not allowed', 'cannot read our employee''s week');
select throws_ok($$select public.assign_work_schedule('employee', pg_temp.eid(4), (select id from sch limit 1), current_date + 1)$$, 'P0002', null, 'cannot assign our employee or schedule');
select throws_ok($$select public.save_work_schedule((select id from sch limit 1), 'Hijack', null, current_date + 1, '{}', (select app.pattern_days('mon_fri')))$$, 'P0002', 'schedule not found', 'cannot version our schedule');
select throws_ok($$select public.set_work_schedule_active((select id from sch limit 1), false)$$, 'P0002', 'schedule not found', 'cannot archive our schedule');
select throws_ok($$select public.remove_work_assignment((select id from public.work_schedule_assignments limit 1))$$, 'P0002', 'assignment not found', 'cannot remove our assignment');
select lives_ok($$select public.setup_working_time('mon_sat')$$, 'they set up their own company');
select is((select count(*)::int from public.work_schedules), 1, 'and see only their own schedule');
select is((select hours from public.work_schedule_week_hours()), 48.00::numeric, 'Monday to Saturday is 48 hours');
reset role;

-- deleting a department drops its assignments
delete from public.departments where name = 'Security';
select is((select count(*)::int from public.work_schedule_assignments where scope = 'department'), 0, 'department assignments go with the department');

-- changes are audited
select ok((select count(*) from public.audit_log where action like 'work_schedule%') > 0, 'schedule changes are audited');

select * from finish();
rollback;

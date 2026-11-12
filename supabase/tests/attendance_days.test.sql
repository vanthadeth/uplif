-- Attendance days: on time, late, early leave, absent, incomplete, half day, overtime and who may read them. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('f7000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'day-owner@test.local'),
  ('f7000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'day-staff@test.local'),
  ('f7000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'day-staff2@test.local'),
  ('f7000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'day-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('f7000000-0000-0000-0000-000000000001', 'Owner'), ('f7000000-0000-0000-0000-000000000002', 'Staff'),
  ('f7000000-0000-0000-0000-000000000003', 'Staff Two'), ('f7000000-0000-0000-0000-000000000005', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'f7000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Day Co', null, 'LA', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'f7000000-0000-0000-0000-000000000005', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Day Other Co', null, 'LA', 'KHR', 'Main');
reset role;

create temp table ctx as
  select c.id as cid, m.id as owner_mid,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role,
         (select m2.id from public.memberships m2 join public.companies c2 on c2.id = m2.company_id where c2.name = 'Day Other Co') as other_mid,
         (select c2.id from public.companies c2 where c2.name = 'Day Other Co') as other_cid
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'Day Co';
grant select on ctx to authenticated;

insert into public.memberships (company_id, user_id, display_name) select cid, 'f7000000-0000-0000-0000-000000000002', 'Staff' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'f7000000-0000-0000-0000-000000000003', 'Staff Two' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select ctx.cid, m.id, ctx.staff_role
  from ctx join public.memberships m on m.company_id = ctx.cid and m.user_id <> 'f7000000-0000-0000-0000-000000000001';

create temp table people as
  select m.user_id, m.id as mid, e.id as eid
  from public.memberships m join public.employees e on e.membership_id = m.id join ctx on ctx.cid = m.company_id;
grant select on people to authenticated;

create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'f7000000-0000-0000-0000-00000000000' || n, 'role', 'authenticated',
    'app_metadata', json_build_object('company_id', case when n = 5 then (select other_cid from ctx) else (select cid from ctx) end,
      'membership_id', case when n = 5 then (select other_mid from ctx)
                            else (select mid from people where user_id = ('f7000000-0000-0000-0000-00000000000' || n)::uuid) end))::text, true)
$$;

select is((select count(*)::int from people), 3, 'each member has an employee record');


create function pg_temp.eid(n int) returns uuid language sql as $$ select eid from people where user_id = ('f7000000-0000-0000-0000-00000000000' || n)::uuid $$;
grant execute on function pg_temp.eid(int) to authenticated;
select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$select public.setup_working_time('mon_fri')$$, 'working time is set up (Mon to Fri, 08:00 to 17:00, 10 min late grace)');
reset role;

-- Events at fixed past dates. Phnom Penh is UTC+7, so 08:00 local is 01:00 UTC.
create function pg_temp.ev(k public.attendance_kind, ts timestamptz) returns void language sql as $$
  insert into public.attendance_events (company_id, employee_id, kind, client_event_id, device_time, occurred_at)
  values ((select cid from ctx), pg_temp.eid(2), k, gen_random_uuid(), ts, ts) $$;
select pg_temp.ev('in',  '2026-01-05 01:05+00'); select pg_temp.ev('out', '2026-01-05 10:00+00');  -- Mon: on time
select pg_temp.ev('in',  '2026-01-06 01:30+00'); select pg_temp.ev('out', '2026-01-06 10:00+00');  -- Tue: 30 min late
select pg_temp.ev('in',  '2026-01-07 01:00+00'); select pg_temp.ev('out', '2026-01-07 09:30+00');  -- Wed: leaves 30 min early
                                                                                                  -- Thu: nothing, absent
select pg_temp.ev('in',  '2026-01-09 01:00+00');                                                  -- Fri: no clock-out
select pg_temp.ev('in',  '2026-01-11 03:00+00'); select pg_temp.ev('out', '2026-01-11 05:00+00');  -- Sun: worked a day off
select pg_temp.ev('in',  '2026-01-12 03:30+00'); select pg_temp.ev('out', '2026-01-12 10:00+00');  -- Mon: 150 min late, half day
select pg_temp.ev('in',  '2026-01-13 00:50+00'); select pg_temp.ev('out', '2026-01-13 11:00+00');  -- Tue: on time, 60 min overtime

create function pg_temp.st(d date) returns text language sql as $$ select status from app.attendance_day(pg_temp.eid(2), d) $$;
create function pg_temp.f(d date, col text) returns integer language sql as $$
  select case col when 'late' then late_min when 'early' then early_min when 'worked' then worked_min else overtime_min end
  from app.attendance_day(pg_temp.eid(2), d) $$;

select is(pg_temp.st(date '2026-01-05'), 'on_time', 'five minutes after the start is inside the grace');
select is(pg_temp.st(date '2026-01-06'), 'late', 'thirty minutes late');
select is(pg_temp.f(date '2026-01-06', 'late'), 30, 'late minutes counted');
select is(pg_temp.st(date '2026-01-07'), 'early_leave', 'left early');
select is(pg_temp.f(date '2026-01-07', 'early'), 30, 'early minutes counted');
select is(pg_temp.st(date '2026-01-08'), 'absent', 'no clock-in on a past work day is absent');
select is(pg_temp.st(date '2026-01-09'), 'incomplete', 'a clock-in without a clock-out on a past day is incomplete');
select is(pg_temp.st(date '2026-01-10'), 'off', 'Saturday is a day off');
select is(pg_temp.st(date '2026-01-11'), 'extra', 'work on a day off is extra');
select is(pg_temp.st(date '2026-01-12'), 'late', 'a long delay is late');
select is((select half_day from app.attendance_day(pg_temp.eid(2), date '2026-01-12')), true, 'and counts as a half day');
select is((select half_day from app.attendance_day(pg_temp.eid(2), date '2026-01-06')), false, 'thirty minutes is not a half day');
select is(pg_temp.st(date '2026-01-13'), 'on_time', 'on time with overtime');
select is(pg_temp.f(date '2026-01-13', 'ot'), 120 - 60, 'overtime counted after the scheduled end');
select is(pg_temp.f(date '2026-01-13', 'worked'), 610, 'worked minutes counted');
select is(pg_temp.st(date '2099-01-05'), 'future', 'a future work day is future');

-- ===== who may read =====
select pg_temp.as_user(2);
set local role authenticated;
select is((select count(*)::int from public.employee_attendance_days(pg_temp.eid(2), date '2026-01-05', 7) where status = 'on_time'), 1, 'staff read their own days');
select is((select status from public.employee_attendance_days(pg_temp.eid(2), date '2026-01-08', 1)), 'absent', 'own day result');
select throws_ok($$select * from public.employee_attendance_days(pg_temp.eid(3), date '2026-01-05', 7)$$, '42501', null, 'staff cannot read a colleague');
select throws_ok($$select * from public.employee_attendance_days(pg_temp.eid(2), date '2026-01-05', 63)$$, 'P0001', null, 'range is limited');
reset role;

select pg_temp.as_user(5);
set local role authenticated;
select throws_ok($$select * from public.employee_attendance_days(pg_temp.eid(2), date '2026-01-05', 7)$$, '42501', null, 'another company cannot read');
reset role;

select * from finish();
rollback;

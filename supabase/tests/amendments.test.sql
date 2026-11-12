-- Attendance corrections: request, approve, reject, cancel, scope and isolation. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('fc000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'lv-owner@test.local'),
  ('fc000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'lv-staff@test.local'),
  ('fc000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'lv-staff2@test.local'),
  ('fc000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'lv-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('fc000000-0000-0000-0000-000000000001', 'Owner'), ('fc000000-0000-0000-0000-000000000002', 'Staff'),
  ('fc000000-0000-0000-0000-000000000003', 'Staff Two'), ('fc000000-0000-0000-0000-000000000005', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'fc000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Lv Co', null, 'LA', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'fc000000-0000-0000-0000-000000000005', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Lv Other Co', null, 'LA', 'KHR', 'Main');
reset role;

create temp table ctx as
  select c.id as cid, m.id as owner_mid,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role,
         (select m2.id from public.memberships m2 join public.companies c2 on c2.id = m2.company_id where c2.name = 'Lv Other Co') as other_mid,
         (select c2.id from public.companies c2 where c2.name = 'Lv Other Co') as other_cid
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'Lv Co';
grant select on ctx to authenticated;

insert into public.memberships (company_id, user_id, display_name) select cid, 'fc000000-0000-0000-0000-000000000002', 'Staff' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'fc000000-0000-0000-0000-000000000003', 'Staff Two' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select ctx.cid, m.id, ctx.staff_role
  from ctx join public.memberships m on m.company_id = ctx.cid and m.user_id <> 'fc000000-0000-0000-0000-000000000001';

create temp table people as
  select m.user_id, m.id as mid, e.id as eid
  from public.memberships m join public.employees e on e.membership_id = m.id join ctx on ctx.cid = m.company_id;
grant select on people to authenticated;

create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'fc000000-0000-0000-0000-00000000000' || n, 'role', 'authenticated',
    'app_metadata', json_build_object('company_id', case when n = 5 then (select other_cid from ctx) else (select cid from ctx) end,
      'membership_id', case when n = 5 then (select other_mid from ctx)
                            else (select mid from people where user_id = ('fc000000-0000-0000-0000-00000000000' || n)::uuid) end))::text, true)
$$;
create function pg_temp.eid(n int) returns uuid language sql as $$ select eid from people where user_id = ('fc000000-0000-0000-0000-00000000000' || n)::uuid $$;
grant execute on function pg_temp.eid(int) to authenticated;

-- the schedule: Mon to Fri, 08:00 to 17:00; staff 2 has worked for a while
select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$select public.setup_working_time('mon_fri')$$, 'working time is set up');
reset role;
update public.employees set employment_date = current_date - 90 where id in (pg_temp.eid(2), pg_temp.eid(3));

-- the most recent weekday before today
create temp table dt as
  select d::date as wd from generate_series(current_date - 1, current_date - 7, interval '-1 day') d where extract(isodow from d) <= 5 order by d desc limit 1;
grant select on dt to authenticated;

select pg_temp.as_user(2);
set local role authenticated;
select is((select status from public.employee_attendance_days(pg_temp.eid(2), (select wd from dt), 1)), 'absent', 'a day with no clock events is absent');
select throws_ok($$select public.request_amendment(current_date + 1, '08:00', null, 'forgot')$$, '22023', 'date not allowed', 'not a future date');
select throws_ok($$select public.request_amendment(current_date - 40, '08:00', null, 'forgot')$$, '22023', 'date not allowed', 'not more than 31 days back');
select throws_ok($$select public.request_amendment((select wd from dt), null, null, 'forgot')$$, '22023', 'a time is required', 'a time is required');
select throws_ok($$select public.request_amendment((select wd from dt), '17:00', '08:00', 'forgot')$$, '22023', 'out must be after in', 'out after in');
select throws_ok($$select public.request_amendment((select wd from dt), '08:00', '17:00', '')$$, '22023', 'a reason is required', 'a reason is required');
create temp table am (id uuid);
grant select, insert on am to authenticated;
insert into am select public.request_amendment((select wd from dt), '08:00', '17:00', 'Phone was dead');
select throws_ok($$select public.request_amendment((select wd from dt), '08:00', null, 'again')$$, 'P0001', 'amendment: already open', 'one open request per day');
select is((select count(*)::int from public.my_amendments() where status = 'pending'), 1, 'it shows in my requests');
select throws_ok($$insert into public.attendance_amendments (company_id, employee_id, work_date, in_time, reason) select cid, pg_temp.eid(2), current_date, '08:00', 'direct' from ctx$$, '42501', null, 'no direct writes');
select throws_ok($$select public.decide_amendment((select id from am), true, null)$$, '42501', 'not allowed', 'staff cannot approve');
reset role;

-- a colleague sees nothing of it
select pg_temp.as_user(3);
set local role authenticated;
select is((select count(*)::int from public.attendance_amendments), 0, 'a colleague cannot read it');
select is((select count(*)::int from public.my_amendments()), 0, 'and has none of their own');
select throws_ok($$select * from public.amendment_review_list('pending')$$, '42501', 'not allowed', 'staff cannot list requests to review');
select throws_ok($$select public.cancel_amendment((select id from am))$$, 'P0001', 'amendment: cannot cancel', 'cannot cancel someone else''s request');
reset role;

-- the owner approves; the day becomes on time, flagged as amended
select pg_temp.as_user(1);
set local role authenticated;
select is((select count(*)::int from public.amendment_review_list('pending')), 1, 'the owner sees one request');
select lives_ok($$select public.decide_amendment((select id from am), true, 'ok')$$, 'owner approves');
select throws_ok($$select public.decide_amendment((select id from am), false, null)$$, 'P0001', 'amendment: already decided', 'cannot decide twice');
reset role;
select is((select count(*)::int from public.attendance_events where employee_id = pg_temp.eid(2) and flags = array['amended']), 2, 'two amended events were added');
select pg_temp.as_user(2);
set local role authenticated;
select is((select status from public.employee_attendance_days(pg_temp.eid(2), (select wd from dt), 1)), 'on_time', 'the day is now on time');
select is((select flagged from public.employee_attendance_days(pg_temp.eid(2), (select wd from dt), 1)), true, 'and flagged as amended');
select is((select status from public.my_amendments()), 'approved', 'my request is approved');
select throws_ok($$select public.cancel_amendment((select id from am))$$, 'P0001', 'amendment: cannot cancel', 'an approved request cannot be cancelled');

-- cancel and reject paths
create temp table am2 (id uuid);
grant select, insert on am2 to authenticated;
insert into am2 select public.request_amendment(current_date, '08:00', null, 'cancel me');
select lives_ok($$select public.cancel_amendment((select id from am2))$$, 'a pending request can be cancelled');
select is((select count(*)::int from public.my_amendments() where status = 'cancelled'), 1, 'it shows as cancelled');
reset role;
create temp table am3 (id uuid);
grant select, insert on am3 to authenticated;
select pg_temp.as_user(3);
set local role authenticated;
insert into am3 select public.request_amendment((select wd from dt), null, '17:30', 'Left late');
reset role;
select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$select public.decide_amendment((select id from am3), false, 'no')$$, 'owner rejects');
select is((select count(*)::int from public.amendment_review_list('rejected')), 1, 'one rejected');
reset role;
select is((select count(*)::int from public.attendance_events where employee_id = pg_temp.eid(3)), 0, 'a rejected request adds no events');


-- nobody approves their own request
create temp table am4 (id uuid);
grant select, insert on am4 to authenticated;
select pg_temp.as_user(1);
set local role authenticated;
insert into am4 select public.request_amendment(current_date, '09:00', null, 'my own');
select throws_ok($$select public.decide_amendment((select id from am4), true, null)$$, '42501', 'not allowed', 'nobody approves their own request');
reset role;

-- another company sees nothing
select pg_temp.as_user(5);
set local role authenticated;
select is((select count(*)::int from public.attendance_amendments), 0, 'other company reads nothing');
select is((select count(*)::int from public.amendment_review_list('pending')), 0, 'and has nothing to review');
select throws_ok($$select public.decide_amendment((select id from am3), true, null)$$, '42501', 'not allowed', 'other company cannot decide');
reset role;

select * from finish();
rollback;

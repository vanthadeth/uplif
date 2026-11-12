-- Leave: asking, balances, overlaps, review by scope, nobody approves their own, and company isolation. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('fa000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'lv-owner@test.local'),
  ('fa000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'lv-staff@test.local'),
  ('fa000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'lv-staff2@test.local'),
  ('fa000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'lv-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('fa000000-0000-0000-0000-000000000001', 'Owner'), ('fa000000-0000-0000-0000-000000000002', 'Staff'),
  ('fa000000-0000-0000-0000-000000000003', 'Staff Two'), ('fa000000-0000-0000-0000-000000000005', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'fa000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Lv Co', null, 'LA', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'fa000000-0000-0000-0000-000000000005', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
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

insert into public.memberships (company_id, user_id, display_name) select cid, 'fa000000-0000-0000-0000-000000000002', 'Staff' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'fa000000-0000-0000-0000-000000000003', 'Staff Two' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select ctx.cid, m.id, ctx.staff_role
  from ctx join public.memberships m on m.company_id = ctx.cid and m.user_id <> 'fa000000-0000-0000-0000-000000000001';

create temp table people as
  select m.user_id, m.id as mid, e.id as eid
  from public.memberships m join public.employees e on e.membership_id = m.id join ctx on ctx.cid = m.company_id;
grant select on people to authenticated;

create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'fa000000-0000-0000-0000-00000000000' || n, 'role', 'authenticated',
    'app_metadata', json_build_object('company_id', case when n = 5 then (select other_cid from ctx) else (select cid from ctx) end,
      'membership_id', case when n = 5 then (select other_mid from ctx)
                            else (select mid from people where user_id = ('fa000000-0000-0000-0000-00000000000' || n)::uuid) end))::text, true)
$$;
create function pg_temp.eid(n int) returns uuid language sql as $$ select eid from people where user_id = ('fa000000-0000-0000-0000-00000000000' || n)::uuid $$;
grant execute on function pg_temp.eid(int) to authenticated;

create temp table dt as select (date_trunc('week', current_date)::date + 7) as next_mon, (date_trunc('week', current_date)::date - 7) as last_mon,
  (date_trunc('week', current_date)::date + 5) as this_sat;
grant select on dt to authenticated;

select is((select count(*)::int from people), 3, 'each member has an employee record');
select is((select count(*)::int from public.leave_types where company_id = (select cid from ctx)), 3, 'a company starts with three leave types');
select is((select count(*)::int from public.leave_types where company_id = (select other_cid from ctx)), 3, 'so does the other company');

select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$select public.setup_working_time('mon_fri')$$, 'working time is set up (Mon to Fri)');
reset role;

-- staff asks for two working days of annual leave
select pg_temp.as_user(2);
set local role authenticated;
create temp table req as
  select public.request_leave((select id from public.leave_types where code = 'AL' and company_id = (select cid from ctx)),
                              (select next_mon from dt), (select next_mon + 1 from dt), 'full', 'Family') as id;
select is((select days from public.leave_requests where id = (select id from req)), 2.0, 'two working days are counted');
select is((select status from public.leave_requests where id = (select id from req)), 'pending', 'the request waits');
select throws_ok($$select public.request_leave((select id from public.leave_types where code = 'AL' and company_id = (select cid from ctx)), (select next_mon + 1 from dt), (select next_mon + 2 from dt), 'full', null)$$,
  'P0001', 'leave: overlaps', 'overlapping dates are refused');
select throws_ok($$select public.request_leave((select id from public.leave_types where code = 'AL' and company_id = (select cid from ctx)), (select next_mon + 14 from dt), (select next_mon + 40 from dt), 'full', null)$$,
  'P0001', 'leave: balance', 'more than the yearly days is refused');
select throws_ok($$select public.request_leave((select id from public.leave_types where code = 'AL' and company_id = (select cid from ctx)), (select this_sat from dt), (select this_sat + 1 from dt), 'full', null)$$,
  'P0001', 'leave: no working days', 'a weekend has no working days');
select throws_ok($$select public.request_leave((select id from public.leave_types where code = 'AL' and company_id = (select cid from ctx)), (select next_mon + 21 from dt), (select next_mon + 22 from dt), 'start', null)$$,
  'P0001', 'leave: dates', 'a half day needs a single date');
select lives_ok($$select public.request_leave((select id from public.leave_types where code = 'UL' and company_id = (select cid from ctx)), (select next_mon + 21 from dt), (select next_mon + 21 from dt), 'end', null)$$, 'a half day is accepted');
select is((select days from public.leave_requests where start_date = (select next_mon + 21 from dt)), 0.5, 'a half day counts 0.5');
select throws_ok($$insert into public.leave_requests (company_id, employee_id, type_id, start_date, end_date, days) select (select cid from ctx), pg_temp.eid(2), id, current_date, current_date, 1 from public.leave_types limit 1$$,
  '42501', null, 'nobody writes the table directly');
reset role;

-- another employee in the same company sees nothing of it, and cannot touch it
select pg_temp.as_user(3);
set local role authenticated;
select is((select count(*)::int from public.leave_requests), 0, 'a colleague cannot read the request');
select is((select jsonb_array_length(public.my_leave() -> 'requests')), 0, 'my_leave shows only your own');
select throws_ok($$select public.cancel_leave((select id from req))$$, 'P0002', 'leave: not found', 'a colleague cannot cancel it');
select throws_ok($$select public.decide_leave((select id from req), true, null)$$, '42501', null, 'staff cannot decide');
reset role;

-- the owner reviews: sees it, cannot approve their own
select pg_temp.as_user(1);
set local role authenticated;
select is((select count(*)::int from public.leave_review_list('pending')), 2, 'the owner sees both pending requests');
select lives_ok($$select public.decide_leave((select id from req), true, 'Enjoy')$$, 'the owner approves');
select is((select status from public.leave_requests where id = (select id from req)), 'approved', 'it is approved');
select throws_ok($$select public.decide_leave((select id from req), false, null)$$, 'P0001', 'leave: already decided', 'a decision cannot be changed');
create temp table own as
  select public.request_leave((select id from public.leave_types where code = 'SL' and company_id = (select cid from ctx)), (select next_mon + 28 from dt), (select next_mon + 28 from dt), 'full', null) as id;
select throws_ok($$select public.decide_leave((select id from own), true, null)$$, '42501', null, 'nobody approves their own request');
reset role;

-- approved leave turns an absent day into a leave day
select pg_temp.as_user(3);
set local role authenticated;
select lives_ok($$select public.request_leave((select id from public.leave_types where code = 'AL' and company_id = (select cid from ctx)), (select last_mon from dt), (select last_mon from dt), 'full', null)$$, 'a recent past day can be requested');
reset role;
select pg_temp.as_user(1);
set local role authenticated;
select is((select status from public.employee_attendance_days(pg_temp.eid(3), (select last_mon from dt), 1)), 'absent', 'before approval the day is absent');
select public.decide_leave((select id from public.leave_requests where employee_id = pg_temp.eid(3)), true, null);
select is((select status from public.employee_attendance_days(pg_temp.eid(3), (select last_mon from dt), 1)), 'leave', 'after approval it is leave');
reset role;

-- cancel: own approved leave that has not started
select pg_temp.as_user(2);
set local role authenticated;
select lives_ok($$select public.cancel_leave((select id from req))$$, 'approved leave that has not started can be cancelled');
select is((select status from public.leave_requests where id = (select id from req)), 'cancelled', 'it is cancelled');
select is((select (t ->> 'pending')::numeric from jsonb_array_elements(public.my_leave() -> 'types') t where t ->> 'code' = 'UL'), 0.5, 'balances show pending days');
reset role;

-- the other company is a different world
select pg_temp.as_user(5);
set local role authenticated;
select is((select count(*)::int from public.leave_requests), 0, 'another company reads no requests');
select throws_ok($$select public.decide_leave((select id from req), true, null)$$, '42501', null, 'another company cannot decide');
select is((select count(*)::int from public.leave_review_list('pending')), 0, 'another company reviews nothing');
select is((select count(*)::int from public.leave_types), 3, 'and sees only its own types');
reset role;

select * from finish();
rollback;

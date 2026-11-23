-- Time attendance report: who may call it, what it returns, and company isolation. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('fc000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'tr-owner@test.local'),
  ('fc000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'tr-staff@test.local'),
  ('fc000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'tr-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('fc000000-0000-0000-0000-000000000001', 'Owner'), ('fc000000-0000-0000-0000-000000000002', 'Staff'), ('fc000000-0000-0000-0000-000000000005', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'fc000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Tr Co', null, 'LA', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'fc000000-0000-0000-0000-000000000005', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Tr Other Co', null, 'LA', 'KHR', 'Main');
reset role;

create temp table ctx as
  select c.id as cid, m.id as owner_mid,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role,
         (select m2.id from public.memberships m2 join public.companies c2 on c2.id = m2.company_id where c2.name = 'Tr Other Co') as other_mid,
         (select c2.id from public.companies c2 where c2.name = 'Tr Other Co') as other_cid
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'Tr Co';
grant select on ctx to authenticated;

insert into public.memberships (company_id, user_id, display_name) select cid, 'fc000000-0000-0000-0000-000000000002', 'Staff' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select ctx.cid, m.id, ctx.staff_role from ctx join public.memberships m on m.company_id = ctx.cid and m.user_id = 'fc000000-0000-0000-0000-000000000002';

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

select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$select public.setup_working_time('mon_fri')$$, 'working time is set up');
select is((select count(*)::int from public.time_attendance_report(current_date - 6, 7)), 2, 'the owner sees both employees');
select is((select count(*)::int from public.time_attendance_report(current_date - 6, 7) where employee_id not in (select eid from people)), 0, 'and nobody else');
select ok((select bool_and(cardinality(days) = 7) from public.time_attendance_report(current_date - 6, 7)), 'one status per day');
select throws_ok($$select * from public.time_attendance_report(current_date, 32)$$, 'P0001', 'range not allowed', 'a range over 31 days is refused');
reset role;

select pg_temp.as_user(2);
set local role authenticated;
select throws_ok($$select * from public.time_attendance_report(current_date, 7)$$, '42501', 'not allowed', 'a staff member who can only read their own record is refused');
reset role;

select pg_temp.as_user(5);
set local role authenticated;
select is((select count(*)::int from public.time_attendance_report(current_date - 6, 7)), 1, 'the other company owner sees only their own company');
select is((select count(*)::int from public.time_attendance_report(current_date - 6, 7) where employee_id in (select eid from people)), 0, 'no row of the first company leaks');
reset role;

select * from finish();
rollback;

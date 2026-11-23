-- Leave allowances: who may give days, the balance, append-only, and company isolation. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('fd000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'la-owner@test.local'),
  ('fd000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'la-staff@test.local'),
  ('fd000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'la-staff2@test.local'),
  ('fd000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'la-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('fd000000-0000-0000-0000-000000000001', 'Owner'), ('fd000000-0000-0000-0000-000000000002', 'Staff'),
  ('fd000000-0000-0000-0000-000000000003', 'Staff Two'), ('fd000000-0000-0000-0000-000000000005', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'fd000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('La Co', null, 'LA', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'fd000000-0000-0000-0000-000000000005', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('La Other Co', null, 'LA', 'KHR', 'Main');
reset role;

create temp table ctx as
  select c.id as cid, m.id as owner_mid,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role,
         (select m2.id from public.memberships m2 join public.companies c2 on c2.id = m2.company_id where c2.name = 'La Other Co') as other_mid,
         (select c2.id from public.companies c2 where c2.name = 'La Other Co') as other_cid
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'La Co';
grant select on ctx to authenticated;

insert into public.memberships (company_id, user_id, display_name) select cid, 'fd000000-0000-0000-0000-000000000002', 'Staff' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'fd000000-0000-0000-0000-000000000003', 'Staff Two' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select ctx.cid, m.id, ctx.staff_role
  from ctx join public.memberships m on m.company_id = ctx.cid and m.user_id <> 'fd000000-0000-0000-0000-000000000001';

create temp table people as
  select m.user_id, m.id as mid, e.id as eid
  from public.memberships m join public.employees e on e.membership_id = m.id join ctx on ctx.cid = m.company_id;
grant select on people to authenticated;

create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'fd000000-0000-0000-0000-00000000000' || n, 'role', 'authenticated',
    'app_metadata', json_build_object('company_id', case when n = 5 then (select other_cid from ctx) else (select cid from ctx) end,
      'membership_id', case when n = 5 then (select other_mid from ctx)
                            else (select mid from people where user_id = ('fd000000-0000-0000-0000-00000000000' || n)::uuid) end))::text, true)
$$;
create function pg_temp.eid(n int) returns uuid language sql as $$ select eid from people where user_id = ('fd000000-0000-0000-0000-00000000000' || n)::uuid $$;
grant execute on function pg_temp.eid(int) to authenticated;

create temp table dt as select (date_trunc('week', current_date)::date + 7) as next_mon;
grant select on dt to authenticated;
create temp table al as select id from public.leave_types where code = 'AL' and company_id = (select cid from ctx);
grant select on al to authenticated;

select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$select public.setup_working_time('mon_fri')$$, 'working time is set up');
select lives_ok($$select public.grant_leave_allowance(pg_temp.eid(2), (select id from al), extract(year from current_date)::int, 2, 'Service bonus')$$, 'the owner gives two extra days');
select is((select entitled from public.time_leave_balances() where employee_id = pg_temp.eid(2) and type_code = 'AL'), 20.0, 'the balance is 18 plus 2');
select is((select allowance from public.time_leave_balances() where employee_id = pg_temp.eid(2) and type_code = 'AL'), 2.0, 'the allowance column shows the 2');
select throws_ok($$select public.grant_leave_allowance(pg_temp.eid(2), (select id from al), extract(year from current_date)::int, -50, 'too much')$$, 'P0001', 'leave: allowance', 'days cannot take a person below zero');
select throws_ok($$select public.grant_leave_allowance(pg_temp.eid(2), (select id from public.leave_types where code = 'UL' and company_id = (select cid from ctx)), extract(year from current_date)::int, 1, 'x')$$, 'P0001', 'leave: unlimited', 'a type without a limit takes no allowance');
select throws_ok($$update public.leave_allowances set days = 9$$, '42501', null, 'allowances cannot be changed');
select throws_ok($$delete from public.leave_allowances$$, '42501', null, 'allowances cannot be deleted');
reset role;

select pg_temp.as_user(2);
set local role authenticated;
select is((select (t->>'annual_days')::numeric from jsonb_array_elements(public.my_leave()->'types') t where t->>'code' = 'AL'), 20.0, 'the person sees the 20 days in UPLIF Me');
select throws_ok($$select public.grant_leave_allowance(pg_temp.eid(2), (select id from al), extract(year from current_date)::int, 5, 'self')$$, '42501', 'not allowed', 'staff cannot give themselves days');
select throws_ok($$select * from public.time_leave_balances()$$, '42501', 'not allowed', 'staff cannot read the balances of others');
select is((select count(*)::int from public.leave_allowances), 1, 'staff see only their own allowance rows');
reset role;

select pg_temp.as_user(5);
set local role authenticated;
select is((select count(*)::int from public.leave_allowances), 0, 'the other company sees no allowance rows');
select is((select count(*)::int from public.time_leave_balances() where employee_id in (select eid from people)), 0, 'and no balances of the first company');
select throws_ok($$select public.grant_leave_allowance(pg_temp.eid(2), (select id from al), extract(year from current_date)::int, 1, 'cross')$$, 'P0002', 'leave: not found', 'the other owner cannot give days to a person of another company');
reset role;

select * from finish();
rollback;

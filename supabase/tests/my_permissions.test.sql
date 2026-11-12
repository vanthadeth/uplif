-- Tests for public.my_permissions(). One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('b1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'p-owner@test.local'),
  ('b1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'p-staff@test.local'),
  ('b1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'p-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('b1000000-0000-0000-0000-000000000001', 'Owner'), ('b1000000-0000-0000-0000-000000000002', 'Staff'),
  ('b1000000-0000-0000-0000-000000000003', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'b1000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Perm Co', null, 'KH', 'KHR', 'Main');
reset role;

create temp table ctx as
  select c.id as cid, m.id as owner_mid,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role,
         (select id from public.branches where company_id = c.id limit 1) as bid
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'Perm Co';
grant select on ctx to authenticated;

insert into public.memberships (company_id, user_id, display_name)
  select cid, 'b1000000-0000-0000-0000-000000000002', 'Staff' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select ctx.cid, m.id, ctx.staff_role from ctx join public.memberships m on m.user_id = 'b1000000-0000-0000-0000-000000000002';

-- Owner: every permission, all at company scope
select set_config('request.jwt.claims', (select json_build_object('sub', 'b1000000-0000-0000-0000-000000000001', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', cid, 'membership_id', owner_mid))::text from ctx), true);
set local role authenticated;
select is((select count(*)::int from public.my_permissions()), (select count(*)::int from public.permissions), 'owner holds every permission');
select ok(not exists (select 1 from public.my_permissions() where data_scope <> 'company'), 'owner scopes are all company');
reset role;

-- Staff: branch.read at branch scope, plus reading their own schedule
select set_config('request.jwt.claims', (select json_build_object('sub', 'b1000000-0000-0000-0000-000000000002', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', ctx.cid, 'membership_id', m.id))::text
  from ctx join public.memberships m on m.user_id = 'b1000000-0000-0000-0000-000000000002'), true);
set local role authenticated;
select is((select count(*)::int from public.my_permissions()), 3, 'staff holds three permissions');
select is((select string_agg(permission_key, ',' order by permission_key) from public.my_permissions()), 'attendance.holiday.read,attendance.schedule.read,org.branch.read', 'branch, holiday and schedule read');
select is((select data_scope::text from public.my_permissions() where permission_key = 'org.branch.read'), 'branch', 'branch.read is at branch scope');
select is((select data_scope::text from public.my_permissions() where permission_key = 'attendance.schedule.read'), 'own', 'schedule.read is own');
reset role;

-- A user cannot claim someone else's membership
select set_config('request.jwt.claims', (select json_build_object('sub', 'b1000000-0000-0000-0000-000000000003', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', cid, 'membership_id', owner_mid))::text from ctx), true);
set local role authenticated;
select is((select count(*)::int from public.my_permissions()), 0, 'a forged membership claim yields nothing');
reset role;

-- No claim, no permissions
select set_config('request.jwt.claims', json_build_object('sub', 'b1000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select is((select count(*)::int from public.my_permissions()), 0, 'no company claim yields nothing');
reset role;

-- Anonymous callers cannot run it
set local role anon;
select throws_ok($$select * from public.my_permissions()$$, '42501', null, 'anon cannot call it');
reset role;

select string_agg(t, ' | ') as result from finish() t;
rollback;

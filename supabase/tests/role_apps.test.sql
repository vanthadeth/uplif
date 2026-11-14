-- Tests for app-first roles: role_apps, app-aware permission checks and public.save_role_access(). One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('c1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ra-owner@test.local'),
  ('c1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ra-staff@test.local'),
  ('c1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'ra-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('c1000000-0000-0000-0000-000000000001', 'Owner'), ('c1000000-0000-0000-0000-000000000002', 'Staff'),
  ('c1000000-0000-0000-0000-000000000003', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'c1000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Apps Co', null, 'KH', 'KHR', 'Main');
select public.create_company('Other Apps Co', null, 'KH', 'KHR', 'Main');
reset role;

create temp table ctx as
  select c.id as cid, m.id as owner_mid,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role,
         (select id from public.roles where company_id = c.id and name = 'Owner') as owner_role
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'Apps Co';
grant select on ctx to authenticated;
insert into public.memberships (company_id, user_id, display_name)
  select cid, 'c1000000-0000-0000-0000-000000000002', 'Staff' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select ctx.cid, m.id, ctx.staff_role from ctx join public.memberships m on m.user_id = 'c1000000-0000-0000-0000-000000000002';

select is(app.app_of_permission('org.member.read'), 'admin', 'org keys belong to Admin');
select is(app.app_of_permission('attendance.clock.self'), 'time', 'attendance keys belong to Time');
select is(app.app_of_permission('sales.customer.read'), 'go', 'sales keys belong to Go');
select is(app.app_of_permission('org.branch.read'), null, 'branch read belongs to no app');

-- as the owner
select set_config('request.jwt.claims', (select json_build_object('sub', 'c1000000-0000-0000-0000-000000000001', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', cid, 'membership_id', owner_mid))::text from ctx), true);
set local role authenticated;
select lives_ok($$select public.save_role_access((select staff_role from ctx), '{"time": true, "admin": false}'::jsonb,
  '{"org.branch.read": "branch", "attendance.clock.self": "company", "attendance.record.read": "own", "leave.request.review": "company"}'::jsonb)$$, 'owner saves a role');
select is((select count(*)::int from public.role_apps where role_id = (select staff_role from ctx)), 2, 'two app rows written');
select is((select count(*)::int from public.role_permissions where role_id = (select staff_role from ctx)), 4, 'role now holds exactly the listed actions');
select throws_ok($$select public.save_role_access((select owner_role from ctx), '{"go": false}'::jsonb, '{}'::jsonb)$$, '42501', null, 'the Owner role stays fixed');
select throws_ok($$select public.save_role_access((select staff_role from ctx), '{"me": false}'::jsonb, '{}'::jsonb)$$, '22023', null, 'Me cannot be switched off');
select throws_ok($$select public.save_role_access((select staff_role from ctx), '{}'::jsonb, '{"org.branch.read": "everything"}'::jsonb)$$, '22023', null, 'bad scope refused');
select throws_ok($$select public.save_role_access((select staff_role from ctx), '{}'::jsonb, '{"nope.nope.nope": "company"}'::jsonb)$$, '22023', null, 'unknown permission refused');
select throws_ok($$insert into public.role_apps (company_id, role_id, app_key, allowed) select cid, staff_role, 'stock', true from ctx$$, '42501', null, 'no direct writes');
reset role;

-- staff: Admin denied hides its keys; Time allowed keeps attendance keys
select set_config('request.jwt.claims', (select json_build_object('sub', 'c1000000-0000-0000-0000-000000000002', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', ctx.cid, 'membership_id', m.id))::text
  from ctx join public.memberships m on m.user_id = 'c1000000-0000-0000-0000-000000000002'), true);
set local role authenticated;
select is((select string_agg(permission_key, ',' order by permission_key) from public.my_permissions()), 'attendance.clock.self,attendance.record.read,org.branch.read', 'denied Admin removes its keys, branch read stays');
select is((select app.permission_scope('leave.request.review'))::text, null, 'permission_scope also respects the denied app');
select is((select app.permission_scope('attendance.clock.self'))::text, 'company', 'allowed app keeps its keys');
select throws_ok($$select public.save_role_access((select staff_role from ctx), '{}'::jsonb, '{}'::jsonb)$$, '42501', null, 'staff cannot save roles');
reset role;

-- turn Admin back on: the saved actions return
select set_config('request.jwt.claims', (select json_build_object('sub', 'c1000000-0000-0000-0000-000000000001', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', cid, 'membership_id', owner_mid))::text from ctx), true);
set local role authenticated;
select public.save_role_access((select staff_role from ctx), '{"admin": true}'::jsonb,
  '{"org.branch.read": "branch", "attendance.clock.self": "company", "attendance.record.read": "own", "leave.request.review": "company"}'::jsonb);
reset role;
select set_config('request.jwt.claims', (select json_build_object('sub', 'c1000000-0000-0000-0000-000000000002', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', ctx.cid, 'membership_id', m.id))::text
  from ctx join public.memberships m on m.user_id = 'c1000000-0000-0000-0000-000000000002'), true);
set local role authenticated;
select is((select count(*)::int from public.my_permissions() where permission_key = 'leave.request.review'), 1, 'allowing Admin again restores its key');
select is((select count(*)::int from public.role_apps), 0, 'staff cannot read role apps without role.read');
reset role;

-- another company's owner sees none of it and cannot save into it
select set_config('request.jwt.claims', (select json_build_object('sub', 'c1000000-0000-0000-0000-000000000001', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', c.id, 'membership_id', m.id))::text
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'Other Apps Co'), true);
set local role authenticated;
select is((select count(*)::int from public.role_apps where role_id = (select staff_role from ctx)), 0, 'another company sees no role apps');
select throws_ok($$select public.save_role_access((select staff_role from ctx), '{"go": true}'::jsonb, '{}'::jsonb)$$, '42501', null, 'cannot save a role of another company');
reset role;

select string_agg(t, ' | ') as result from finish() t;
rollback;

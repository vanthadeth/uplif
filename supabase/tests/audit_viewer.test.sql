-- Slice 5 tests: who can read the audit log, and that other companies never can. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('a2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'au-owner@test.local'),
  ('a2000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'au-mgr@test.local'),
  ('a2000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'au-staff@test.local'),
  ('a2000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'au-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('a2000000-0000-0000-0000-000000000001', 'Owner'), ('a2000000-0000-0000-0000-000000000002', 'Manager'),
  ('a2000000-0000-0000-0000-000000000003', 'Staff'), ('a2000000-0000-0000-0000-000000000004', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'a2000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Audit Co', null, 'KH', 'KHR', 'Main');
reset role;
create temp table ctx as
  select c.id as cid, m.id as owner_mid,
         (select id from public.roles where company_id = c.id and name = 'Manager') as mgr_role,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'Audit Co';
grant select on ctx to authenticated;
insert into public.memberships (company_id, user_id, display_name) select cid, 'a2000000-0000-0000-0000-000000000002', 'Manager' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'a2000000-0000-0000-0000-000000000003', 'Staff' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select cid, (select id from public.memberships where user_id = 'a2000000-0000-0000-0000-000000000002'), mgr_role from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select cid, (select id from public.memberships where user_id = 'a2000000-0000-0000-0000-000000000003'), staff_role from ctx;

select set_config('request.jwt.claims', json_build_object('sub', 'a2000000-0000-0000-0000-000000000001', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select cid from ctx), 'membership_id', (select owner_mid from ctx)))::text, true);
set local role authenticated;
select lives_ok($$update public.branches set name = 'Head office'$$, 'owner edits a branch');
select cmp_ok((select count(*)::int from public.audit_log), '>=', 2, 'owner reads the audit log');
select is((select count(*)::int from public.audit_log where company_id <> (select cid from ctx)), 0, 'only own company rows');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', 'a2000000-0000-0000-0000-000000000002', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select cid from ctx), 'membership_id', (select id from public.memberships where user_id = 'a2000000-0000-0000-0000-000000000002')))::text, true);
set local role authenticated;
select cmp_ok((select count(*)::int from public.audit_log), '>=', 2, 'manager reads the audit log');
select throws_ok($$update public.audit_log set action = 'tamper'$$, '42501', null, 'manager cannot edit audit rows');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', 'a2000000-0000-0000-0000-000000000003', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select cid from ctx), 'membership_id', (select id from public.memberships where user_id = 'a2000000-0000-0000-0000-000000000003')))::text, true);
set local role authenticated;
select is((select count(*)::int from public.audit_log), 0, 'staff cannot read the audit log');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', 'a2000000-0000-0000-0000-000000000004', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Other Audit Co', null, 'KH', 'USD', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'a2000000-0000-0000-0000-000000000004', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Other Audit Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Other Audit Co')))::text, true);
set local role authenticated;
select is((select count(*)::int from public.audit_log where company_id = (select cid from ctx)), 0, 'another company owner sees none of these rows');
reset role;

select string_agg(t, ' | ') as result from finish() t;
rollback;

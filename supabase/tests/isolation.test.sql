-- Tenant isolation tests (pgTAP). Everything runs in one transaction and rolls back.
-- Run with: supabase test db   (or paste into the SQL editor; the last SELECT summarises results).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Fixtures (as postgres, which bypasses RLS)
insert into auth.users (id, aud, role, email) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'owner-a@test.local'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'staff-a@test.local'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'owner-b@test.local'),
  ('cccccccc-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'nobody@test.local');
insert into public.companies (id, name, country_code) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Company A', 'KH'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Company B', 'KH');
insert into public.branches (id, company_id, name) values
  ('aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-000000000001', 'A1'),
  ('aaaaaaaa-0000-0000-0000-0000000000d2', 'aaaaaaaa-0000-0000-0000-000000000001', 'A2'),
  ('bbbbbbbb-0000-0000-0000-0000000000d1', 'bbbbbbbb-0000-0000-0000-000000000001', 'B1');
insert into public.memberships (id, company_id, user_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000e1', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1'),
  ('aaaaaaaa-0000-0000-0000-0000000000e2', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a2'),
  ('bbbbbbbb-0000-0000-0000-0000000000e1', 'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-0000000000b1');
insert into public.roles (id, company_id, name) values
  ('aaaaaaaa-0000-0000-0000-0000000000f1', 'aaaaaaaa-0000-0000-0000-000000000001', 'Owner'),
  ('aaaaaaaa-0000-0000-0000-0000000000f2', 'aaaaaaaa-0000-0000-0000-000000000001', 'Staff'),
  ('bbbbbbbb-0000-0000-0000-0000000000f1', 'bbbbbbbb-0000-0000-0000-000000000001', 'Owner');
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000f1', key, 'company' from public.permissions;
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select 'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-0000000000f1', key, 'company' from public.permissions;
insert into public.role_permissions (company_id, role_id, permission_key, data_scope) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000f2', 'org.branch.read', 'branch');
insert into public.membership_roles (company_id, membership_id, role_id, branch_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000e1', 'aaaaaaaa-0000-0000-0000-0000000000f1', null),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000e2', 'aaaaaaaa-0000-0000-0000-0000000000f2', 'aaaaaaaa-0000-0000-0000-0000000000d1'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-0000000000e1', 'bbbbbbbb-0000-0000-0000-0000000000f1', null);
insert into public.company_settings (company_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'), ('bbbbbbbb-0000-0000-0000-000000000001');

-- Structure
select is((select count(*)::int from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
           and not (relrowsecurity and relforcerowsecurity)), 0, 'every public table has RLS enabled and forced');
select is((select count(*)::int from pg_class where relnamespace = 'app'::regnamespace and relkind = 'r'
           and not (relrowsecurity and relforcerowsecurity)), 0, 'every app table has RLS enabled and forced');
select is(has_function_privilege('anon', 'app.permission_scope(text)', 'execute'), false, 'anon cannot run app helpers');
select is(has_function_privilege('authenticated', 'app.custom_access_token_hook(jsonb)', 'execute'), false, 'users cannot run the auth hook');
select is(has_table_privilege('anon', 'public.companies', 'select'), false, 'anon has no table privileges');

-- Database-level guards (as postgres)
select throws_ok($$insert into public.membership_roles (company_id, membership_id, role_id)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000e1', 'bbbbbbbb-0000-0000-0000-0000000000f1')$$,
  '23503', null, 'composite FK blocks a role from another company');
select throws_ok($$insert into public.membership_roles (company_id, membership_id, role_id, branch_id)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000e2', 'aaaaaaaa-0000-0000-0000-0000000000f2', 'bbbbbbbb-0000-0000-0000-0000000000d1')$$,
  '23503', null, 'composite FK blocks a branch from another company');
select throws_ok($$update public.branches set company_id = 'bbbbbbbb-0000-0000-0000-000000000001' where name = 'A1'$$,
  '23000', null, 'company_id cannot be changed');
select throws_ok($$update public.memberships set user_id = 'cccccccc-0000-0000-0000-0000000000c1' where id = 'aaaaaaaa-0000-0000-0000-0000000000e2'$$,
  '23000', null, 'membership user_id cannot be changed');

-- Auth hook
select is((app.custom_access_token_hook(jsonb_build_object('user_id', 'aaaaaaaa-0000-0000-0000-0000000000a1',
  'claims', jsonb_build_object('app_metadata', jsonb_build_object('company_id', 'bbbbbbbb-0000-0000-0000-000000000001')))))
  -> 'claims' -> 'app_metadata' ->> 'company_id', 'aaaaaaaa-0000-0000-0000-000000000001', 'hook sets company from membership and overwrites spoofed value');
select is((app.custom_access_token_hook(jsonb_build_object('user_id', 'cccccccc-0000-0000-0000-0000000000c1',
  'claims', jsonb_build_object('app_metadata', jsonb_build_object('company_id', 'bbbbbbbb-0000-0000-0000-000000000001')))))
  -> 'claims' -> 'app_metadata' ->> 'company_id', null, 'hook strips company claim for users without a membership');

-- Anonymous
set local role anon;
select throws_ok('select * from public.companies', '42501', null, 'anon cannot read companies');
select throws_ok('select * from public.branches', '42501', null, 'anon cannot read branches');
reset role;

-- Owner of A
select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', 'aaaaaaaa-0000-0000-0000-000000000001', 'membership_id', 'aaaaaaaa-0000-0000-0000-0000000000e1'))::text, true);
set local role authenticated;
select is((select count(*)::int from public.companies), 1, 'A owner sees exactly one company');
select is((select count(*)::int from public.branches), 2, 'A owner sees both A branches');
select is((select count(*)::int from public.branches where company_id = 'bbbbbbbb-0000-0000-0000-000000000001'), 0, 'A owner sees no B branches');
select is((select count(*)::int from public.memberships), 2, 'A owner sees A team only');
select is((select count(*)::int from public.roles), 2, 'A owner sees A roles only');
select is((select count(*)::int from public.role_permissions where company_id <> 'aaaaaaaa-0000-0000-0000-000000000001'), 0, 'A owner sees no B role_permissions');
select is((select count(*)::int from public.membership_roles where company_id <> 'aaaaaaaa-0000-0000-0000-000000000001'), 0, 'A owner sees no B membership_roles');
select is((select count(*)::int from public.company_settings), 1, 'A owner sees own settings only');
select cmp_ok((select count(*)::int from public.permissions), '>', 0, 'permission catalog is readable');
select throws_ok($$insert into public.branches (company_id, name) values ('bbbbbbbb-0000-0000-0000-000000000001', 'evil')$$, '42501', null, 'A owner cannot insert into B');
update public.branches set name = 'hacked' where id = 'bbbbbbbb-0000-0000-0000-0000000000d1';
delete from public.branches where id = 'bbbbbbbb-0000-0000-0000-0000000000d1';
update public.companies set name = 'hacked' where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select lives_ok($$insert into public.branches (company_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'A3')$$, 'A owner can add an A branch');
select throws_ok($$insert into public.permissions (key, description) values ('x.y.z', 'x')$$, '42501', null, 'permission catalog is not writable');
select throws_ok('select * from public.platform_admins', '42501', null, 'platform_admins is not reachable');
select throws_ok('select * from app.user_context', '42501', null, 'app.user_context is not reachable');
select throws_ok($$insert into public.companies (name, country_code) values ('Fake', 'KH')$$, '42501', null, 'users cannot create companies directly');
reset role;
select is((select name from public.branches where id = 'bbbbbbbb-0000-0000-0000-0000000000d1'), 'B1', 'A owner could not update or delete B branch');
select is((select name from public.companies where id = 'bbbbbbbb-0000-0000-0000-000000000001'), 'Company B', 'A owner could not update company B');

-- Branch-scoped staff of A
select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000a2', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', 'aaaaaaaa-0000-0000-0000-000000000001', 'membership_id', 'aaaaaaaa-0000-0000-0000-0000000000e2'))::text, true);
set local role authenticated;
select is((select count(*)::int from public.branches), 1, 'staff sees only their assigned branch');
select is((select count(*)::int from public.memberships), 1, 'staff sees only their own membership');
select is((select count(*)::int from public.roles), 0, 'staff cannot read roles');
select throws_ok($$insert into public.branches (company_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'staff-made')$$, '42501', null, 'staff cannot create branches');
update public.branches set name = 'x' where id = 'aaaaaaaa-0000-0000-0000-0000000000d1';
reset role;
select is((select name from public.branches where id = 'aaaaaaaa-0000-0000-0000-0000000000d1'), 'A1', 'staff could not edit branches');

-- Forged claims: staff of A presents B's company and membership
select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000a2', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', 'bbbbbbbb-0000-0000-0000-000000000001', 'membership_id', 'bbbbbbbb-0000-0000-0000-0000000000e1'))::text, true);
set local role authenticated;
select is((select count(*)::int from public.companies), 0, 'forged claims see no company');
select is((select count(*)::int from public.branches), 0, 'forged claims see no branches');
select is((select count(*)::int from public.memberships), 0, 'forged claims see no memberships');
reset role;

-- No membership at all
select set_config('request.jwt.claims', json_build_object('sub', 'cccccccc-0000-0000-0000-0000000000c1', 'role', 'authenticated',
  'app_metadata', json_build_object())::text, true);
set local role authenticated;
select is((select count(*)::int from public.companies), 0, 'user without membership sees no company');
select is((select count(*)::int from public.branches), 0, 'user without membership sees no branches');
reset role;

-- Suspended membership with an otherwise valid token
update public.memberships set status = 'suspended' where id = 'aaaaaaaa-0000-0000-0000-0000000000e1';
select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', 'aaaaaaaa-0000-0000-0000-000000000001', 'membership_id', 'aaaaaaaa-0000-0000-0000-0000000000e1'))::text, true);
set local role authenticated;
select is((select count(*)::int from public.companies), 0, 'suspended member loses access immediately');
select is((select count(*)::int from public.branches), 0, 'suspended member sees no branches');
reset role;

-- Prints the plan line (1..N) plus a diagnostic row for every failed test.
select string_agg(t, E'
') as result from finish() t;
rollback;

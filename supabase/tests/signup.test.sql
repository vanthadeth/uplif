-- Signup / company / audit tests (pgTAP). One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('dddddddd-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'new-a@test.local'),
  ('dddddddd-0000-0000-0000-0000000000d2', 'authenticated', 'authenticated', 'new-b@test.local');

-- User 1: no profile yet, cannot create a company
select set_config('request.jwt.claims', json_build_object('sub', 'dddddddd-0000-0000-0000-0000000000d1', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select throws_ok($$select public.create_company('Shop A', null, 'KH', 'USD', 'Main')$$, 'P0001', 'profile required', 'company needs a profile first');
select lives_ok($$insert into public.profiles (user_id, full_name) values ('dddddddd-0000-0000-0000-0000000000d1', 'Dara')$$, 'user creates own profile');
select throws_ok($$insert into public.profiles (user_id, full_name) values ('dddddddd-0000-0000-0000-0000000000d2', 'Fake')$$, '42501', null, 'user cannot create profile for someone else');
select lives_ok($$select public.create_company('Shop A', null, 'KH', 'USD', 'Main')$$, 'user creates a company');
select is((select count(*)::int from public.list_my_companies()), 1, 'picker lists the new company');
reset role;

select is((select count(*)::int from public.roles r join public.companies c on c.id = r.company_id where c.name = 'Shop A' and r.is_system), 7, 'seven system roles seeded');
select is((select count(*)::int from public.audit_log where action = 'company.create'), 1, 'creation is audited');
select is((select count(*)::int from public.membership_roles mr join public.roles r on r.id = mr.role_id where r.name = 'Owner' and r.company_id = (select id from public.companies where name = 'Shop A')), 1, 'creator is Owner');

-- User 2 profile, company B
select set_config('request.jwt.claims', json_build_object('sub', 'dddddddd-0000-0000-0000-0000000000d2', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select lives_ok($$insert into public.profiles (user_id, full_name) values ('dddddddd-0000-0000-0000-0000000000d2', 'Sok')$$, 'second user profile');
select lives_ok($$select public.create_company('Shop B', null, 'KH', 'KHR', null)$$, 'second user creates company');
select is((select count(*)::int from public.profiles), 1, 'user sees only own profile');
select is((select count(*)::int from public.list_my_companies() where name = 'Shop A'), 0, 'picker never shows others'' companies');
select throws_ok($$select public.switch_company((select id from public.memberships where company_id = (select id from public.companies where name = 'Shop A' limit 1)))$$, null, null, 'cannot switch into another company');
reset role;

-- Audit log: tenant scoped and append-only
select set_config('request.jwt.claims', json_build_object('sub', 'dddddddd-0000-0000-0000-0000000000d1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Shop A'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Shop A')))::text, true);
set local role authenticated;
select is((select count(*)::int from public.audit_log), 1, 'owner A sees only A audit rows');
select throws_ok($$insert into public.audit_log (company_id, action, entity_type) values ((select id from public.companies where name = 'Shop A'), 'x', 'x')$$, '42501', null, 'users cannot write audit rows');
reset role;
select throws_ok($$update public.audit_log set action = 'tamper'$$, '42501', null, 'audit log cannot be updated');
select throws_ok($$delete from public.audit_log$$, '42501', null, 'audit log cannot be deleted');
select is(has_function_privilege('anon', 'public.create_company(text,text,text,text,text)', 'execute'), false, 'anon cannot create companies');

-- Prints the plan line (1..N) plus a diagnostic row for every failed test.
select string_agg(t, E'
') as result from finish() t;
rollback;

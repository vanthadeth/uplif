-- Slice 2 tests: company settings, branches and their audit trail. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('eeeeeeee-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'owner-1@test.local'),
  ('eeeeeeee-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'owner-2@test.local');
insert into public.profiles (user_id, full_name) values
  ('eeeeeeee-0000-0000-0000-0000000000e1', 'One'), ('eeeeeeee-0000-0000-0000-0000000000e2', 'Two');

-- Owner 1 creates a company, then works inside it with the claims the auth hook would issue.
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000e1', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('One Co', null, 'KH', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000e1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'One Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'One Co')))::text, true);
set local role authenticated;
select lives_ok($$insert into public.branches (company_id, name) values ((select id from public.companies), 'Market')$$, 'owner adds a branch');
select lives_ok($$update public.branches set is_active = false where name = 'Market'$$, 'owner deactivates a branch');
select lives_ok($$update public.company_settings set cross_branch_stock_visibility = true$$, 'owner edits company settings');
select lives_ok($$update public.companies set name = 'One Company'$$, 'owner renames company');
select is((select count(*)::int from public.audit_log where action = 'branches.insert'), 1, 'branch insert is audited');
select is((select details -> 'new' ->> 'is_active' from public.audit_log where action = 'branches.update'), 'false', 'branch update audit records the change');
select is((select count(*)::int from public.audit_log where action in ('company_settings.update', 'companies.update')), 2, 'settings and company edits are audited');
reset role;
select is((select count(*)::int from public.audit_log where membership_id is null and action like 'branches.%'), 0, 'no unattributed branch audit rows');

-- Owner 2 never sees company 1 data
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000e2', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Two Co', null, 'KH', 'USD', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000e2', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Two Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Two Co')))::text, true);
set local role authenticated;
select is((select count(*)::int from public.branches where name = 'Market'), 0, 'owner 2 does not see company 1 branches');
select is((select count(*)::int from public.audit_log where action like 'branches.%'), 0, 'owner 2 does not see company 1 audit rows');
update public.branches set name = 'hijack' where name = 'Market';
reset role;
select is((select count(*)::int from public.branches where name = 'Market'), 1, 'owner 2 could not edit company 1 branch');

select string_agg(t, ' | ') as result from finish() t;
rollback;

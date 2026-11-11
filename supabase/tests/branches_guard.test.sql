-- Branch rules: the last active branch cannot be deactivated or deleted, and other companies cannot touch branches. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('ffffffff-0000-0000-0000-0000000000f1', 'authenticated', 'authenticated', 'bg-1@test.local'),
  ('ffffffff-0000-0000-0000-0000000000f2', 'authenticated', 'authenticated', 'bg-2@test.local');
insert into public.profiles (user_id, full_name) values
  ('ffffffff-0000-0000-0000-0000000000f1', 'One'), ('ffffffff-0000-0000-0000-0000000000f2', 'Two');

select set_config('request.jwt.claims', json_build_object('sub', 'ffffffff-0000-0000-0000-0000000000f1', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Guard One', null, 'KH', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'ffffffff-0000-0000-0000-0000000000f2', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Guard Two', null, 'KH', 'KHR', 'Main');
reset role;

-- Owner 1
select set_config('request.jwt.claims', json_build_object('sub', 'ffffffff-0000-0000-0000-0000000000f1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Guard One'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Guard One')))::text, true);
set local role authenticated;
select throws_ok($$update public.branches set is_active = false where name = 'Main'$$, '23514', 'a company keeps at least one active branch', 'the last active branch cannot be deactivated');
select throws_ok($$delete from public.branches where name = 'Main'$$, '23514', 'a company keeps at least one active branch', 'the last active branch cannot be deleted');
select lives_ok($$update public.branches set name = 'Main shop' where name = 'Main'$$, 'the last active branch can still be renamed');
select lives_ok($$insert into public.branches (company_id, name) values ((select id from public.companies), 'Market')$$, 'a second branch can be added');
select lives_ok($$update public.branches set is_active = false where name = 'Main shop'$$, 'with another active branch, one can be deactivated');
select throws_ok($$update public.branches set is_active = false where name = 'Market'$$, '23514', 'a company keeps at least one active branch', 'now Market is the last active one');
select lives_ok($$update public.branches set is_active = true where name = 'Main shop'$$, 'a branch can be activated again');
select lives_ok($$update public.branches set is_active = false where name = 'Market'$$, 'and then the other can be deactivated');

-- Owner 2 cannot see or change company 1 branches
select set_config('request.jwt.claims', json_build_object('sub', 'ffffffff-0000-0000-0000-0000000000f2', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Guard Two'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Guard Two')))::text, true);
set local role authenticated;
select is((select count(*)::int from public.branches where name in ('Main shop', 'Market')), 0, 'owner 2 sees none of company 1 branches');
select lives_ok($$update public.branches set name = 'Hijacked' where name in ('Main shop', 'Market')$$, 'owner 2 update of company 1 branches runs but matches nothing');
select lives_ok($$update public.branches set is_active = true where name = 'Market'$$, 'owner 2 activate of a company 1 branch runs but matches nothing');
reset role;
select is((select count(*)::int from public.branches where name = 'Hijacked'), 0, 'no branch was renamed across companies');
select is((select is_active from public.branches where name = 'Market'), false, 'company 1 Market stayed inactive');

select * from finish();
rollback;

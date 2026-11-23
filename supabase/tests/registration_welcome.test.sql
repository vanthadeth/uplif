-- Tests for public.my_enabled_modules(). One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('c1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'rw-owner@test.local'),
  ('c1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'rw-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('c1000000-0000-0000-0000-000000000001', 'Owner'), ('c1000000-0000-0000-0000-000000000002', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'c1000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Welcome Co', null, 'KH', 'KHR', 'Main');
reset role;
create temp table ctx as
  select c.id as cid, m.id as mid from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'Welcome Co';
grant select on ctx to authenticated;

-- A member sees the modules of their company's plan
select set_config('request.jwt.claims', (select json_build_object('sub', 'c1000000-0000-0000-0000-000000000001', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', cid, 'membership_id', mid))::text from ctx), true);
set local role authenticated;
select ok(public.my_enabled_modules() @> array['attendance'], 'a trial company has the attendance module');
reset role;

-- The same claims used by someone who is not that member return nothing (the claim alone is not trusted)
select set_config('request.jwt.claims', (select json_build_object('sub', 'c1000000-0000-0000-0000-000000000002', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', cid, 'membership_id', mid))::text from ctx), true);
set local role authenticated;
select is(public.my_enabled_modules(), '{}'::text[], 'a forged company claim gets no modules');
reset role;

-- No company claim: nothing
select set_config('request.jwt.claims', json_build_object('sub', 'c1000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select is(public.my_enabled_modules(), '{}'::text[], 'no company claim gives no modules');
reset role;

-- Signed-out callers cannot call it
set local role anon;
select throws_ok($$select public.my_enabled_modules()$$, '42501', null, 'anon cannot call my_enabled_modules');
reset role;

select * from finish();
rollback;

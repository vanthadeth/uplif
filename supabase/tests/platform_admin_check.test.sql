-- Tests for public.is_platform_admin(). One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('f2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'pa-admin@test.local'),
  ('f2000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'pa-user@test.local');
insert into public.platform_admins (user_id) values ('f2000000-0000-0000-0000-000000000001');

select set_config('request.jwt.claims', json_build_object('sub', 'f2000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select is(public.is_platform_admin(), true, 'a platform admin gets true');
select throws_ok($$select * from public.platform_admins$$, '42501', null, 'the table itself stays closed to the API');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', 'f2000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select is(public.is_platform_admin(), false, 'an ordinary user gets false');
reset role;

set local role anon;
select throws_ok($$select public.is_platform_admin()$$, '42501', null, 'signed-out callers cannot call it');
reset role;

select * from finish();
rollback;

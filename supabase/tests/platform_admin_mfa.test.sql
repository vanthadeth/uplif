-- Tests for migration 23: platform functions need the second sign-in step (aal2). One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('f4000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'mfa-admin@test.local'),
  ('f4000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'mfa-user@test.local');
insert into public.platform_admins (user_id) values ('f4000000-0000-0000-0000-000000000001');

create function pg_temp.claims(p_uid uuid, p_aal text) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal, 'app_metadata', json_build_object())::text, true)
$f$;

select pg_temp.claims('f4000000-0000-0000-0000-000000000001', 'aal1');
set local role authenticated;
select throws_ok($$select public.platform_list_plans()$$, '42501', 'second step required', 'admin with a password/Google-only session (aal1) is refused');
select is(public.is_platform_admin(), true, 'is_platform_admin still answers (identity only), so the app can send them to the code screen');
reset role;

select pg_temp.claims('f4000000-0000-0000-0000-000000000001', 'aal2');
set local role authenticated;
select lives_ok($$select public.platform_list_plans()$$, 'admin with the second step done (aal2) is allowed');
reset role;

select pg_temp.claims('f4000000-0000-0000-0000-000000000002', 'aal2');
set local role authenticated;
select throws_ok($$select public.platform_list_plans()$$, '42501', 'not allowed', 'a non-admin is refused even at aal2');
reset role;

select * from finish();
rollback;

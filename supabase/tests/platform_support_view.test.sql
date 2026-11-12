-- Read-only support viewer. One transaction, rolled back.
-- Covers: only the platform admin who asked can use it; it needs a live approved grant (not requested, declined,
-- ended or expired); it shows only the allowed snapshot and never emails; it reads one company only; every look is
-- logged on both sides.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create function pg_temp.claims(p_uid uuid) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal2', 'app_metadata', json_build_object())::text, true)
$f$;
create function pg_temp.member_claims(p_uid uuid, p_cid uuid, p_mid uuid) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', json_build_object('company_id', p_cid, 'membership_id', p_mid))::text, true)
$f$;

insert into auth.users (id, aud, role, email) values
  ('f6000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'sv-admin@test.local'),
  ('f6000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'sv-owner-a@test.local'),
  ('f6000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'sv-owner-b@test.local'),
  ('f6000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'sv-admin2@test.local');
insert into public.profiles (user_id, full_name) values
  ('f6000000-0000-0000-0000-000000000001', 'Admin'), ('f6000000-0000-0000-0000-000000000002', 'Owner A'),
  ('f6000000-0000-0000-0000-000000000003', 'Owner B'), ('f6000000-0000-0000-0000-000000000004', 'Admin Two');
insert into public.platform_admins (user_id) values ('f6000000-0000-0000-0000-000000000001'), ('f6000000-0000-0000-0000-000000000004');

select pg_temp.claims('f6000000-0000-0000-0000-000000000002');
set local role authenticated;
select public.create_company('View A', null, 'KH', 'KHR', 'Main');
reset role;
select pg_temp.claims('f6000000-0000-0000-0000-000000000003');
set local role authenticated;
select public.create_company('View B', null, 'KH', 'KHR', 'Main');
reset role;
create temp table ctx as
  select (select id from public.companies where name = 'View A') as a,
         (select id from public.companies where name = 'View B') as b,
         (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'View A') as a_owner_m,
         (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'View B') as b_owner_m;
grant select on ctx to authenticated;
create function pg_temp.gid(p_company uuid, p_status text) returns uuid language sql security definer as $f$ select id from public.support_grants where company_id = p_company and status = p_status order by requested_at desc limit 1 $f$;

-- before any grant: nothing to look at
select pg_temp.claims('f6000000-0000-0000-0000-000000000001');
set local role authenticated;
select throws_ok($$select public.platform_support_view(gen_random_uuid())$$, 'P0002', 'support access not found', 'an unknown grant is refused');
select lives_ok($$select public.platform_request_support_access((select a from ctx), 'invoice looks wrong', 4)$$, 'admin asks for access to A');
select throws_ok($$select public.platform_support_view(pg_temp.gid((select a from ctx), 'requested'))$$, 'P0001', 'this access is not active', 'a request that is not approved cannot be used');
reset role;

-- an owner and a signed-out caller cannot use it
select pg_temp.member_claims('f6000000-0000-0000-0000-000000000002', (select a from ctx), (select a_owner_m from ctx));
set local role authenticated;
select throws_ok($$select public.platform_support_view(pg_temp.gid((select a from ctx), 'requested'))$$, '42501', 'not allowed', 'a company owner cannot use the viewer');
select lives_ok($$select public.respond_support_access(pg_temp.gid((select a from ctx), 'requested'), true)$$, 'the owner approves');
reset role;
set local role anon;
select throws_ok($$select public.platform_support_view(gen_random_uuid())$$, '42501', null, 'signed-out callers cannot use the viewer');
reset role;

-- another platform admin cannot borrow the grant
select pg_temp.claims('f6000000-0000-0000-0000-000000000004');
set local role authenticated;
select throws_ok($$select public.platform_support_view(pg_temp.gid((select a from ctx), 'approved'))$$, 'P0002', 'support access not found', 'only the admin who asked can look');
reset role;

-- the admin who asked can look, and sees the allowed snapshot only
select pg_temp.claims('f6000000-0000-0000-0000-000000000001');
set local role authenticated;
select lives_ok($$select public.platform_support_view(pg_temp.gid((select a from ctx), 'approved'))$$, 'the admin looks at company A');
select is((select public.platform_support_view(pg_temp.gid((select a from ctx), 'approved'))->'company'->>'name'), 'View A', 'it shows company A');
select is((select jsonb_array_length(public.platform_support_view(pg_temp.gid((select a from ctx), 'approved'))->'branches')), 1, 'it lists the branches');
select is((select jsonb_array_length(public.platform_support_view(pg_temp.gid((select a from ctx), 'approved'))->'team')), 1, 'it lists the team');
select is((select array(select jsonb_object_keys(public.platform_support_view(pg_temp.gid((select a from ctx), 'approved'))) order by 1)::text),
  '{branches,company,currencies,expires_at,roles,settings,team}', 'only the allowed sections come back');
select ok((select public.platform_support_view(pg_temp.gid((select a from ctx), 'approved'))::text !~* '(sv-owner|@test\.local|user_id)'), 'no sign-in email or user id is returned');
select ok((select public.platform_support_view(pg_temp.gid((select a from ctx), 'approved'))::text !~ 'View B'), 'nothing from company B is returned');
select is((select count(*)::int from public.companies), 0, 'the viewer opens no table access for the admin');
reset role;

-- both logs saw it
select ok((select count(*) from public.platform_log where action = 'support_access.view') >= 7, 'every look is in the platform log');
select ok((select count(*) from public.audit_log where company_id = (select a from ctx) and action = 'support_access.view' and membership_id is null) >= 7, 'every look is in the company audit log');
select is((select count(*)::int from public.audit_log where company_id = (select b from ctx) and action = 'support_access.view'), 0, 'company B sees nothing');

-- ending or expiring the access closes the viewer
select pg_temp.claims('f6000000-0000-0000-0000-000000000001');
set local role authenticated;
select lives_ok($$select public.platform_end_support_access(pg_temp.gid((select a from ctx), 'approved'))$$, 'admin ends the access');
select throws_ok($$select public.platform_support_view(pg_temp.gid((select a from ctx), 'ended'))$$, 'P0001', 'this access is not active', 'an ended grant cannot be used');
reset role;
select pg_temp.claims('f6000000-0000-0000-0000-000000000001');
set local role authenticated;
select lives_ok($$select public.platform_request_support_access((select b from ctx), 'check settings', 1)$$, 'admin asks for access to B');
reset role;
select pg_temp.member_claims('f6000000-0000-0000-0000-000000000003', (select b from ctx), (select b_owner_m from ctx));
set local role authenticated;
select public.respond_support_access(pg_temp.gid((select b from ctx), 'requested'), true);
reset role;
update public.support_grants set expires_at = now() - interval '1 minute' where company_id = (select b from ctx) and status = 'approved';
select pg_temp.claims('f6000000-0000-0000-0000-000000000001');
set local role authenticated;
select throws_ok($$select public.platform_support_view(pg_temp.gid((select b from ctx), 'approved'))$$, 'P0001', 'this access is not active', 'an expired grant cannot be used');
reset role;

select * from finish();
rollback;

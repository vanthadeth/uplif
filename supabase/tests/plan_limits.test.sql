-- Plan limits are enforced by the database. One transaction, rolled back.
-- Covers: companies, branches (per company) and users (active members plus pending invitations); a revoked
-- invitation frees its seat; accepting an invitation uses its reserved seat; reactivating a member needs a free
-- seat; a bigger plan lifts the limit; admin tooling with no signed-in user is not blocked.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create function pg_temp.claims(p_uid uuid) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'app_metadata', json_build_object())::text, true)
$f$;
create function pg_temp.member_claims(p_uid uuid, p_cid uuid, p_mid uuid) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'app_metadata', json_build_object('company_id', p_cid, 'membership_id', p_mid))::text, true)
$f$;

insert into auth.users (id, aud, role, email) values
  ('f7000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'pl-owner@test.local'),
  ('f7000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'pl-joiner@test.local');
insert into public.profiles (user_id, full_name) values
  ('f7000000-0000-0000-0000-000000000001', 'Plan Owner'), ('f7000000-0000-0000-0000-000000000002', 'Joiner');

select pg_temp.claims('f7000000-0000-0000-0000-000000000001');
set local role authenticated;
select public.create_company('Limit Co', null, 'KH', 'KHR', 'Main');
reset role;
-- the account starts on a Premium trial; move it to Lite: 1 company, 3 branches, 5 users
update public.subscriptions set plan_id = (select id from public.plans where code = 'lite') where owner_user_id = 'f7000000-0000-0000-0000-000000000001';
create temp table ctx as
  select (select id from public.companies where name = 'Limit Co') as cid,
         (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Limit Co') as mid,
         (select id from public.roles r where r.company_id = (select id from public.companies where name = 'Limit Co') and r.name = 'Manager') as role_id;
grant select on ctx to authenticated;

select pg_temp.claims('f7000000-0000-0000-0000-000000000001');
set local role authenticated;
select throws_ok($$select public.create_company('Second Co', null, 'KH', 'KHR', 'Main')$$, 'P0001', 'plan limit: companies', 'Lite cannot own a second company');
reset role;

select pg_temp.member_claims('f7000000-0000-0000-0000-000000000001', (select cid from ctx), (select mid from ctx));
set local role authenticated;
select lives_ok($$insert into public.branches (company_id, name) values ((select cid from ctx), 'B2')$$, 'second branch fits');
select lives_ok($$insert into public.branches (company_id, name) values ((select cid from ctx), 'B3')$$, 'third branch fits');
select throws_ok($$insert into public.branches (company_id, name) values ((select cid from ctx), 'B4')$$, 'P0001', 'plan limit: branches', 'a fourth branch is refused on Lite');

-- users: owner is 1 of 5; four invitations fill the plan
select lives_ok($$select public.create_invitation((select role_id from ctx), null, 'i1')$$, 'invitation 1');
select lives_ok($$select public.create_invitation((select role_id from ctx), null, 'i2')$$, 'invitation 2');
select lives_ok($$select public.create_invitation((select role_id from ctx), null, 'i3')$$, 'invitation 3');
select set_config('test.tok4', (public.create_invitation((select role_id from ctx), null, 'i4')) ->> 'token', true);
select throws_ok($$select public.create_invitation((select role_id from ctx), null, 'i5')$$, 'P0001', 'plan limit: users', 'the fifth seat is refused');
select lives_ok($$select public.revoke_invitation((select id from public.invitations where label = 'i3'))$$, 'revoking an invitation frees its seat');
select lives_ok($$select public.create_invitation((select role_id from ctx), null, 'i3b')$$, 'the freed seat can be used again');
reset role;

-- accepting uses the seat the invitation reserved, even when the plan is full
select pg_temp.claims('f7000000-0000-0000-0000-000000000002');
set local role authenticated;
select lives_ok($$select public.accept_invitation(current_setting('test.tok4'))$$, 'accepting an invitation works on a full plan');
reset role;
select is((select count(*)::int from public.memberships where company_id = (select cid from ctx) and status = 'active'), 2, 'two active members');

-- suspending frees a seat for a new invitation; reactivating needs one
select pg_temp.member_claims('f7000000-0000-0000-0000-000000000001', (select cid from ctx), (select mid from ctx));
set local role authenticated;
select lives_ok($$update public.memberships set status = 'suspended' where user_id = 'f7000000-0000-0000-0000-000000000002'$$, 'suspend the joiner');
select lives_ok($$select public.create_invitation((select role_id from ctx), null, 'i6')$$, 'the suspended seat is free for a new invitation');
select throws_ok($$update public.memberships set status = 'active' where user_id = 'f7000000-0000-0000-0000-000000000002'$$, 'P0001', 'plan limit: users', 'reactivating needs a free seat');
reset role;

-- a bigger plan lifts the limits
update public.subscriptions set plan_id = (select id from public.plans where code = 'premium') where owner_user_id = 'f7000000-0000-0000-0000-000000000001';
select pg_temp.claims('f7000000-0000-0000-0000-000000000001');
set local role authenticated;
select lives_ok($$select public.create_company('Second Co', null, 'KH', 'KHR', 'Main')$$, 'Premium allows a second company');
reset role;
select pg_temp.member_claims('f7000000-0000-0000-0000-000000000001', (select cid from ctx), (select mid from ctx));
set local role authenticated;
select lives_ok($$update public.memberships set status = 'active' where user_id = 'f7000000-0000-0000-0000-000000000002'$$, 'the member can be reactivated on Premium');
reset role;

-- admin tooling with no signed-in user is not blocked
update public.subscriptions set plan_id = (select id from public.plans where code = 'lite') where owner_user_id = 'f7000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims', '', true);
select lives_ok($$insert into public.branches (company_id, name) values ((select cid from ctx), 'Tool branch')$$, 'a direct insert with no signed-in user is not blocked');

select * from finish();
rollback;

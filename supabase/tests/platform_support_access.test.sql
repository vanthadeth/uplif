-- Support access and the admin activity log. One transaction, rolled back.
-- Covers: only platform admins can ask; only the company's Owner can answer; other companies and non-owners are
-- refused; limits on hours and reason; one open request per company; expiry; both logs are written; closed grants
-- are final; the platform never gains any read access to company data.
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
  ('f5000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'sa-admin@test.local'),
  ('f5000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'sa-owner-a@test.local'),
  ('f5000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'sa-owner-b@test.local'),
  ('f5000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'sa-manager-a@test.local');
insert into public.profiles (user_id, full_name) values
  ('f5000000-0000-0000-0000-000000000001', 'Platform Admin'), ('f5000000-0000-0000-0000-000000000002', 'Owner A'),
  ('f5000000-0000-0000-0000-000000000003', 'Owner B'), ('f5000000-0000-0000-0000-000000000004', 'Manager A');
insert into public.platform_admins (user_id) values ('f5000000-0000-0000-0000-000000000001');

select pg_temp.claims('f5000000-0000-0000-0000-000000000002');
set local role authenticated;
select public.create_company('Support A', null, 'KH', 'KHR', 'Main');
reset role;
select pg_temp.claims('f5000000-0000-0000-0000-000000000003');
set local role authenticated;
select public.create_company('Support B', null, 'KH', 'KHR', 'Main');
reset role;
create temp table ctx as
  select (select id from public.companies where name = 'Support A') as a,
         (select id from public.companies where name = 'Support B') as b,
         (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Support A') as a_owner_m,
         (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Support B') as b_owner_m;
grant select on ctx to authenticated;
insert into public.memberships (company_id, user_id, display_name) select a, 'f5000000-0000-0000-0000-000000000004', 'Manager A' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select ctx.a, (select id from public.memberships where user_id = 'f5000000-0000-0000-0000-000000000004'),
         (select id from public.roles where company_id = ctx.a and name = 'Manager') from ctx;
create function pg_temp.gid(p_status text) returns uuid language sql security definer as $f$ select id from public.support_grants where status = p_status order by requested_at desc limit 1 $f$;
create function pg_temp.gidc(p_company uuid, p_status text) returns uuid language sql security definer as $f$ select id from public.support_grants where company_id = p_company and status = p_status order by requested_at desc limit 1 $f$;
create function pg_temp.mgr_mid() returns uuid language sql security definer as $f$ select id from public.memberships where user_id = 'f5000000-0000-0000-0000-000000000004' $f$;

-- non-admins cannot use the platform side; the table is closed
select pg_temp.member_claims('f5000000-0000-0000-0000-000000000002', (select a from ctx), (select a_owner_m from ctx));
set local role authenticated;
select throws_ok($$select public.platform_request_support_access((select a from ctx), 'look at it please', 2)$$, '42501', 'not allowed', 'an owner cannot request support access for themselves');
select throws_ok($$select * from public.platform_list_support_grants()$$, '42501', 'not allowed', 'owner cannot list platform grants');
select throws_ok($$select * from public.platform_list_log()$$, '42501', 'not allowed', 'owner cannot read the platform log');
select throws_ok($$select * from public.support_grants$$, '42501', null, 'support_grants is closed to the API');
select is((select count(*)::int from public.my_support_grants()), 0, 'owner starts with no requests');
reset role;

-- platform admin: validation and request
select pg_temp.claims('f5000000-0000-0000-0000-000000000001');
set local role authenticated;
select throws_ok($$select public.platform_request_support_access((select a from ctx), 'abc', 2)$$, '22023', null, 'a reason shorter than 5 characters is refused');
select throws_ok($$select public.platform_request_support_access((select a from ctx), repeat('x', 301), 2)$$, '22023', null, 'a reason over 300 characters is refused');
select throws_ok($$select public.platform_request_support_access((select a from ctx), 'invoice looks wrong', 0)$$, '22023', null, 'zero hours refused');
select throws_ok($$select public.platform_request_support_access((select a from ctx), 'invoice looks wrong', 25)$$, '22023', null, '25 hours refused');
select throws_ok($$select public.platform_request_support_access(gen_random_uuid(), 'invoice looks wrong', 2)$$, 'P0002', null, 'unknown company refused');
select lives_ok($$select public.platform_request_support_access((select a from ctx), '  invoice looks wrong  ', 4)$$, 'admin requests access to company A');
select throws_ok($$select public.platform_request_support_access((select a from ctx), 'second try please', 2)$$, 'P0001', 'this company already has an open request', 'one open request per company');
select is((select status from public.platform_list_support_grants() where company_name = 'Support A'), 'requested', 'the request is listed as requested');
select is((select reason from public.platform_list_support_grants() where company_name = 'Support A'), 'invoice looks wrong', 'the reason is trimmed');
-- the admin still sees nothing inside any company
select is((select count(*)::int from public.memberships), 0, 'the request gives the admin no team rows');
select is((select count(*)::int from public.branches), 0, 'the request gives the admin no branch rows');
select is((select count(*)::int from public.audit_log), 0, 'the request gives the admin no company audit rows');
reset role;

-- other company's owner and a non-owner cannot see or answer it
select pg_temp.member_claims('f5000000-0000-0000-0000-000000000003', (select b from ctx), (select b_owner_m from ctx));
set local role authenticated;
select is((select count(*)::int from public.my_support_grants()), 0, 'owner of company B does not see company A requests');
select throws_ok($$select public.respond_support_access(pg_temp.gid('requested'), true)$$, 'P0002', null, 'owner of company B cannot approve company A request');
reset role;
select pg_temp.member_claims('f5000000-0000-0000-0000-000000000004', (select a from ctx), pg_temp.mgr_mid());
set local role authenticated;
select throws_ok($$select * from public.my_support_grants()$$, '42501', 'not allowed', 'a manager cannot read support requests');
select throws_ok($$select public.respond_support_access(pg_temp.gid('requested'), true)$$, '42501', 'not allowed', 'a manager cannot approve');
select throws_ok($$select public.end_support_access(pg_temp.gid('requested'))$$, '42501', 'not allowed', 'a manager cannot end access');
reset role;
-- a signed-in user with no company claims is refused too
select pg_temp.claims('f5000000-0000-0000-0000-000000000002');
set local role authenticated;
select throws_ok($$select public.respond_support_access(pg_temp.gid('requested'), true)$$, '42501', 'not allowed', 'no company context, no answer');
reset role;

-- the owner of company A sees it, declines first, then a new request is approved
select pg_temp.member_claims('f5000000-0000-0000-0000-000000000002', (select a from ctx), (select a_owner_m from ctx));
set local role authenticated;
select is((select status from public.my_support_grants() where status = 'requested' limit 1), 'requested', 'owner sees the open request');
select is((select hours from public.my_support_grants() where status = 'requested' limit 1), 4, 'owner sees the requested hours');
select lives_ok($$select public.respond_support_access(pg_temp.gid('requested'), false)$$, 'owner declines');
select is((select status from public.my_support_grants() where status = 'declined' limit 1), 'declined', 'it shows as declined');
select throws_ok($$select public.respond_support_access(pg_temp.gid('declined'), true)$$, 'P0001', null, 'a declined request cannot be approved afterwards');
reset role;

select pg_temp.claims('f5000000-0000-0000-0000-000000000001');
set local role authenticated;
select lives_ok($$select public.platform_request_support_access((select a from ctx), 'one more look at branches', 2)$$, 'a new request is allowed after a decline');
reset role;
select pg_temp.member_claims('f5000000-0000-0000-0000-000000000002', (select a from ctx), (select a_owner_m from ctx));
set local role authenticated;
select lives_ok($$select public.respond_support_access(pg_temp.gid('requested'), true)$$, 'owner approves');
select is((select status from public.my_support_grants() where status = 'approved' limit 1), 'approved', 'it shows as approved');
select ok((select expires_at between now() + interval '119 minutes' and now() + interval '121 minutes' from public.my_support_grants() where status = 'approved' limit 1), 'access lasts the requested 2 hours');
select throws_ok($$select public.respond_support_access(pg_temp.gid('approved'), true)$$, 'P0001', null, 'approving twice is refused');
reset role;

-- both logs got entries; the company log carries no platform admin identity
select is((select count(*)::int from public.audit_log where company_id = (select a from ctx) and action like 'support_access.%'), 4, 'company audit: request, decline, request, approve');
select is((select count(*)::int from public.audit_log where company_id = (select a from ctx) and action like 'support_access.%' and actor_user_id is not null), 2, 'only the owner decisions record an actor');
select is((select count(*)::int from public.audit_log where company_id = (select b from ctx) and action like 'support_access.%'), 0, 'company B audit log is untouched');
select is((select count(*)::int from public.platform_log where action = 'support_access.request'), 2, 'platform log: two requests');
select is((select count(*)::int from public.platform_log where action in ('support_access.declined_by_owner', 'support_access.approved_by_owner')), 2, 'platform log: both owner decisions');

-- admin activity list
select pg_temp.claims('f5000000-0000-0000-0000-000000000001');
set local role authenticated;
select is((select status from public.platform_list_support_grants() where status = 'approved'), 'approved', 'admin sees the approved grant');
select cmp_ok((select count(*)::int from public.platform_list_log(50)), '>=', 4, 'admin reads the activity log');
select is((select count(*)::int from public.platform_list_log(2)), 2, 'the limit is honoured');
select ok((select max(id) from public.platform_list_log(50)) > (select min(id) from public.platform_list_log(50)), 'newest first range');
select is((select count(*)::int from public.platform_list_log(50, (select min(id) from public.platform_list_log(50)))), 0, 'paging before the oldest entry returns nothing');
select throws_ok($$select public.platform_cancel_support_request(pg_temp.gid('approved'))$$, 'P0001', null, 'an approved grant cannot be withdrawn, only ended');
select lives_ok($$select public.platform_end_support_access(pg_temp.gid('approved'))$$, 'admin ends access early');
select is((select status from public.platform_list_support_grants() where company_name = 'Support A' and status = 'ended'), 'ended', 'it shows as ended');
select throws_ok($$select public.platform_end_support_access(pg_temp.gid('ended'))$$, 'P0001', null, 'ending twice is refused');
reset role;

-- closed grants are final; nothing is deleted; only decision fields change
select throws_ok($$update public.support_grants set status = 'approved' where status = 'ended'$$, '42501', null, 'an ended grant cannot be reopened');
select throws_ok($$delete from public.support_grants$$, '42501', null, 'support grants cannot be deleted');

-- cancel path, owner end path, expiry
select pg_temp.claims('f5000000-0000-0000-0000-000000000001');
set local role authenticated;
select lives_ok($$select public.platform_request_support_access((select b from ctx), 'check the plan limits', 1)$$, 'request for company B');
select lives_ok($$select public.platform_cancel_support_request(pg_temp.gid('requested'))$$, 'admin withdraws it');
select lives_ok($$select public.platform_request_support_access((select b from ctx), 'check the plan limits again', 1)$$, 'request again after withdrawing');
reset role;
select pg_temp.member_claims('f5000000-0000-0000-0000-000000000003', (select b from ctx), (select b_owner_m from ctx));
set local role authenticated;
select lives_ok($$select public.respond_support_access(pg_temp.gid('requested'), true)$$, 'owner B approves');
select lives_ok($$select public.end_support_access(pg_temp.gid('approved'))$$, 'owner B ends it at any time');
select throws_ok($$select public.end_support_access(pg_temp.gidc((select b from ctx), 'ended'))$$, 'P0001', null, 'ending twice is refused');
reset role;
select is((select count(*)::int from public.platform_log where action = 'support_access.ended_by_owner'), 1, 'the owner ending is in the platform log');

-- expiry: an approved grant that ran out shows as expired and no longer blocks a new request
select pg_temp.claims('f5000000-0000-0000-0000-000000000001');
set local role authenticated;
select lives_ok($$select public.platform_request_support_access((select b from ctx), 'third look at company B', 1)$$, 'another request for B');
reset role;
select pg_temp.member_claims('f5000000-0000-0000-0000-000000000003', (select b from ctx), (select b_owner_m from ctx));
set local role authenticated;
select lives_ok($$select public.respond_support_access(pg_temp.gid('requested'), true)$$, 'owner B approves again');
reset role;
update public.support_grants set expires_at = now() - interval '1 minute', decided_at = now() - interval '61 minutes' where id = pg_temp.gid('approved');
select pg_temp.member_claims('f5000000-0000-0000-0000-000000000003', (select b from ctx), (select b_owner_m from ctx));
set local role authenticated;
select is((select status from public.my_support_grants() where status = 'expired' limit 1), 'expired', 'a grant past its time shows as expired');
select throws_ok($$select public.end_support_access(pg_temp.gid('approved'))$$, 'P0001', null, 'an expired grant cannot be ended');
reset role;
select pg_temp.claims('f5000000-0000-0000-0000-000000000001');
set local role authenticated;
select lives_ok($$select public.platform_request_support_access((select b from ctx), 'fourth look at company B', 1)$$, 'an expired grant does not block a new request');
reset role;

-- a suspended account cannot be asked
update public.subscriptions set status = 'suspended' where owner_user_id = 'f5000000-0000-0000-0000-000000000002';
select pg_temp.claims('f5000000-0000-0000-0000-000000000001');
set local role authenticated;
select throws_ok($$select public.platform_request_support_access((select a from ctx), 'look while suspended', 1)$$, 'P0001', 'this account is suspended', 'no requests to a suspended account');
reset role;

select * from finish();
rollback;

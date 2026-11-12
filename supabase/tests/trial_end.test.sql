-- What happens when a trial ends. One transaction, rolled back.
-- Covers: the daily run suspends an ended trial; a suspended account is locked in the database for everyone in its
-- companies; the owner (not other members) can see the lock and ask for a plan; the admin can extend the trial or
-- assign a plan, which unlock it; other suspensions are not lifted; a trial still running is left alone.
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
create function pg_temp.pid(p_code text) returns uuid language sql security definer as $f$ select id from public.plans where code = p_code $f$;

insert into auth.users (id, aud, role, email) values
  ('f9000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'te-admin@test.local'),
  ('f9000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'te-owner@test.local'),
  ('f9000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'te-manager@test.local'),
  ('f9000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'te-owner2@test.local');
insert into public.profiles (user_id, full_name) values
  ('f9000000-0000-0000-0000-000000000001', 'Admin'), ('f9000000-0000-0000-0000-000000000002', 'Trial Owner'),
  ('f9000000-0000-0000-0000-000000000003', 'Manager'), ('f9000000-0000-0000-0000-000000000004', 'Other Owner');
insert into public.platform_admins (user_id) values ('f9000000-0000-0000-0000-000000000001');
select pg_temp.claims('f9000000-0000-0000-0000-000000000002'); set local role authenticated; select public.create_company('Trial Co', null, 'KH', 'KHR', 'Main'); reset role;
select pg_temp.claims('f9000000-0000-0000-0000-000000000004'); set local role authenticated; select public.create_company('Other Co', null, 'KH', 'KHR', 'Main'); reset role;
create temp table ctx as
  select (select id from public.companies where name = 'Trial Co') as cid,
         (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Trial Co') as owner_m,
         (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Other Co') as other_m,
         (select id from public.companies where name = 'Other Co') as other_cid;
grant select on ctx to authenticated;
insert into public.memberships (company_id, user_id, display_name) select cid, 'f9000000-0000-0000-0000-000000000003', 'Manager' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select ctx.cid, (select id from public.memberships where user_id = 'f9000000-0000-0000-0000-000000000003'), (select id from public.roles where company_id = ctx.cid and name = 'Manager') from ctx;
create function pg_temp.mgr_m() returns uuid language sql security definer as $f$ select id from public.memberships where user_id = 'f9000000-0000-0000-0000-000000000003' $f$;

-- a trial that has not ended is left alone; both trials are running
select is((select (app.run_billing() ->> 'trials_ended')::int), 0, 'a running trial is not suspended');

-- the Trial Co trial ends
update public.subscriptions set trial_ends_at = now() - interval '1 hour' where owner_user_id = 'f9000000-0000-0000-0000-000000000002';
select is((select (app.run_billing() ->> 'trials_ended')::int), 1, 'the daily run ends one trial');
select is((select status || '/' || suspended_reason from public.subscriptions where owner_user_id = 'f9000000-0000-0000-0000-000000000002'), 'suspended/trial_ended', 'the account is suspended for the trial end');
select is((select status from public.subscriptions where owner_user_id = 'f9000000-0000-0000-0000-000000000004'), 'trial', 'another account on trial is untouched');
select ok((select count(*) = 1 from public.platform_log where action = 'subscription.trial_ended' and admin_user_id = '00000000-0000-0000-0000-000000000000'), 'the trial end is logged as System');
select is((select (app.run_billing() ->> 'trials_ended')::int), 0, 'it is suspended only once');

-- locked for everyone in the company, in the database
select pg_temp.member_claims('f9000000-0000-0000-0000-000000000002', (select cid from ctx), (select owner_m from ctx));
set local role authenticated;
select is((select count(*)::int from public.my_permissions()), 0, 'the owner has no permissions while locked');
select throws_ok($$select public.create_invitation((select id from public.roles where company_id = (select cid from ctx) and name = 'Manager'), null, 'x')$$, '42501', 'not allowed', 'the owner cannot invite while locked');
select is((select count(*)::int from public.branches), 0, 'branches cannot be read while locked');
select throws_ok($$select public.create_company('Third Co', null, 'KH', 'KHR', 'Main')$$, 'P0001', 'account suspended', 'a suspended account cannot open another company');
select is((select locked from public.my_account_lock()), true, 'the owner is told the account is locked');
select is((select reason from public.my_account_lock()), 'trial_ended', 'the reason is the trial end');
select is((select is_owner from public.my_account_lock()), true, 'and that they are the owner');
select is((select count(*)::int from public.list_available_plans()), 2, 'the owner can see the standard plans');
select throws_ok($$select public.request_plan(pg_temp.pid('lite'), 'week')$$, '22023', null, 'a bad cycle is refused');
select lives_ok($$select public.request_plan(pg_temp.pid('lite'), 'year')$$, 'the owner asks for Lite yearly');
select is((select requested_plan || '/' || requested_cycle from public.my_account_lock()), 'Lite/year', 'the request is shown to the owner');
reset role;

-- a manager sees the lock but cannot ask
select pg_temp.member_claims('f9000000-0000-0000-0000-000000000003', (select cid from ctx), pg_temp.mgr_m());
set local role authenticated;
select is((select locked from public.my_account_lock()), true, 'a manager is told the account is locked');
select is((select is_owner from public.my_account_lock()), false, 'and that they are not the owner');
select throws_ok($$select public.request_plan(pg_temp.pid('premium'), 'month')$$, '42501', 'not allowed', 'a manager cannot request a plan');
select is((select count(*)::int from public.branches), 0, 'a manager sees nothing while locked');
reset role;

-- another company is not affected
select pg_temp.member_claims('f9000000-0000-0000-0000-000000000004', (select other_cid from ctx), (select other_m from ctx));
set local role authenticated;
select is((select count(*)::int from public.branches), 1, 'the other company works as normal');
select is((select locked from public.my_account_lock()), false, 'and is not locked');
reset role;

-- admin: sees the request, extends the trial, which unlocks it
select pg_temp.claims('f9000000-0000-0000-0000-000000000002');
set local role authenticated;
select throws_ok($$select public.platform_extend_trial('f9000000-0000-0000-0000-000000000002', 7)$$, '42501', 'not allowed', 'an owner cannot extend their own trial');
reset role;
select pg_temp.claims('f9000000-0000-0000-0000-000000000001');
set local role authenticated;
select is((select public.platform_get_subscriber('f9000000-0000-0000-0000-000000000002') ->> 'requested_plan'), 'Lite', 'the admin sees the requested plan');
select throws_ok($$select public.platform_extend_trial('f9000000-0000-0000-0000-000000000002', 0)$$, '22023', null, 'extending by zero days is refused');
select throws_ok($$select public.platform_extend_trial('f9000000-0000-0000-0000-000000000002', 61)$$, '22023', null, 'extending by 61 days is refused');
select lives_ok($$select public.platform_extend_trial('f9000000-0000-0000-0000-000000000002', 14)$$, 'admin extends the trial by 14 days');
reset role;
select is((select status from public.subscriptions where owner_user_id = 'f9000000-0000-0000-0000-000000000002'), 'trial', 'the account is back on trial');
select ok((select trial_ends_at > now() + interval '13 days' from public.subscriptions where owner_user_id = 'f9000000-0000-0000-0000-000000000002'), 'the new end date is counted from today');
select pg_temp.member_claims('f9000000-0000-0000-0000-000000000002', (select cid from ctx), (select owner_m from ctx));
set local role authenticated;
select is((select count(*)::int from public.branches), 1, 'the company works again');
reset role;

-- it ends again, then the admin assigns a plan instead
update public.subscriptions set trial_ends_at = now() - interval '1 hour' where owner_user_id = 'f9000000-0000-0000-0000-000000000002';
select is((select (app.run_billing() ->> 'trials_ended')::int), 1, 'the extended trial ends too');
select pg_temp.claims('f9000000-0000-0000-0000-000000000001');
set local role authenticated;
select lives_ok($$select public.platform_assign_plan('f9000000-0000-0000-0000-000000000002', pg_temp.pid('lite'), 'year')$$, 'admin assigns Lite yearly');
select throws_ok($$select public.platform_extend_trial('f9000000-0000-0000-0000-000000000002', 7)$$, 'P0001', 'only a trial can be extended', 'a paying account cannot get a trial extension');
reset role;
select is((select status from public.subscriptions where owner_user_id = 'f9000000-0000-0000-0000-000000000002'), 'active', 'the account is active');
select ok((select requested_plan_id is null and suspended_reason is null and trial_ends_at is null from public.subscriptions where owner_user_id = 'f9000000-0000-0000-0000-000000000002'), 'the request, reason and trial date are cleared');
select pg_temp.member_claims('f9000000-0000-0000-0000-000000000002', (select cid from ctx), (select owner_m from ctx));
set local role authenticated;
select is((select count(*)::int from public.branches), 1, 'the company is unlocked');
select is((select locked from public.my_account_lock()), false, 'the lock message is gone');
reset role;
select is((select (app.run_billing() ->> 'issued')::int), 1, 'the first invoice goes out at the next run');

-- a suspension for another reason is not lifted by assigning a plan
update public.subscriptions set status = 'suspended', suspended_reason = null where owner_user_id = 'f9000000-0000-0000-0000-000000000004';
select pg_temp.claims('f9000000-0000-0000-0000-000000000001');
set local role authenticated;
select lives_ok($$select public.platform_assign_plan('f9000000-0000-0000-0000-000000000004', pg_temp.pid('premium'), 'month')$$, 'admin changes the plan of a suspended account');
select throws_ok($$select public.platform_extend_trial('f9000000-0000-0000-0000-000000000004', 7)$$, 'P0001', 'only a trial can be extended', 'a manual suspension cannot be lifted by extending a trial');
reset role;
select is((select status from public.subscriptions where owner_user_id = 'f9000000-0000-0000-0000-000000000004'), 'suspended', 'it stays suspended');

select * from finish();
rollback;

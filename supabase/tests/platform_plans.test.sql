-- Platform plans, subscriptions and the platform log. One transaction, rolled back.
-- Covers: only platform admins can call platform_* functions; the tables stay closed; platform admins see no
-- company business data; the platform log is append-only; plan rules; the trial starts for new owners.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create function pg_temp.claims(p_uid uuid) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'app_metadata', json_build_object())::text, true)
$f$;

create function pg_temp.pid(p_key text) returns uuid language sql security definer as $f$
  select id from public.plans where code = p_key or name = p_key
$f$;

insert into auth.users (id, aud, role, email) values
  ('f3000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'pp-admin@test.local'),
  ('f3000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'pp-owner1@test.local'),
  ('f3000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'pp-owner2@test.local');
insert into public.profiles (user_id, full_name) values
  ('f3000000-0000-0000-0000-000000000001', 'Platform Admin'), ('f3000000-0000-0000-0000-000000000002', 'Owner One'), ('f3000000-0000-0000-0000-000000000003', 'Owner Two');
insert into public.platform_admins (user_id) values ('f3000000-0000-0000-0000-000000000001');

-- two owners each make a company; the second also adds branches and invitations to push usage
select pg_temp.claims('f3000000-0000-0000-0000-000000000002');
set local role authenticated;
select public.create_company('Plan One', null, 'KH', 'KHR', 'Main');
reset role;
select pg_temp.claims('f3000000-0000-0000-0000-000000000003');
set local role authenticated;
select public.create_company('Plan Two', null, 'KH', 'KHR', 'Main');
reset role;

select is((select status from public.subscriptions where owner_user_id = 'f3000000-0000-0000-0000-000000000002'), 'trial', 'a new owner starts on a trial');
select is((select pl.code from public.subscriptions s join public.plans pl on pl.id = s.plan_id where s.owner_user_id = 'f3000000-0000-0000-0000-000000000002'), 'premium', 'the trial runs on Premium');
select is((select count(*)::int from public.subscriptions where owner_user_id in ('f3000000-0000-0000-0000-000000000002', 'f3000000-0000-0000-0000-000000000003')), 2, 'one subscription per owner');
select is((select count(*)::int from public.plans where code in ('lite', 'premium')), 2, 'Lite and Premium exist');

-- ordinary owner: every platform function refused, tables closed
select pg_temp.claims('f3000000-0000-0000-0000-000000000002');
set local role authenticated;
select throws_ok($$select * from public.platform_list_plans()$$, '42501', 'not allowed', 'owner cannot list plans through the platform function');
select throws_ok($$select * from public.platform_list_subscribers()$$, '42501', 'not allowed', 'owner cannot list subscribers');
select throws_ok($$select public.platform_get_subscriber('f3000000-0000-0000-0000-000000000003')$$, '42501', 'not allowed', 'owner cannot open a subscriber');
select throws_ok($$select public.platform_assign_plan('f3000000-0000-0000-0000-000000000002', pg_temp.pid('lite'), 'month')$$, '42501', 'not allowed', 'owner cannot move themselves to another plan');
select throws_ok($$select public.platform_save_plan(null, 'Mine', null, 1, 1, 1, 1, '{}')$$, '42501', 'not allowed', 'owner cannot create a package');
select throws_ok($$select public.platform_archive_plan(pg_temp.pid('lite'))$$, '42501', 'not allowed', 'owner cannot archive a plan');
select throws_ok($$select * from public.plans$$, '42501', null, 'plans table is closed to the API');
select throws_ok($$select * from public.subscriptions$$, '42501', null, 'subscriptions table is closed to the API');
select throws_ok($$select * from public.platform_log$$, '42501', null, 'platform log is closed to the API');
select throws_ok($$update public.subscriptions set status = 'active'$$, '42501', null, 'owner cannot edit a subscription directly');
reset role;

-- signed-out callers
set local role anon;
select throws_ok($$select * from public.platform_list_plans()$$, '42501', null, 'signed-out callers cannot call platform functions');
reset role;

-- platform admin
select pg_temp.claims('f3000000-0000-0000-0000-000000000001');
set local role authenticated;
select is((select count(*)::int from public.platform_list_plans() where code in ('lite', 'premium')), 2, 'admin lists plans');
select is((select max_users from public.platform_list_plans() where code = 'lite'), 5, 'Lite allows 5 users');
select is((select price_year_cents from public.platform_list_plans() where code = 'premium'), 6800, 'Premium costs 68 a year');
select is((select count(*)::int from public.platform_list_subscribers() where owner_user_id in ('f3000000-0000-0000-0000-000000000002', 'f3000000-0000-0000-0000-000000000003')), 2, 'admin lists both subscribers');
select is((select companies from public.platform_list_subscribers() where owner_user_id = 'f3000000-0000-0000-0000-000000000002'), 1, 'subscriber shows a company count');
select is((select users_active from public.platform_list_subscribers() where owner_user_id = 'f3000000-0000-0000-0000-000000000002'), 1, 'subscriber shows a user count');
-- the admin is not a member of any company: company business tables show nothing
select is((select count(*)::int from public.companies), 0, 'platform admin sees no company rows');
select is((select count(*)::int from public.memberships), 0, 'platform admin sees no team rows');
select is((select count(*)::int from public.branches), 0, 'platform admin sees no branch rows');
select is((select count(*)::int from public.invitations), 0, 'platform admin sees no invitation rows');
select is((select count(*)::int from public.audit_log), 0, 'platform admin cannot read a company audit log');
-- what the detail function returns: account facts only
select is((select array_agg(k order by k) from jsonb_object_keys(public.platform_get_subscriber('f3000000-0000-0000-0000-000000000002')) k),
  array['billing_email', 'companies', 'cycle', 'next_invoice_at', 'owner_email', 'owner_name', 'owner_user_id', 'plan_id', 'plan_name', 'requested_at', 'requested_cycle', 'requested_plan', 'requested_plan_id', 'started_at', 'status', 'suspended_reason', 'trial_ends_at', 'usage'],
  'subscriber detail has account facts only');
select is((select array_agg(k order by k) from jsonb_object_keys((public.platform_get_subscriber('f3000000-0000-0000-0000-000000000002') -> 'companies') -> 0) k),
  array['country_code', 'created_at', 'id', 'name', 'name_local'], 'company entries have id, name, country and date only');

-- plans: create, validate, edit, archive
select lives_ok($$select public.platform_save_plan(null, 'Harvest Co', null, 24000, 2, null, 40, array['attendance', 'inventory'])$$, 'admin creates a custom package');
select is((select kind from public.platform_list_plans() where name = 'Harvest Co'), 'custom', 'it is custom');
select is((select max_branches from public.platform_list_plans() where name = 'Harvest Co'), null, 'custom packages have no branch limit unless set');
select throws_ok($$select public.platform_save_plan(null, 'Bad', null, -1, 1, null, 5, '{}')$$, '23514', null, 'a negative price is refused');
select throws_ok($$select public.platform_save_plan(null, 'Bad', null, 100, 0, null, 5, '{}')$$, '23514', null, 'zero companies is refused');
select throws_ok($$select public.platform_save_plan(null, 'Bad', null, 100, 1, null, 5, array['nonsense'])$$, '23514', null, 'an unknown module is refused');
select throws_ok($$select public.platform_save_plan(null, '   ', null, 100, 1, null, 5, '{}')$$, '23514', null, 'a blank name is refused');
select lives_ok($$select public.platform_save_plan(pg_temp.pid('Harvest Co'), 'Harvest Co', null, 26000, 2, null, 45, array['attendance'])$$, 'admin edits a custom package');
select is((select price_year_cents from public.platform_list_plans() where name = 'Harvest Co'), 26000, 'the edit is saved');
select lives_ok($$select public.platform_save_plan(pg_temp.pid('lite'), 'Renamed', 600, 5900, 1, 3, 5, array['attendance'])$$, 'admin edits Lite prices');
select is((select name from public.platform_list_plans() where code = 'lite'), 'Lite', 'a standard plan keeps its name');
select is((select price_month_cents from public.platform_list_plans() where code = 'lite'), 600, 'standard price changed');
select throws_ok($$select public.platform_archive_plan(pg_temp.pid('lite'))$$, 'P0001', 'standard plans cannot be archived', 'standard plans cannot be archived');

-- assigning
select throws_ok($$select public.platform_assign_plan('f3000000-0000-0000-0000-000000000002', pg_temp.pid('Harvest Co'), 'month')$$, 'P0001', 'this package is billed yearly', 'a custom package cannot be billed monthly');
select lives_ok($$select public.platform_assign_plan('f3000000-0000-0000-0000-000000000002', pg_temp.pid('Harvest Co'), 'year')$$, 'admin assigns a custom package');
select is((select status from public.platform_list_subscribers() where owner_user_id = 'f3000000-0000-0000-0000-000000000002'), 'active', 'assigning ends the trial');
select is((select cycle from public.platform_list_subscribers() where owner_user_id = 'f3000000-0000-0000-0000-000000000002'), 'year', 'cycle follows the assignment');
select throws_ok($$select public.platform_archive_plan(pg_temp.pid('Harvest Co'))$$, 'P0001', 'package is in use', 'a package in use cannot be archived');
select throws_ok($$select public.platform_assign_plan('f3000000-0000-0000-0000-000000000002', pg_temp.pid('lite'), 'bogus')$$, '22023', null, 'a bad cycle is refused');
select throws_ok($$select public.platform_assign_plan('f3000000-0000-0000-0000-0000000000ff', pg_temp.pid('lite'), 'month')$$, 'P0002', null, 'unknown subscriber');
select lives_ok($$select public.platform_assign_plan('f3000000-0000-0000-0000-000000000002', pg_temp.pid('lite'), 'month')$$, 'back to Lite');
select lives_ok($$select public.platform_save_plan(null, 'Tiny', null, 1000, 1, 1, 1, '{}')$$, 'admin creates a tiny package');
-- the account has one user and a branch; a limit of one user is fine, so make usage exceed it with a second owner-side member below
reset role;
insert into public.memberships (company_id, user_id, display_name)
  select id, 'f3000000-0000-0000-0000-000000000003', 'Extra' from public.companies where name = 'Plan One';
select pg_temp.claims('f3000000-0000-0000-0000-000000000001');
set local role authenticated;
select throws_ok($$select public.platform_assign_plan('f3000000-0000-0000-0000-000000000002', pg_temp.pid('Tiny'), 'year')$$, 'P0001', 'over the limit: users', 'an account over the user limit cannot be moved down');
select lives_ok($$select public.platform_save_plan(null, 'Big', null, 9000, 5, 50, 500, array['attendance'])$$, 'admin creates a large package');
select lives_ok($$select public.platform_archive_plan(pg_temp.pid('Tiny'))$$, 'an unused custom package can be archived');
select is((select archived from public.platform_list_plans() where name = 'Tiny'), true, 'it shows as archived');
select throws_ok($$select public.platform_assign_plan('f3000000-0000-0000-0000-000000000003', pg_temp.pid('Tiny'), 'year')$$, 'P0002', 'plan not available', 'an archived package cannot be assigned');

-- the log: every change and every subscriber opened is recorded, and it cannot be edited
reset role;
select is((select count(*)::int from public.platform_log where action = 'subscriber.view' and subject_user_id = 'f3000000-0000-0000-0000-000000000002' and admin_user_id = 'f3000000-0000-0000-0000-000000000001'), 2, 'opening a subscriber is logged with the admin');
select ok((select count(*) from public.platform_log where action in ('package.create', 'package.update', 'plan.update', 'package.assign', 'plan.assign', 'package.archive')) >= 8, 'every change is in the platform log');
select throws_ok($$update public.platform_log set action = 'x'$$, '42501', 'the platform log cannot be changed', 'log rows cannot be edited, even by the database owner');
select throws_ok($$delete from public.platform_log$$, '42501', 'the platform log cannot be changed', 'log rows cannot be deleted');
select throws_ok($$truncate public.platform_log$$, '42501', 'the platform log cannot be changed', 'the log cannot be truncated');

-- the other owner still sees only their own company and nothing of the platform
select pg_temp.claims('f3000000-0000-0000-0000-000000000003');
set local role authenticated;
select throws_ok($$select * from public.platform_list_subscribers()$$, '42501', 'not allowed', 'a second owner cannot list subscribers either');
reset role;

select * from finish();
rollback;

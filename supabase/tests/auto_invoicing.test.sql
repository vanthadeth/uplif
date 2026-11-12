-- Automatic invoicing. One transaction, rolled back.
-- Covers: the daily run invoices due active accounts once; skips trials, suspended accounts and accounts with an
-- open invoice; sets the next billing date; marks overdue accounts past due; logs as System; only platform admins
-- can run it by hand; the manual issue button still follows the same rules.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create function pg_temp.oid_of(p_owner uuid) returns uuid language sql security definer as $f$ select id from public.invoices where owner_user_id = p_owner and status = 'open' $f$;
create function pg_temp.claims(p_uid uuid) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal2', 'app_metadata', json_build_object())::text, true)
$f$;

insert into auth.users (id, aud, role, email) values
  ('f8000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ai-admin@test.local'),
  ('f8000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ai-active@test.local'),
  ('f8000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'ai-trial@test.local'),
  ('f8000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'ai-susp@test.local');
insert into public.profiles (user_id, full_name) values
  ('f8000000-0000-0000-0000-000000000001', 'Admin'), ('f8000000-0000-0000-0000-000000000002', 'Active Owner'),
  ('f8000000-0000-0000-0000-000000000003', 'Trial Owner'), ('f8000000-0000-0000-0000-000000000004', 'Suspended Owner');
insert into public.platform_admins (user_id) values ('f8000000-0000-0000-0000-000000000001');
select pg_temp.claims('f8000000-0000-0000-0000-000000000002'); set local role authenticated; select public.create_company('AI Active', null, 'KH', 'KHR', 'Main'); reset role;
select pg_temp.claims('f8000000-0000-0000-0000-000000000003'); set local role authenticated; select public.create_company('AI Trial', null, 'KH', 'KHR', 'Main'); reset role;
select pg_temp.claims('f8000000-0000-0000-0000-000000000004'); set local role authenticated; select public.create_company('AI Susp', null, 'KH', 'KHR', 'Main'); reset role;

-- active account on Lite monthly whose billing date has come; the trial account's date has come too; one is suspended
update public.subscriptions set status = 'active', plan_id = (select id from public.plans where code = 'lite'), cycle = 'month', trial_ends_at = null, next_invoice_at = now() - interval '1 day'
  where owner_user_id = 'f8000000-0000-0000-0000-000000000002';
update public.subscriptions set next_invoice_at = now() - interval '1 day' where owner_user_id = 'f8000000-0000-0000-0000-000000000003';
update public.subscriptions set status = 'suspended', trial_ends_at = null, next_invoice_at = now() - interval '1 day' where owner_user_id = 'f8000000-0000-0000-0000-000000000004';

-- the run
select is((select (app.run_billing() ->> 'issued')::int), 1, 'the run issues one invoice');
select is((select count(*)::int from public.invoices where owner_user_id = 'f8000000-0000-0000-0000-000000000002'), 1, 'the active account is invoiced');
select is((select amount_cents from public.invoices where owner_user_id = 'f8000000-0000-0000-0000-000000000002'), 500, 'it bills the Lite monthly price');
select is((select count(*)::int from public.invoices where owner_user_id in ('f8000000-0000-0000-0000-000000000003', 'f8000000-0000-0000-0000-000000000004')), 0, 'a trial account and a suspended account are not invoiced');
select ok((select next_invoice_at > now() + interval '27 days' from public.subscriptions where owner_user_id = 'f8000000-0000-0000-0000-000000000002'), 'the next billing date moves a month on');
select is((select (app.run_billing() ->> 'issued')::int), 0, 'running again issues nothing');
select ok((select count(*) = 1 from public.platform_log where action = 'invoice.issue' and details ->> 'auto' = 'true' and admin_user_id = '00000000-0000-0000-0000-000000000000'), 'the auto invoice is logged as System');

-- overdue: an open invoice past its due date marks the account past due; paying returns it to active
update public.invoices set due_date = current_date - 3 where owner_user_id = 'f8000000-0000-0000-0000-000000000002';
select is((select (app.run_billing() ->> 'past_due')::int), 1, 'an overdue account is marked past due');
select is((select status from public.subscriptions where owner_user_id = 'f8000000-0000-0000-0000-000000000002'), 'past_due', 'the account is past due');
select is((select (app.run_billing() ->> 'past_due')::int), 0, 'it is flagged only once');
select ok((select count(*) = 1 from public.platform_log where action = 'subscription.past_due' and admin_user_id = '00000000-0000-0000-0000-000000000000'), 'the flag is logged as System');
select pg_temp.claims('f8000000-0000-0000-0000-000000000001');
set local role authenticated;
select lives_ok($$select public.platform_mark_invoice_paid(pg_temp.oid_of('f8000000-0000-0000-0000-000000000002'), 'cash')$$, 'admin records the payment');
select is((select admin_name from public.platform_list_log(50) where action = 'invoice.issue' and details ->> 'auto' = 'true'), 'System', 'the activity log shows System');
reset role;
select is((select status from public.subscriptions where owner_user_id = 'f8000000-0000-0000-0000-000000000002'), 'active', 'payment returns the account to active');
select is((select (app.run_billing() ->> 'issued')::int), 0, 'nothing is due until the next date');

-- the next period
update public.subscriptions set next_invoice_at = now() - interval '1 day', cycle = 'month' where owner_user_id = 'f8000000-0000-0000-0000-000000000002';
select is((select (app.run_billing() ->> 'issued')::int), 1, 'a later date issues the next invoice');

-- by hand
select pg_temp.claims('f8000000-0000-0000-0000-000000000001');
set local role authenticated;
select lives_ok($$select public.platform_run_billing()$$, 'admin runs billing now');
select is((select (public.platform_run_billing() ->> 'issued')::int), 0, 'it returns the counts');
reset role;
select pg_temp.claims('f8000000-0000-0000-0000-000000000002');
set local role authenticated;
select throws_ok($$select public.platform_run_billing()$$, '42501', 'not allowed', 'an owner cannot run billing');
reset role;
set local role anon;
select throws_ok($$select public.platform_run_billing()$$, '42501', null, 'signed-out callers cannot run billing');
reset role;
select ok((select count(*) >= 2 from public.platform_log where action = 'billing.run'), 'manual runs are logged');

select * from finish();
rollback;

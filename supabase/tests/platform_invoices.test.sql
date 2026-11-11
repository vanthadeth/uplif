-- Platform invoices. One transaction, rolled back.
-- Covers: only platform admins can call the invoice functions; the table stays closed; issuing, paying and
-- voiding rules; paid and void invoices are final; a past-due account recovers on payment; actions are logged.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create function pg_temp.claims(p_uid uuid) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'app_metadata', json_build_object())::text, true)
$f$;
create function pg_temp.iid(p_number text) returns uuid language sql security definer as $f$
  select id from public.invoices where number = p_number
$f$;
create function pg_temp.pid(p_key text) returns uuid language sql security definer as $f$
  select id from public.plans where code = p_key
$f$;

insert into auth.users (id, aud, role, email) values
  ('f4000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'inv-admin@test.local'),
  ('f4000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'inv-owner1@test.local'),
  ('f4000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'inv-owner2@test.local');
insert into public.profiles (user_id, full_name) values
  ('f4000000-0000-0000-0000-000000000001', 'Admin'), ('f4000000-0000-0000-0000-000000000002', 'Owner One'), ('f4000000-0000-0000-0000-000000000003', 'Owner Two');
insert into public.platform_admins (user_id) values ('f4000000-0000-0000-0000-000000000001');

select pg_temp.claims('f4000000-0000-0000-0000-000000000002');
set local role authenticated;
select public.create_company('Inv One', null, 'KH', 'KHR', 'Main');
reset role;
select pg_temp.claims('f4000000-0000-0000-0000-000000000003');
set local role authenticated;
select public.create_company('Inv Two', null, 'KH', 'KHR', 'Main');
reset role;

-- an owner cannot use any invoice function, and the table is closed
select pg_temp.claims('f4000000-0000-0000-0000-000000000002');
set local role authenticated;
select throws_ok($$select * from public.platform_list_invoices()$$, '42501', 'not allowed', 'owner cannot list invoices');
select throws_ok($$select public.platform_issue_invoice('f4000000-0000-0000-0000-000000000002', 7)$$, '42501', 'not allowed', 'owner cannot issue an invoice');
select throws_ok($$select public.platform_mark_invoice_paid(gen_random_uuid(), 'cash')$$, '42501', 'not allowed', 'owner cannot mark an invoice paid');
select throws_ok($$select public.platform_void_invoice(gen_random_uuid())$$, '42501', 'not allowed', 'owner cannot void an invoice');
select throws_ok($$select * from public.invoices$$, '42501', null, 'invoices table is closed to the API');
select throws_ok($$insert into public.invoices (number) values ('x')$$, '42501', null, 'owner cannot insert an invoice directly');
reset role;
set local role anon;
select throws_ok($$select * from public.platform_list_invoices()$$, '42501', null, 'signed-out callers cannot list invoices');
reset role;

-- platform admin
select pg_temp.claims('f4000000-0000-0000-0000-000000000001');
set local role authenticated;
select is((select count(*)::int from public.platform_list_invoices()), 0, 'no invoices to begin with');
select throws_ok($$select public.platform_issue_invoice('f4000000-0000-0000-0000-000000000009', 7)$$, 'P0002', 'subscriber not found', 'cannot invoice an unknown account');
select throws_ok($$select public.platform_issue_invoice('f4000000-0000-0000-0000-000000000002', 200)$$, '22023', null, 'due days are limited');
select lives_ok($$select public.platform_assign_plan('f4000000-0000-0000-0000-000000000002', pg_temp.pid('lite'), 'month')$$, 'owner one moves to Lite monthly');
select lives_ok($$select public.platform_issue_invoice('f4000000-0000-0000-0000-000000000002', 7)$$, 'admin issues an invoice');
select is((select amount_cents from public.platform_list_invoices() where owner_user_id = 'f4000000-0000-0000-0000-000000000002'), 500, 'the invoice bills the Lite monthly price');
select is((select status from public.platform_list_invoices() where owner_user_id = 'f4000000-0000-0000-0000-000000000002'), 'open', 'a new invoice is open');
select ok((select number ~ '^UP-[0-9]{4}-[0-9]{4}$' from public.platform_list_invoices() where owner_user_id = 'f4000000-0000-0000-0000-000000000002'), 'the number looks like UP-2026-0001');
select throws_ok($$select public.platform_issue_invoice('f4000000-0000-0000-0000-000000000002', 7)$$, 'P0001', 'settle or void the open invoice first', 'only one open invoice per account');
select throws_ok($$select public.platform_mark_invoice_paid(pg_temp.iid((select number from public.platform_list_invoices() limit 1)), 'cheque')$$, '22023', null, 'unknown payment method refused');
select throws_ok($$select public.platform_mark_invoice_paid(pg_temp.iid((select number from public.platform_list_invoices() limit 1)), 'cash', null, current_date + 1)$$, '22023', null, 'payment date cannot be in the future');
select lives_ok($$select public.platform_mark_invoice_paid(pg_temp.iid((select number from public.platform_list_invoices() limit 1)), 'khqr', '  REF-1  ')$$, 'admin marks it paid');
select is((select status || '/' || payment_method || '/' || payment_ref from public.platform_list_invoices() limit 1), 'paid/khqr/REF-1', 'payment recorded with a trimmed reference');
select throws_ok($$select public.platform_mark_invoice_paid(pg_temp.iid((select number from public.platform_list_invoices() limit 1)), 'cash')$$, 'P0001', null, 'a paid invoice cannot be paid again');
select throws_ok($$select public.platform_void_invoice(pg_temp.iid((select number from public.platform_list_invoices() limit 1)))$$, 'P0001', null, 'a paid invoice cannot be voided');
reset role;

-- paid and void invoices are final, even for the table owner; nothing can be deleted
select throws_ok($$update public.invoices set amount_cents = 1$$, '42501', null, 'a paid invoice cannot be edited');
select throws_ok($$delete from public.invoices$$, '42501', null, 'invoices cannot be deleted');

-- void path, overdue and recovery
select pg_temp.claims('f4000000-0000-0000-0000-000000000001');
set local role authenticated;
select lives_ok($$select public.platform_issue_invoice('f4000000-0000-0000-0000-000000000002', 7)$$, 'a new invoice can follow a settled one');
select lives_ok($$select public.platform_void_invoice(pg_temp.iid((select number from public.platform_list_invoices() where status = 'open' limit 1)))$$, 'admin voids an open invoice');
select is((select count(*)::int from public.platform_list_invoices() where status = 'void'), 1, 'the voided invoice shows as void');
select lives_ok($$select public.platform_issue_invoice('f4000000-0000-0000-0000-000000000003', 0)$$, 'owner two is invoiced, due today');
reset role;
update public.invoices set due_date = current_date - 6 where owner_user_id = 'f4000000-0000-0000-0000-000000000003';
update public.subscriptions set status = 'past_due' where owner_user_id = 'f4000000-0000-0000-0000-000000000003';
select pg_temp.claims('f4000000-0000-0000-0000-000000000001');
set local role authenticated;
select is((select status from public.platform_list_invoices() where owner_user_id = 'f4000000-0000-0000-0000-000000000003'), 'overdue', 'an open invoice past its due date shows as overdue');
select lives_ok($$select public.platform_mark_invoice_paid(pg_temp.iid((select number from public.platform_list_invoices() where owner_user_id = 'f4000000-0000-0000-0000-000000000003')), 'bank_transfer')$$, 'the overdue invoice is paid');
reset role;
select is((select status from public.subscriptions where owner_user_id = 'f4000000-0000-0000-0000-000000000003'), 'active', 'a past-due account returns to active once nothing is overdue');

-- suspended accounts are not invoiced
update public.subscriptions set status = 'suspended' where owner_user_id = 'f4000000-0000-0000-0000-000000000003';
select pg_temp.claims('f4000000-0000-0000-0000-000000000001');
set local role authenticated;
select throws_ok($$select public.platform_issue_invoice('f4000000-0000-0000-0000-000000000003', 7)$$, 'P0001', 'this account is suspended', 'a suspended account is not invoiced');
reset role;

-- every action is logged, and the log carries no company data
select is((select count(*)::int from public.platform_log where action = 'invoice.issue'), 3, 'three invoices issued, three log entries');
select is((select count(*)::int from public.platform_log where action = 'invoice.paid'), 2, 'two payments logged');
select is((select count(*)::int from public.platform_log where action = 'invoice.void'), 1, 'one void logged');
select is((select count(*)::int from public.platform_log where action like 'invoice.%' and details::text ~* '(Inv One|Inv Two|branch|customer)'), 0, 'log entries hold no company data');

select * from finish();
rollback;

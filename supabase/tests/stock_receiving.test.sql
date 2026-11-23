-- Stock receiving tests: ledger, balances, append-only, permission, idempotency, isolation. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('eeeeeeee-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'rcv-1@test.local'),
  ('eeeeeeee-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'rcv-2@test.local');
insert into public.profiles (user_id, full_name) values
  ('eeeeeeee-0000-0000-0000-0000000000e1', 'One'), ('eeeeeeee-0000-0000-0000-0000000000e2', 'Two');

select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000e1', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Rcv Co', null, 'KH', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000e1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Rcv Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Rcv Co')))::text, true);
set local role authenticated;


select is((select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.name in ('Owner', 'Admin', 'Manager', 'Warehouse') and rp.permission_key = 'stock.movement.create'), 4, 'owner, admin, manager and warehouse may move stock');
select is((select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.name in ('Sales rep', 'Accountant') and rp.permission_key = 'stock.movement.create'), 0, 'sales rep and accountant may not');
insert into public.locations (company_id, name) values ((select id from public.companies), 'Main store'), ((select id from public.companies), 'Closed store');
update public.locations set is_active = false where name = 'Closed store';
insert into public.suppliers (company_id, name) values ((select id from public.companies), 'Acme');
insert into public.items (company_id, name, currency_code) values ((select id from public.companies), 'Beer', 'USD'), ((select id from public.companies), 'Delivery', 'USD');
update public.items set kind = 'service' where name = 'Delivery';
select set_config('t.loc', (select id::text from public.locations where name = 'Main store'), true);
select set_config('t.closed', (select id::text from public.locations where name = 'Closed store'), true);
select set_config('t.sup', (select id::text from public.suppliers), true);
select set_config('t.v', (select v.id::text from public.item_variants v join public.items i on i.id = v.item_id where i.name = 'Beer'), true);
select set_config('t.svc', (select v.id::text from public.item_variants v join public.items i on i.id = v.item_id where i.name = 'Delivery'), true);

select lives_ok($$select public.receive_stock('11111111-1111-1111-1111-111111111111', current_setting('t.loc')::uuid, current_setting('t.sup')::uuid, 'INV-1', 'first', jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'qty', 24)))$$, 'owner receives stock');
select is((select qty from public.stock_balances), 24.000, 'balance is 24');
select lives_ok($$select public.receive_stock('22222222-2222-2222-2222-222222222222', current_setting('t.loc')::uuid, null, null, null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'qty', 6.5)))$$, 'second receipt without supplier');
select is((select qty from public.stock_balances), 30.500, 'balance adds up');
select lives_ok($$select public.receive_stock('22222222-2222-2222-2222-222222222222', current_setting('t.loc')::uuid, null, null, null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'qty', 6.5)))$$, 'same request again is accepted');
select is((select qty from public.stock_balances), 30.500, 'but nothing is received twice');
select is((select count(*)::int from public.stock_movements), 2, 'two movements');
select is((select count(*)::int from public.stock_ledger), 2, 'two ledger lines');

select throws_ok($$select public.receive_stock(gen_random_uuid(), current_setting('t.closed')::uuid, null, null, null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'qty', 1)))$$, 'P0001', 'location_invalid', 'a closed location is refused');
select throws_ok($$select public.receive_stock(gen_random_uuid(), current_setting('t.loc')::uuid, null, null, null, '[]')$$, 'P0001', 'no_lines', 'needs at least one line');
select throws_ok($$select public.receive_stock(gen_random_uuid(), current_setting('t.loc')::uuid, null, null, null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'qty', 0)))$$, 'P0001', 'line_invalid', 'zero quantity refused');
select throws_ok($$select public.receive_stock(gen_random_uuid(), current_setting('t.loc')::uuid, null, null, null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'qty', -3)))$$, 'P0001', 'line_invalid', 'negative quantity refused');
select throws_ok($$select public.receive_stock(gen_random_uuid(), current_setting('t.loc')::uuid, null, null, null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.svc'), 'qty', 1)))$$, 'P0001', 'line_invalid', 'a service cannot be received');
select throws_ok($$select public.receive_stock(gen_random_uuid(), current_setting('t.loc')::uuid, null, null, null, jsonb_build_array(jsonb_build_object('variant_id', gen_random_uuid(), 'qty', 1)))$$, 'P0001', 'line_invalid', 'unknown variant refused');
select is((select count(*)::int from public.stock_movements), 2, 'failed receipts leave nothing behind');

select throws_ok($$insert into public.stock_ledger (company_id, movement_id, location_id, variant_id, qty_delta) select company_id, movement_id, location_id, variant_id, 5 from public.stock_ledger limit 1$$, '42501', null, 'no direct ledger insert');
select throws_ok($$update public.stock_balances set qty = 999$$, '42501', null, 'no direct balance change');
select throws_ok($$delete from public.stock_movements$$, '42501', null, 'no direct movement delete');

-- a used location, supplier-less history: items and locations in use cannot be deleted
select throws_ok($$delete from public.locations where name = 'Main store'$$, '23503', null, 'a location with stock history cannot be deleted');
select throws_ok($$delete from public.items where name = 'Beer'$$, '23503', null, 'an item with stock history cannot be deleted');
select lives_ok($$delete from public.suppliers$$, 'a supplier can be deleted');
select is((select count(*)::int from public.stock_movements where supplier_id is null), 2, 'and receipts keep existing without it');
select is((select count(*)::int from public.audit_log where action = 'stock_movements.insert'), 2, 'receipts are audited');
reset role;
-- the ledger refuses changes even from a privileged session, except when the whole company goes
select throws_ok($$update public.stock_ledger set qty_delta = 1$$, '42501', null, 'ledger is append-only for everyone');
select set_config('request.jwt.claims', '', true);
update public.companies set deleted_at = now() - interval '31 days', purge_after = now() - interval '1 day', deleted_by = 'eeeeeeee-0000-0000-0000-0000000000e1' where name = 'Rcv Co';
select is(app.purge_deleted_companies(), 1, 'purging the company removes its stock history too');
select is((select count(*)::int from public.stock_ledger), 0, 'ledger rows went with the company');

select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000e2', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Other Rcv Co', null, 'KH', 'USD', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000e2', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Other Rcv Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Other Rcv Co')))::text, true);
set local role authenticated;
select is((select count(*)::int from public.stock_movements), 0, 'other company sees no movements');
select throws_ok($$select public.receive_stock(gen_random_uuid(), current_setting('t.loc')::uuid, null, null, null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'qty', 1)))$$, 'P0001', 'location_invalid', 'cannot receive into another company');
reset role;
select * from finish();
rollback;

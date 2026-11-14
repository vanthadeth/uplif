-- Stock transfer tests: send, in transit, receive (full and short), cancel, errors, permission, isolation.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('ffffffff-0000-0000-0000-0000000000f1', 'authenticated', 'authenticated', 'tr-1@test.local'),
  ('ffffffff-0000-0000-0000-0000000000f2', 'authenticated', 'authenticated', 'tr-2@test.local');
insert into public.profiles (user_id, full_name) values
  ('ffffffff-0000-0000-0000-0000000000f1', 'One'), ('ffffffff-0000-0000-0000-0000000000f2', 'Two');

select set_config('request.jwt.claims', json_build_object('sub', 'ffffffff-0000-0000-0000-0000000000f1', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Tr Co', null, 'KH', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'ffffffff-0000-0000-0000-0000000000f1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Tr Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Tr Co')))::text, true);
set local role authenticated;

insert into public.locations (company_id, name) values ((select id from public.companies), 'Warehouse'), ((select id from public.companies), 'Shop');
insert into public.items (company_id, name, currency_code) values ((select id from public.companies), 'Beer', 'USD'), ((select id from public.companies), 'Cola', 'USD');
select set_config('t.wh', (select id::text from public.locations where name = 'Warehouse'), true);
select set_config('t.sh', (select id::text from public.locations where name = 'Shop'), true);
select set_config('t.v', (select v.id::text from public.item_variants v join public.items i on i.id = v.item_id where i.name = 'Beer'), true);
select set_config('t.v2', (select v.id::text from public.item_variants v join public.items i on i.id = v.item_id where i.name = 'Cola'), true);
select public.receive_stock('11111111-1111-1111-1111-111111111111', current_setting('t.wh')::uuid, null, null, null,
  jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'qty', 50), jsonb_build_object('variant_id', current_setting('t.v2'), 'qty', 10)));

select lives_ok($$select public.send_transfer('b0000000-0000-0000-0000-000000000001', current_setting('t.wh')::uuid, current_setting('t.sh')::uuid, 'weekly', jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'qty', 20), jsonb_build_object('variant_id', current_setting('t.v2'), 'qty', 4)))$$, 'send a transfer');
select is((select qty from public.stock_balances where location_id = current_setting('t.wh')::uuid and variant_id = current_setting('t.v')::uuid), 30.000, 'stock leaves the sender at once');
select is((select count(*)::int from public.stock_balances where location_id = current_setting('t.sh')::uuid), 0, 'nothing has arrived yet');
select is((select status from public.stock_transfers), 'sent', 'the transfer is in transit');
select lives_ok($$select public.send_transfer('b0000000-0000-0000-0000-000000000001', current_setting('t.wh')::uuid, current_setting('t.sh')::uuid, 'weekly', jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'qty', 20)))$$, 'same request again is accepted');
select is((select count(*)::int from public.stock_transfers), 1, 'but sent only once');

select throws_ok($$select public.send_transfer(gen_random_uuid(), current_setting('t.wh')::uuid, current_setting('t.wh')::uuid, null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'qty', 1)))$$, 'P0001', 'same_location', 'same location refused');
select throws_ok($$select public.send_transfer(gen_random_uuid(), current_setting('t.wh')::uuid, current_setting('t.sh')::uuid, null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'qty', 31)))$$, 'P0001', 'insufficient_stock', 'cannot send more than you have');
select throws_ok($$select public.send_transfer(gen_random_uuid(), current_setting('t.wh')::uuid, current_setting('t.sh')::uuid, null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'qty', 1), jsonb_build_object('variant_id', current_setting('t.v'), 'qty', 1)))$$, 'P0001', 'line_invalid', 'the same variant twice refused');
select throws_ok($$select public.send_transfer(gen_random_uuid(), current_setting('t.wh')::uuid, current_setting('t.sh')::uuid, null, '[]')$$, 'P0001', 'no_lines', 'needs a line');
select is((select count(*)::int from public.stock_transfers), 1, 'failed sends leave nothing behind');
select is((select qty from public.stock_balances where location_id = current_setting('t.wh')::uuid and variant_id = current_setting('t.v')::uuid), 30.000, 'and no stock moved');

select set_config('t.tr', (select id::text from public.stock_transfers), true);
select throws_ok($$select public.receive_transfer(current_setting('t.tr')::uuid, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'received', 21)))$$, 'P0001', 'line_invalid', 'cannot receive more than was sent');
select lives_ok($$select public.receive_transfer(current_setting('t.tr')::uuid, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'received', 18)))$$, 'receive with a shortage of 2');
select is((select qty from public.stock_balances where location_id = current_setting('t.sh')::uuid and variant_id = current_setting('t.v')::uuid), 18.000, 'the shop gets what arrived');
select is((select qty from public.stock_balances where location_id = current_setting('t.sh')::uuid and variant_id = current_setting('t.v2')::uuid), 4.000, 'lines not mentioned arrive in full');
select is((select qty_received from public.stock_transfer_lines where variant_id = current_setting('t.v')::uuid), 18.000, 'the shortage is recorded on the line');
select is((select status from public.stock_transfers), 'received', 'the transfer is closed');
select throws_ok($$select public.receive_transfer(current_setting('t.tr')::uuid)$$, 'P0001', 'transfer_closed', 'cannot receive twice');
select throws_ok($$select public.cancel_transfer(current_setting('t.tr')::uuid)$$, 'P0001', 'transfer_closed', 'cannot cancel a received transfer');

select lives_ok($$select public.send_transfer('b0000000-0000-0000-0000-000000000002', current_setting('t.wh')::uuid, current_setting('t.sh')::uuid, null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'qty', 10)))$$, 'send another');
select is((select qty from public.stock_balances where location_id = current_setting('t.wh')::uuid and variant_id = current_setting('t.v')::uuid), 20.000, 'sender down by 10');
select lives_ok($$select public.cancel_transfer((select id from public.stock_transfers where request_id = 'b0000000-0000-0000-0000-000000000002'))$$, 'cancel it');
select is((select qty from public.stock_balances where location_id = current_setting('t.wh')::uuid and variant_id = current_setting('t.v')::uuid), 30.000, 'the stock goes back to the sender');
select throws_ok($$select public.receive_transfer((select id from public.stock_transfers where request_id = 'b0000000-0000-0000-0000-000000000002'))$$, 'P0001', 'transfer_closed', 'a cancelled transfer cannot be received');
select is((select sum(qty_delta) from public.stock_ledger where variant_id = current_setting('t.v')::uuid), 48.000, 'ledger total = 50 received minus the 2 short');

reset role;
set local session_replication_role = replica;
delete from public.role_permissions where permission_key = 'stock.movement.create';
set local session_replication_role = origin;
set local role authenticated;
select throws_ok($$select public.send_transfer(gen_random_uuid(), current_setting('t.wh')::uuid, current_setting('t.sh')::uuid, null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'qty', 1)))$$, '42501', null, 'without the permission nothing can be sent');
select throws_ok($$select public.receive_stock(gen_random_uuid(), current_setting('t.wh')::uuid, null, null, null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'qty', 1)))$$, '42501', null, 'without the permission nothing can be received either');
reset role;

-- another company sees none of it and cannot touch it
select set_config('request.jwt.claims', json_build_object('sub', 'ffffffff-0000-0000-0000-0000000000f2', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Other Co', null, 'KH', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'ffffffff-0000-0000-0000-0000000000f2', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Other Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Other Co')))::text, true);
set local role authenticated;
select is((select count(*)::int from public.stock_transfers), 0, 'another company sees no transfers');
select is((select count(*)::int from public.stock_transfer_lines), 0, 'or lines');
select throws_ok($$select public.cancel_transfer(current_setting('t.tr')::uuid)$$, 'P0001', 'transfer_not_found', 'and cannot cancel them');
reset role;

-- company purge still works
select set_config('request.jwt.claims', '', true);
update public.companies set deleted_at = now() - interval '31 days', purge_after = now() - interval '1 day', deleted_by = 'ffffffff-0000-0000-0000-0000000000f1' where name = 'Tr Co';
select is(app.purge_deleted_companies(), 1, 'a deleted company with transfers can be purged');
select is((select count(*)::int from public.stock_transfers), 0, 'transfers are gone with it');

select * from finish();
rollback;

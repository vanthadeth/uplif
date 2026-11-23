-- Stock adjustment tests: count differences, reasons, errors, idempotency, permission, isolation. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('eeeeeeee-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'adj-1@test.local'),
  ('eeeeeeee-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'adj-2@test.local');
insert into public.profiles (user_id, full_name) values
  ('eeeeeeee-0000-0000-0000-0000000000e1', 'One'), ('eeeeeeee-0000-0000-0000-0000000000e2', 'Two');

select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000e1', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Adj Co', null, 'KH', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000e1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Adj Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Adj Co')))::text, true);
set local role authenticated;


insert into public.locations (company_id, name) values ((select id from public.companies), 'Main store');
insert into public.items (company_id, name, currency_code) values ((select id from public.companies), 'Beer', 'USD'), ((select id from public.companies), 'Delivery', 'USD');
update public.items set kind = 'service' where name = 'Delivery';
select set_config('t.loc', (select id::text from public.locations), true);
select set_config('t.v', (select v.id::text from public.item_variants v join public.items i on i.id = v.item_id where i.name = 'Beer'), true);
select set_config('t.svc', (select v.id::text from public.item_variants v join public.items i on i.id = v.item_id where i.name = 'Delivery'), true);
select public.receive_stock('11111111-1111-1111-1111-111111111111', current_setting('t.loc')::uuid, null, null, null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'qty', 24)));

select lives_ok($$select public.adjust_stock('aaaaaaaa-0000-0000-0000-000000000001', current_setting('t.loc')::uuid, 'count', 'monthly count', jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'counted', 20)))$$, 'owner counts 20 where 24 were expected');
select is((select qty from public.stock_balances), 20.000, 'balance becomes 20');
select is((select qty_delta from public.stock_ledger where qty_delta < 0), -4.000, 'the ledger holds the difference');
select is((select reason from public.stock_movements where kind = 'adjust'), 'count', 'the reason is kept');
select lives_ok($$select public.adjust_stock('aaaaaaaa-0000-0000-0000-000000000002', current_setting('t.loc')::uuid, 'found', null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'counted', 22.5)))$$, 'counting more than expected');
select is((select qty from public.stock_balances), 22.500, 'balance goes up');
select lives_ok($$select public.adjust_stock('aaaaaaaa-0000-0000-0000-000000000002', current_setting('t.loc')::uuid, 'found', null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'counted', 22.5)))$$, 'the same request again is accepted');
select is((select count(*)::int from public.stock_movements where kind = 'adjust'), 2, 'but adjusted only once');
select lives_ok($$select public.adjust_stock('aaaaaaaa-0000-0000-0000-000000000003', current_setting('t.loc')::uuid, 'loss', null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'counted', 0)))$$, 'writing everything off');
select is((select qty from public.stock_balances), 0.000, 'balance is zero, never below');

select throws_ok($$select public.adjust_stock(gen_random_uuid(), current_setting('t.loc')::uuid, 'count', null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'counted', 0)))$$, 'P0001', 'no_change', 'nothing changed is refused');
select throws_ok($$select public.adjust_stock(gen_random_uuid(), current_setting('t.loc')::uuid, 'party', null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'counted', 1)))$$, 'P0001', 'reason_invalid', 'unknown reason refused');
select throws_ok($$select public.adjust_stock(gen_random_uuid(), current_setting('t.loc')::uuid, 'count', null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'counted', -1)))$$, 'P0001', 'line_invalid', 'negative count refused');
select throws_ok($$select public.adjust_stock(gen_random_uuid(), current_setting('t.loc')::uuid, 'count', null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'counted', 1), jsonb_build_object('variant_id', current_setting('t.v'), 'counted', 2)))$$, 'P0001', 'line_invalid', 'the same variant twice refused');
select throws_ok($$select public.adjust_stock(gen_random_uuid(), current_setting('t.loc')::uuid, 'count', null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.svc'), 'counted', 1)))$$, 'P0001', 'line_invalid', 'a service cannot be counted');
select throws_ok($$select public.adjust_stock(gen_random_uuid(), current_setting('t.loc')::uuid, 'count', null, '[]')$$, 'P0001', 'no_lines', 'needs a line');
select is((select count(*)::int from public.stock_movements where kind = 'adjust'), 3, 'failed adjustments leave nothing behind');

reset role;
set local session_replication_role = replica;
delete from public.role_permissions where permission_key = 'stock.movement.create';
set local session_replication_role = origin;
set local role authenticated;
select throws_ok($$select public.adjust_stock(gen_random_uuid(), current_setting('t.loc')::uuid, 'count', null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'counted', 5)))$$, '42501', null, 'without the permission nothing can be adjusted');
reset role;
select set_config('t.co', (select id::text from public.companies where name = 'Adj Co'), true);

select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000e2', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Other Adj Co', null, 'KH', 'USD', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000e2', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Other Adj Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Other Adj Co')))::text, true);
set local role authenticated;
select throws_ok($$select public.adjust_stock(gen_random_uuid(), current_setting('t.loc')::uuid, 'count', null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'counted', 5)))$$, 'P0001', 'location_invalid', 'cannot adjust another company');
reset role;
select * from finish();
rollback;

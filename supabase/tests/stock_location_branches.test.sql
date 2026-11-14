-- Locations linked to branches: who can see and move stock where. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('abababab-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'lb-1@test.local'),
  ('abababab-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'lb-2@test.local');
insert into public.profiles (user_id, full_name) values
  ('abababab-0000-0000-0000-0000000000a1', 'Owner'), ('abababab-0000-0000-0000-0000000000a2', 'Clerk');

select set_config('request.jwt.claims', json_build_object('sub', 'abababab-0000-0000-0000-0000000000a1', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Lb Co', null, 'KH', 'KHR', 'Branch A');
reset role;
select set_config('t.co', (select id::text from public.companies where name = 'Lb Co'), true);
insert into public.branches (company_id, name) values (current_setting('t.co')::uuid, 'Branch B');
select set_config('t.ba', (select id::text from public.branches where name = 'Branch A' and company_id = current_setting('t.co')::uuid), true);
select set_config('t.bb', (select id::text from public.branches where name = 'Branch B'), true);

-- the clerk: Warehouse role, assigned to Branch A only
insert into public.memberships (company_id, user_id, display_name) values (current_setting('t.co')::uuid, 'abababab-0000-0000-0000-0000000000a2', 'Clerk');
insert into public.membership_roles (company_id, membership_id, role_id, branch_id)
  select current_setting('t.co')::uuid, m.id, ro.id, current_setting('t.ba')::uuid
  from public.memberships m, public.roles ro where m.user_id = 'abababab-0000-0000-0000-0000000000a2' and ro.company_id = current_setting('t.co')::uuid and ro.name = 'Warehouse';
select set_config('t.m1', (select m.id::text from public.memberships m where m.user_id = 'abababab-0000-0000-0000-0000000000a1' and m.company_id = current_setting('t.co')::uuid), true);
select set_config('t.m2', (select m.id::text from public.memberships m where m.user_id = 'abababab-0000-0000-0000-0000000000a2'), true);

select set_config('request.jwt.claims', json_build_object('sub', 'abababab-0000-0000-0000-0000000000a1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', current_setting('t.co'), 'membership_id', current_setting('t.m1')))::text, true);
set local role authenticated;
insert into public.locations (company_id, name, branch_id) values
  (current_setting('t.co')::uuid, 'Shop A', current_setting('t.ba')::uuid),
  (current_setting('t.co')::uuid, 'Shop B', current_setting('t.bb')::uuid),
  (current_setting('t.co')::uuid, 'HQ warehouse', null);
insert into public.items (company_id, name, currency_code) values (current_setting('t.co')::uuid, 'Beer', 'USD');
select set_config('t.a', (select id::text from public.locations where name = 'Shop A'), true);
select set_config('t.b', (select id::text from public.locations where name = 'Shop B'), true);
select set_config('t.hq', (select id::text from public.locations where name = 'HQ warehouse'), true);
select set_config('t.v', (select v.id::text from public.item_variants v join public.items i on i.id = v.item_id where i.name = 'Beer'), true);
select is((select branch_id::text from public.locations where name = 'Shop A'), current_setting('t.ba'), 'a location can be linked to a branch');
select lives_ok($$select public.receive_stock(gen_random_uuid(), current_setting('t.a')::uuid, null, null, null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'qty', 10)))$$, 'owner receives at Shop A');
select lives_ok($$select public.receive_stock(gen_random_uuid(), current_setting('t.b')::uuid, null, null, null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'qty', 7)))$$, 'owner receives at Shop B');
select lives_ok($$select public.receive_stock(gen_random_uuid(), current_setting('t.hq')::uuid, null, null, null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'qty', 100)))$$, 'owner receives at HQ');
select is((select count(*)::int from public.stock_balances), 3, 'owner sees all three balances');
reset role;

-- the clerk of Branch A
select set_config('request.jwt.claims', json_build_object('sub', 'abababab-0000-0000-0000-0000000000a2', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', current_setting('t.co'), 'membership_id', current_setting('t.m2')))::text, true);
set local role authenticated;
select is((select count(*)::int from public.stock_balances), 2, 'the clerk sees their branch and the HQ warehouse, not Shop B');
select is((select count(*)::int from public.stock_balances where location_id = current_setting('t.b')::uuid), 0, 'Shop B stock is hidden');
select is((select count(*)::int from public.locations), 3, 'location names stay visible, so transfers can be addressed');
select is((select count(*)::int from public.stock_writable_locations()), 1, 'the clerk may move stock at one location');
select lives_ok($$select public.receive_stock(gen_random_uuid(), current_setting('t.a')::uuid, null, null, null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'qty', 5)))$$, 'the clerk receives at their own branch');
select throws_ok($$select public.receive_stock(gen_random_uuid(), current_setting('t.b')::uuid, null, null, null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'qty', 5)))$$, '42501', null, 'but not at another branch');
select throws_ok($$select public.receive_stock(gen_random_uuid(), current_setting('t.hq')::uuid, null, null, null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'qty', 5)))$$, '42501', null, 'nor at a company-level location');
select throws_ok($$select public.adjust_stock(gen_random_uuid(), current_setting('t.b')::uuid, 'loss', null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'counted', 0)))$$, '42501', null, 'cannot adjust another branch');
select lives_ok($$select public.send_transfer('c0000000-0000-0000-0000-000000000001', current_setting('t.a')::uuid, current_setting('t.b')::uuid, null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'qty', 3)))$$, 'the clerk sends from their branch to another');
select throws_ok($$select public.send_transfer(gen_random_uuid(), current_setting('t.b')::uuid, current_setting('t.a')::uuid, null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'qty', 1)))$$, '42501', null, 'but cannot send from another branch');
select is((select count(*)::int from public.stock_transfers), 1, 'the sender sees the transfer in transit');
select throws_ok($$select public.receive_transfer((select id from public.stock_transfers limit 1))$$, '42501', null, 'the sender cannot confirm arrival at the other branch');
select lives_ok($$select public.cancel_transfer((select id from public.stock_transfers limit 1))$$, 'the sender can cancel their own transfer');
reset role;

-- the owner turns on cross-branch visibility
update public.company_settings set cross_branch_stock_visibility = true where company_id = current_setting('t.co')::uuid;
set local role authenticated;
select is((select count(*)::int from public.stock_balances), 3, 'with cross-branch visibility on, the clerk sees every location');
select is((select count(*)::int from public.stock_writable_locations()), 1, 'but still moves stock only at their own branch');
reset role;

select * from finish();
rollback;

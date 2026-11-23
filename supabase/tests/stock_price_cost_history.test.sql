-- Price and cost history: changes are logged, cost log needs stock.cost.view, nobody writes by hand, isolation.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('eeeeeeee-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'hist-1@test.local'),
  ('eeeeeeee-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'hist-2@test.local');
insert into public.profiles (user_id, full_name) values
  ('eeeeeeee-0000-0000-0000-0000000000a1', 'Dara'), ('eeeeeeee-0000-0000-0000-0000000000a2', 'Two');
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000a1', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Hist Co', null, 'KH', 'USD', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000a1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Hist Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Hist Co')))::text, true);
set local role authenticated;

insert into public.items (company_id, name, currency_code, price) values ((select id from public.companies), 'Shirt', 'USD', 10);
select is((select count(*)::int from public.price_history), 0, 'creating an item logs nothing');
update public.items set price = 12;
update public.items set name = 'Shirt 2';
select is((select count(*)::int from public.price_history where variant_id is null), 1, 'an item price change is logged once');
select is((select old_price from public.price_history where variant_id is null), 10::numeric, 'old price kept');
select is((select new_price from public.price_history where variant_id is null), 12::numeric, 'new price kept');
select is((select changed_by_name from public.price_history where variant_id is null), 'Dara', 'who changed it is kept');

insert into public.item_variants (company_id, item_id, name, price) select company_id, id, 'Large', 15 from public.items;
update public.item_variants set price = 18 where name = 'Large';
update public.item_variants set price = null where name = 'Large';
select is((select count(*)::int from public.price_history where variant_name = 'Large'), 3, 'variant price: set, change and back to item price are logged');
select is((select new_price from public.price_history where variant_name = 'Large' and old_price = 18), null::numeric, 'going back to the item price logs a null');

select lives_ok($$insert into public.item_costs (item_id, company_id, cost) select id, company_id, 5 from public.items$$, 'item cost set');
update public.item_costs set cost = 6;
delete from public.item_costs;
select is((select count(*)::int from public.cost_history where variant_id is null), 3, 'item cost set, change and removal logged');
insert into public.variant_costs (variant_id, company_id, cost) select id, company_id, 4 from public.item_variants where name = 'Large';
update public.variant_costs set cost = 4.5;
select is((select count(*)::int from public.cost_history where variant_name = 'Large'), 2, 'variant cost changes logged');
update public.variant_costs set cost = 4.5;
select is((select count(*)::int from public.cost_history where variant_name = 'Large'), 2, 'an unchanged cost logs nothing');

select throws_ok($$insert into public.price_history (company_id, item_id, currency_code) select company_id, id, 'USD' from public.items$$, '42501', null, 'nobody inserts price history by hand');
select throws_ok($$insert into public.cost_history (company_id, item_id, currency_code) select company_id, id, 'USD' from public.items$$, '42501', null, 'nor cost history');
select throws_ok($$update public.price_history set new_price = 1$$, '42501', null, 'history cannot be edited');
select throws_ok($$delete from public.price_history$$, '42501', null, 'or deleted');

select lives_ok($$delete from public.item_variants where name = 'Large'$$, 'a variant with history can still be deleted');
select is((select count(*)::int from public.price_history where variant_name = 'Large'), 3, 'and its history stays');

reset role;
set local session_replication_role = replica;
delete from public.role_permissions where permission_key = 'stock.cost.view';
set local session_replication_role = origin;
set local role authenticated;
select is((select count(*)::int from public.cost_history), 0, 'without stock.cost.view the cost log is empty');
select ok((select count(*)::int from public.price_history) > 0, 'but the price log is still readable');
reset role;

select set_config('t.co', (select id::text from public.companies where name = 'Hist Co'), true);
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000a2', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Other Hist Co', null, 'KH', 'USD', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000a2', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Other Hist Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Other Hist Co')))::text, true);
set local role authenticated;
select is((select count(*)::int from public.price_history), 0, 'other company sees no price history');
select is((select count(*)::int from public.cost_history), 0, 'nor cost history');
reset role;
select * from finish();
rollback;

-- Stock piece 5 tests: items, links to category and brand, role access, isolation. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('eeeeeeee-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'item-1@test.local'),
  ('eeeeeeee-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'item-2@test.local');
insert into public.profiles (user_id, full_name) values
  ('eeeeeeee-0000-0000-0000-0000000000e1', 'One'), ('eeeeeeee-0000-0000-0000-0000000000e2', 'Two');

select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000e1', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Item Co', null, 'KH', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000e1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Item Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Item Co')))::text, true);
set local role authenticated;

insert into public.categories (company_id, name) values ((select id from public.companies), 'Drinks');
insert into public.brands (company_id, name) values ((select id from public.companies), 'Angkor');

select lives_ok($$insert into public.items (company_id, sku, name, name_local, category_id, brand_id, base_uom, packs, price, currency_code)
  values ((select id from public.companies), 'BEER-33', 'Angkor Beer 330ml', 'ស្រាបៀរអង្គរ',
  (select id from public.categories), (select id from public.brands), 'can', '[{"name":"Carton","qty":24}]', 1.25, 'USD')$$, 'owner adds an item');
select throws_ok($$insert into public.items (company_id, sku, name, currency_code) values ((select id from public.companies), ' beer-33 ', 'Other', 'USD')$$, '23505', null, 'same SKU in another case is refused');
select lives_ok($$insert into public.items (company_id, name, currency_code) values ((select id from public.companies), 'No SKU one', 'USD'), ((select id from public.companies), 'No SKU two', 'USD')$$, 'items without a SKU can repeat');
select throws_ok($$insert into public.items (company_id, name, currency_code) values ((select id from public.companies), '   ', 'USD')$$, '23514', null, 'blank name is refused');
select throws_ok($$insert into public.items (company_id, name, currency_code, price) values ((select id from public.companies), 'Neg', 'USD', -1)$$, '23514', null, 'negative price is refused');
select throws_ok($$insert into public.items (company_id, name, currency_code) values ((select id from public.companies), 'Bad cur', 'usd')$$, '23514', null, 'currency must be 3 capital letters');
select throws_ok($$insert into public.items (company_id, name, currency_code, packs) values ((select id from public.companies), 'Bad packs', 'USD', '{"a":1}')$$, '23514', null, 'packs must be a list');
select lives_ok($$update public.items set price = 1.5, is_active = false where sku = 'BEER-33'$$, 'owner edits and hides an item');
select is((select count(*)::int from public.audit_log where action = 'items.insert'), 3, 'inserts are audited');
select is((select count(*)::int from public.audit_log where action = 'items.update'), 1, 'update is audited');

select lives_ok($$delete from public.categories where name = 'Drinks'$$, 'a category in use can be deleted');
select is((select category_id from public.items where sku = 'BEER-33'), null, 'the item keeps existing with no category');
select is((select company_id is not null from public.items where sku = 'BEER-33'), true, 'and still belongs to its company');
select lives_ok($$delete from public.brands where name = 'Angkor'$$, 'a brand in use can be deleted');
select is((select brand_id from public.items where sku = 'BEER-33'), null, 'the item keeps existing with no brand');
select lives_ok($$delete from public.items where name = 'No SKU one'$$, 'owner deletes an item');
reset role;
select set_config('t.co', (select id::text from public.companies where name = 'Item Co'), true);
select set_config('t.cat', (select id::text from public.categories limit 1), true);

select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000e2', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Other Item Co', null, 'KH', 'USD', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000e2', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Other Item Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Other Item Co')))::text, true);
set local role authenticated;
select is((select count(*)::int from public.items), 0, 'other company sees no items');
select throws_ok($$insert into public.items (company_id, name, currency_code) values (current_setting('t.co')::uuid, 'Sneaky', 'USD')$$, '42501', null, 'cannot insert into another company');
insert into public.brands (company_id, name) values ((select id from public.companies), 'Mine');
update public.items set name = 'Hacked';
delete from public.items;
reset role;
select is((select count(*)::int from public.items where company_id = current_setting('t.co')::uuid and name = 'Hacked'), 0, 'other company cannot edit');
select is((select count(*)::int from public.items where company_id = current_setting('t.co')::uuid), 2, 'or delete (two items remain)');
select * from finish();
rollback;

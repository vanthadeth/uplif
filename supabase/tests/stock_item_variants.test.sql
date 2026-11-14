-- Stock piece 7 tests: variants, hidden default variant, limits, picture link, role access, isolation.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('eeeeeeee-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'var-1@test.local'),
  ('eeeeeeee-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'var-2@test.local');
insert into public.profiles (user_id, full_name) values
  ('eeeeeeee-0000-0000-0000-0000000000a1', 'One'), ('eeeeeeee-0000-0000-0000-0000000000a2', 'Two');

select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000a1', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Var Co', null, 'KH', 'USD', 'Main');
reset role;
select set_config('t.co', (select id::text from public.companies where name = 'Var Co'), true);
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000a1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', current_setting('t.co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Var Co')))::text, true);
set local role authenticated;

insert into public.items (company_id, name, currency_code) values (current_setting('t.co')::uuid, 'Shirt', 'USD'), (current_setting('t.co')::uuid, 'Mug', 'USD');

select is((select count(*)::int from public.item_variants where is_default), 2, 'every new item gets a default variant');
select is((select v.is_active from public.item_variants v join public.items i on i.id = v.item_id where i.name = 'Shirt'), true, 'the default variant is on while there are no real ones');
select lives_ok($$insert into public.item_variants (company_id, item_id, name, barcode, price) values (current_setting('t.co')::uuid, (select id from public.items where name = 'Shirt'), 'Small', '1111', 9.5)$$, 'owner adds a variant');
select is((select v.is_active from public.item_variants v join public.items i on i.id = v.item_id where i.name = 'Shirt' and v.is_default), false, 'the default variant switches off');
select lives_ok($$insert into public.item_variants (company_id, item_id, name) values (current_setting('t.co')::uuid, (select id from public.items where name = 'Shirt'), 'Large')$$, 'and another');
select throws_ok($$insert into public.item_variants (company_id, item_id, name) values (current_setting('t.co')::uuid, (select id from public.items where name = 'Shirt'), ' small ')$$, '23505', null, 'same name on the same item is refused');
select lives_ok($$insert into public.item_variants (company_id, item_id, name) values (current_setting('t.co')::uuid, (select id from public.items where name = 'Mug'), 'Small')$$, 'another item can reuse the name');
select throws_ok($$insert into public.item_variants (company_id, item_id, name, barcode) values (current_setting('t.co')::uuid, (select id from public.items where name = 'Mug'), 'Big', '1111')$$, '23505', null, 'a barcode is unique in the company');
select throws_ok($$insert into public.item_variants (company_id, item_id, name, price) values (current_setting('t.co')::uuid, (select id from public.items where name = 'Mug'), 'Neg', -1)$$, '23514', null, 'negative price refused');
select throws_ok($$insert into public.item_variants (company_id, item_id, name, is_default) values (current_setting('t.co')::uuid, (select id from public.items where name = 'Mug'), 'Sneaky default', true)$$, '42501', null, 'is_default cannot be set by hand');
select lives_ok($$update public.item_variants set price = 10, is_active = false where name = 'Large'$$, 'owner edits and hides a variant');
select lives_ok($$delete from public.item_variants where is_default and item_id = (select id from public.items where name = 'Mug')$$, 'deleting a default variant by hand does nothing');
select is((select count(*)::int from public.item_variants where is_default), 2, 'the default variants are still there');
select lives_ok($$delete from public.item_variants where name = 'Small' and item_id = (select id from public.items where name = 'Mug')$$, 'owner deletes the last real variant of Mug');
select is((select v.is_active from public.item_variants v join public.items i on i.id = v.item_id where i.name = 'Mug' and v.is_default), true, 'the default variant switches back on');

-- picture link: must be a picture of the same item
insert into public.item_images (company_id, item_id, image_path) values (current_setting('t.co')::uuid, (select id from public.items where name = 'Mug'), current_setting('t.co') || '/items/m.jpg');
select throws_ok($$update public.item_variants set image_id = (select id from public.item_images limit 1) where name = 'Small' and item_id = (select id from public.items where name = 'Shirt')$$, '23503', null, 'a variant cannot use another item''s picture');
select lives_ok($$insert into public.item_variants (company_id, item_id, name, image_id) values (current_setting('t.co')::uuid, (select id from public.items where name = 'Mug'), 'Blue', (select id from public.item_images limit 1))$$, 'a variant can use its own item''s picture');
select lives_ok($$delete from public.item_images$$, 'deleting the picture');
select is((select image_id from public.item_variants where name = 'Blue'), null, 'only clears the variant''s link');

-- limit
insert into public.item_variants (company_id, item_id, name) select current_setting('t.co')::uuid, (select id from public.items where name = 'Shirt'), 'v' || g from generate_series(1, 98) g;
select throws_ok($$insert into public.item_variants (company_id, item_id, name) values (current_setting('t.co')::uuid, (select id from public.items where name = 'Shirt'), 'one too many')$$, 'P0001', null, 'a 101st variant is refused');

select lives_ok($$delete from public.items where name = 'Shirt'$$, 'deleting an item');
select is((select count(*)::int from public.item_variants v where v.item_id not in (select id from public.items)), 0, 'removes all its variants, default included');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000a2', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Other Var Co', null, 'KH', 'USD', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000a2', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Other Var Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Other Var Co')))::text, true);
set local role authenticated;
select is((select count(*)::int from public.item_variants), 0, 'other company sees no variants');
select throws_ok($$insert into public.item_variants (company_id, item_id, name) values (current_setting('t.co')::uuid, (select id from public.items where company_id = current_setting('t.co')::uuid limit 1), 'Sneaky')$$, '42501', null, 'cannot add to another company');
update public.item_variants set name = 'Hacked';
delete from public.item_variants;
reset role;
select is((select count(*)::int from public.item_variants where company_id = current_setting('t.co')::uuid and name = 'Hacked'), 0, 'other company cannot edit');
select is((select count(*)::int from public.item_variants where company_id = current_setting('t.co')::uuid and name = 'Blue'), 1, 'or delete');
select * from finish();
rollback;

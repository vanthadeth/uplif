-- Stock piece 6 tests: item pictures, one main, limit, role access, isolation. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('eeeeeeee-0000-0000-0000-0000000000f1', 'authenticated', 'authenticated', 'img-1@test.local'),
  ('eeeeeeee-0000-0000-0000-0000000000f2', 'authenticated', 'authenticated', 'img-2@test.local');
insert into public.profiles (user_id, full_name) values
  ('eeeeeeee-0000-0000-0000-0000000000f1', 'One'), ('eeeeeeee-0000-0000-0000-0000000000f2', 'Two');

select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000f1', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Img Co', null, 'KH', 'USD', 'Main');
reset role;
select set_config('t.co', (select id::text from public.companies where name = 'Img Co'), true);
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000f1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', current_setting('t.co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Img Co')))::text, true);
set local role authenticated;

insert into public.items (company_id, name, currency_code) values (current_setting('t.co')::uuid, 'Shirt', 'USD'), (current_setting('t.co')::uuid, 'Pants', 'USD');

select lives_ok($$insert into public.item_images (company_id, item_id, image_path) values (current_setting('t.co')::uuid, (select id from public.items where name = 'Shirt'), current_setting('t.co') || '/items/a.jpg')$$, 'owner adds a picture');
select is((select is_main from public.item_images where image_path like '%/a.jpg'), true, 'the first picture is the main one');
select lives_ok($$insert into public.item_images (company_id, item_id, image_path) values (current_setting('t.co')::uuid, (select id from public.items where name = 'Shirt'), current_setting('t.co') || '/items/b.jpg'), (current_setting('t.co')::uuid, (select id from public.items where name = 'Shirt'), current_setting('t.co') || '/items/c.jpg')$$, 'owner adds more');
select is((select count(*)::int from public.item_images where is_main), 1, 'still exactly one main');
select is((select is_main from public.item_images where image_path like '%/b.jpg'), false, 'later pictures are not main');
select throws_ok($$insert into public.item_images (company_id, item_id, image_path) values (current_setting('t.co')::uuid, (select id from public.items where name = 'Shirt'), current_setting('t.co') || '/brands/x.jpg')$$, '23514', null, 'path must be in the items folder');
select throws_ok($$update public.item_images set is_main = true where image_path like '%/b.jpg'$$, '42501', null, 'is_main cannot be edited directly');
select lives_ok($$select public.set_item_main_image((select id from public.item_images where image_path like '%/b.jpg'))$$, 'owner changes the main picture');
select is((select image_path from public.item_images where is_main), current_setting('t.co') || '/items/b.jpg', 'the chosen picture is now main');
select is((select count(*)::int from public.item_images where is_main), 1, 'and only one');
select lives_ok($$delete from public.item_images where is_main$$, 'owner deletes the main picture');
select is((select count(*)::int from public.item_images where is_main), 1, 'another picture was promoted');
select is((select image_path from public.item_images where is_main), current_setting('t.co') || '/items/a.jpg', 'the oldest remaining one');

-- limit of 10 (Shirt has 2 left)
insert into public.item_images (company_id, item_id, image_path)
  select current_setting('t.co')::uuid, (select id from public.items where name = 'Shirt'), current_setting('t.co') || '/items/g' || g || '.jpg' from generate_series(1, 8) g;
select throws_ok($$insert into public.item_images (company_id, item_id, image_path) values (current_setting('t.co')::uuid, (select id from public.items where name = 'Shirt'), current_setting('t.co') || '/items/over.jpg')$$, 'P0001', null, 'an 11th picture is refused');
select lives_ok($$insert into public.item_images (company_id, item_id, image_path) values (current_setting('t.co')::uuid, (select id from public.items where name = 'Pants'), current_setting('t.co') || '/items/p.jpg')$$, 'another item has its own main');
select is((select count(*)::int from public.item_images where is_main), 2, 'one main per item');
select lives_ok($$delete from public.items where name = 'Pants'$$, 'deleting an item');
select is((select count(*)::int from public.item_images where image_path like '%/p.jpg'), 0, 'removes its pictures');
reset role;

-- another company
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000f2', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Other Img Co', null, 'KH', 'USD', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000f2', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Other Img Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Other Img Co')))::text, true);
set local role authenticated;
select is((select count(*)::int from public.item_images), 0, 'other company sees no pictures');
select throws_ok($$insert into public.item_images (company_id, item_id, image_path) values (current_setting('t.co')::uuid, (select id from public.items where company_id = current_setting('t.co')::uuid limit 1), current_setting('t.co') || '/items/z.jpg')$$, '42501', null, 'cannot add to another company');
select throws_ok($$select public.set_item_main_image((select id from public.item_images limit 1))$$, 'P0002', null, 'cannot change the main of another company');
delete from public.item_images;
reset role;
select is((select count(*)::int from public.item_images where company_id = current_setting('t.co')::uuid), 10, 'other company cannot delete pictures');
select * from finish();
rollback;

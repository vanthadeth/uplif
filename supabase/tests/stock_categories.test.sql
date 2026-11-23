-- Stock piece 2 tests: categories with one sub-level, isolation. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('eeeeeeee-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'cat-1@test.local'),
  ('eeeeeeee-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'cat-2@test.local');
insert into public.profiles (user_id, full_name) values
  ('eeeeeeee-0000-0000-0000-0000000000c1', 'One'), ('eeeeeeee-0000-0000-0000-0000000000c2', 'Two');

select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000c1', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Cat Co', null, 'KH', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000c1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Cat Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Cat Co')))::text, true);
set local role authenticated;

select lives_ok($$insert into public.categories (company_id, name, name_local) values ((select id from public.companies), 'Drinks', 'ភេសជ្ជៈ')$$, 'owner adds a top-level category');
select lives_ok($$insert into public.categories (company_id, parent_id, name) values ((select id from public.companies), (select id from public.categories where name = 'Drinks'), 'Soft drinks')$$, 'owner adds a sub-category');
select throws_ok($$insert into public.categories (company_id, parent_id, name) values ((select id from public.companies), (select id from public.categories where name = 'Soft drinks'), 'Cola')$$, 'P0001', null, 'a sub-category cannot have its own sub-category');
select throws_ok($$update public.categories set parent_id = (select id from public.categories where name = 'Soft drinks') where name = 'Drinks'$$, 'P0001', null, 'a category cannot be put under a sub-category');
select lives_ok($$insert into public.categories (company_id, name) values ((select id from public.companies), 'Snacks')$$, 'second top-level category');
select throws_ok($$update public.categories set parent_id = id where name = 'Snacks'$$, '23514', null, 'a category cannot be its own parent');
select throws_ok($$update public.categories set parent_id = (select id from public.categories where name = 'Snacks') where name = 'Drinks'$$, 'P0001', null, 'a category that has sub-categories cannot become a sub-category');
select throws_ok($$insert into public.categories (company_id, name) values ((select id from public.companies), ' drinks ')$$, '23505', null, 'top-level names are unique');
select throws_ok($$insert into public.categories (company_id, parent_id, name) values ((select id from public.companies), (select id from public.categories where name = 'Drinks'), 'SOFT DRINKS')$$, '23505', null, 'sub-category names are unique under one parent');
select lives_ok($$insert into public.categories (company_id, parent_id, name) values ((select id from public.companies), (select id from public.categories where name = 'Snacks'), 'Soft drinks')$$, 'the same sub-category name is fine under another parent');
select throws_ok($$delete from public.categories where name = 'Drinks'$$, '23503', null, 'a category with sub-categories cannot be deleted');
select lives_ok($$delete from public.categories where name = 'Soft drinks' and parent_id = (select id from public.categories where name = 'Drinks')$$, 'sub-category can be deleted');
select lives_ok($$delete from public.categories where name = 'Drinks'$$, 'then the category can be deleted');
select throws_ok($$insert into public.categories (company_id, name, image_path) values ((select id from public.companies), 'Pic', 'someone-else/categories/x.jpg')$$, '23514', null, 'picture must live in own company folder');
select is((select count(*)::int from public.audit_log where action = 'categories.insert'), 4, 'inserts are audited');
reset role;
select set_config('t.snacks', (select id::text from public.categories where name = 'Snacks'), true);

select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000c2', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Other Co', null, 'KH', 'USD', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000c2', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Other Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Other Co')))::text, true);
set local role authenticated;
select is((select count(*)::int from public.categories), 0, 'other company sees no categories');
select throws_ok($$insert into public.categories (company_id, name) values ((select id from public.companies where name = 'Cat Co'), 'Sneaky')$$, '42501', null, 'cannot insert into another company');
select throws_ok($$insert into public.categories (company_id, parent_id, name) values ((select id from public.companies where name = 'Other Co'), current_setting('t.snacks')::uuid, 'Cross')$$, null, null, 'cannot hang a category under another company''s parent');
reset role;
select * from finish();
rollback;

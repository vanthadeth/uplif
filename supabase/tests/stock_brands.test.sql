-- Stock piece 1 tests: brands, role defaults, tenant isolation. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('eeeeeeee-0000-0000-0000-0000000000f1', 'authenticated', 'authenticated', 'sb-1@test.local'),
  ('eeeeeeee-0000-0000-0000-0000000000f2', 'authenticated', 'authenticated', 'sb-2@test.local');
insert into public.profiles (user_id, full_name) values
  ('eeeeeeee-0000-0000-0000-0000000000f1', 'One'), ('eeeeeeee-0000-0000-0000-0000000000f2', 'Two');

select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000f1', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Brand Co', null, 'KH', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000f1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Brand Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Brand Co')))::text, true);

select is((select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id
  where r.name = 'Warehouse' and rp.permission_key = 'stock.catalog.read'), 1, 'warehouse role reads the catalogue by default');
select is((select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id
  where r.name = 'Manager' and rp.permission_key like 'stock.catalog.%'), 2, 'manager role reads and manages');
select is((select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id
  where r.name = 'Staff' and rp.permission_key like 'stock.%'), 0, 'staff role has no stock access');

set local role authenticated;
select lives_ok($$insert into public.brands (company_id, name, name_local) values ((select id from public.companies), 'Angkor', 'អង្គរ')$$, 'owner adds a brand');
select throws_ok($$insert into public.brands (company_id, name) values ((select id from public.companies), ' angkor ')$$, '23505', null, 'same name in another case is refused');
select throws_ok($$insert into public.brands (company_id, name) values ((select id from public.companies), '  ')$$, '23514', null, 'blank name is refused');
select throws_ok($$insert into public.brands (company_id, name, image_path) values ((select id from public.companies), 'Other', 'someone-else/brands/x.webp')$$, '23514', null, 'picture must live in own company folder');
select lives_ok($$update public.brands set name_local = 'Angkor KH', image_path = (select id::text from public.companies) || '/brands/a.webp'$$, 'owner edits a brand');
select is((select count(*)::int from public.audit_log where action = 'brands.insert'), 1, 'brand insert is audited');
select is((select count(*)::int from public.audit_log where action = 'brands.update'), 1, 'brand update is audited');
reset role;

-- A second company never sees it, and cannot write into it.
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000f2', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Other Co', null, 'KH', 'USD', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000f2', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Other Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Other Co')))::text, true);
set local role authenticated;
select is((select count(*)::int from public.brands), 0, 'other company sees no brands');
select throws_ok($$insert into public.brands (company_id, name) values ((select id from public.companies where name = 'Brand Co'), 'Sneaky')$$, '42501', null, 'cannot insert into another company');
update public.brands set name = 'Hacked';
reset role;
select is((select name from public.brands where company_id = (select id from public.companies where name = 'Brand Co')), 'Angkor', 'other company cannot edit it');

-- Role without the permission: remove stock access from company 2's owner membership by switching to a Staff role.
select is((select count(*)::int from public.brands), 1, 'sanity: superuser sees the one brand');
select * from finish();
rollback;

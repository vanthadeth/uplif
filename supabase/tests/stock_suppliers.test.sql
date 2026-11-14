-- Stock piece 3 tests: suppliers, role access, isolation. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('eeeeeeee-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'sup-1@test.local'),
  ('eeeeeeee-0000-0000-0000-0000000000d2', 'authenticated', 'authenticated', 'sup-2@test.local');
insert into public.profiles (user_id, full_name) values
  ('eeeeeeee-0000-0000-0000-0000000000d1', 'One'), ('eeeeeeee-0000-0000-0000-0000000000d2', 'Two');

select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000d1', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Sup Co', null, 'KH', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000d1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Sup Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Sup Co')))::text, true);
set local role authenticated;

select lives_ok($$insert into public.suppliers (company_id, name, name_local, phone, address) values ((select id from public.companies), 'Khmer Beverage Co', 'ក្រុមហ៊ុនភេសជ្ជៈខ្មែរ', '+855 12 345 678', 'Phnom Penh')$$, 'owner adds a supplier');
select throws_ok($$insert into public.suppliers (company_id, name) values ((select id from public.companies), ' khmer beverage co ')$$, '23505', null, 'same name in another case is refused');
select throws_ok($$insert into public.suppliers (company_id, name) values ((select id from public.companies), '   ')$$, '23514', null, 'blank name is refused');
select lives_ok($$update public.suppliers set contact_name = 'Sok', is_active = false$$, 'owner edits and hides a supplier');
select is((select count(*)::int from public.audit_log where action = 'suppliers.insert'), 1, 'insert is audited');
select is((select count(*)::int from public.audit_log where action = 'suppliers.update'), 1, 'update is audited');
select lives_ok($$delete from public.suppliers where name = 'Khmer Beverage Co'$$, 'owner deletes a supplier');
select lives_ok($$insert into public.suppliers (company_id, name) values ((select id from public.companies), 'Keep me')$$, 'add one to keep');
reset role;
select set_config('t.co', (select id::text from public.companies where name = 'Sup Co'), true);

select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000d2', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Other Co', null, 'KH', 'USD', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000d2', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Other Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Other Co')))::text, true);
set local role authenticated;
select is((select count(*)::int from public.suppliers), 0, 'other company sees no suppliers');
select throws_ok($$insert into public.suppliers (company_id, name) values (current_setting('t.co')::uuid, 'Sneaky')$$, '42501', null, 'cannot insert into another company');
update public.suppliers set name = 'Hacked';
delete from public.suppliers;
reset role;
select is((select name from public.suppliers where company_id = current_setting('t.co')::uuid), 'Keep me', 'other company cannot edit or delete it');
select * from finish();
rollback;

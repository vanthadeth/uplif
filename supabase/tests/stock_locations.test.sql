-- Stock piece 3 tests: locations, role access, isolation. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('eeeeeeee-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'loc-1@test.local'),
  ('eeeeeeee-0000-0000-0000-0000000000d2', 'authenticated', 'authenticated', 'loc-2@test.local');
insert into public.profiles (user_id, full_name) values
  ('eeeeeeee-0000-0000-0000-0000000000d1', 'One'), ('eeeeeeee-0000-0000-0000-0000000000d2', 'Two');

select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000d1', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Loc Co', null, 'KH', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000d1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Loc Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Loc Co')))::text, true);
set local role authenticated;

select lives_ok($$insert into public.locations (company_id, name, name_local, address) values ((select id from public.companies), 'Main warehouse', 'ឃ្លាំងធំ', 'Phnom Penh')$$, 'owner adds a location');
select throws_ok($$insert into public.locations (company_id, name) values ((select id from public.companies), ' main WAREHOUSE ')$$, '23505', null, 'same name in another case is refused');
select throws_ok($$insert into public.locations (company_id, name) values ((select id from public.companies), '   ')$$, '23514', null, 'blank name is refused');
select lives_ok($$update public.locations set note = 'Back door', is_active = false$$, 'owner edits and hides a location');
select is((select count(*)::int from public.audit_log where action = 'locations.insert'), 1, 'insert is audited');
select is((select count(*)::int from public.audit_log where action = 'locations.update'), 1, 'update is audited');
select lives_ok($$delete from public.locations where name = 'Main warehouse'$$, 'owner deletes a location');
select lives_ok($$insert into public.locations (company_id, name) values ((select id from public.companies), 'Keep me')$$, 'add one to keep');
reset role;
select set_config('t.co', (select id::text from public.companies where name = 'Loc Co'), true);

select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000d2', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Other Loc Co', null, 'KH', 'USD', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000d2', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Other Loc Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Other Loc Co')))::text, true);
set local role authenticated;
select is((select count(*)::int from public.locations), 0, 'other company sees no locations');
select throws_ok($$insert into public.locations (company_id, name) values (current_setting('t.co')::uuid, 'Sneaky')$$, '42501', null, 'cannot insert into another company');
update public.locations set name = 'Hacked';
delete from public.locations;
reset role;
select is((select name from public.locations where company_id = current_setting('t.co')::uuid), 'Keep me', 'other company cannot edit or delete it');
select * from finish();
rollback;

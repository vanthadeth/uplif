-- Supplier second phone and location latitude/longitude.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
insert into auth.users (id, aud, role, email) values ('cdcdcdcd-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'geo-1@test.local');
insert into public.profiles (user_id, full_name) values ('cdcdcdcd-0000-0000-0000-0000000000d1', 'One');
select set_config('request.jwt.claims', json_build_object('sub', 'cdcdcdcd-0000-0000-0000-0000000000d1', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Geo Co', null, 'KH', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'cdcdcdcd-0000-0000-0000-0000000000d1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Geo Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Geo Co')))::text, true);
set local role authenticated;

insert into public.suppliers (company_id, name, phone, phone2) values ((select id from public.companies), 'Acme', '012 111 111', '098 222 222');
select is((select phone2 from public.suppliers), '098 222 222', 'a supplier can have a second phone number');
select lives_ok($$update public.suppliers set phone2 = null$$, 'which can be cleared');
select throws_ok($$update public.suppliers set phone2 = repeat('1', 41)$$, '23514', null, 'and is not longer than 40 characters');

insert into public.locations (company_id, name, latitude, longitude) values ((select id from public.companies), 'Main store', 11.556374, 104.928207);
select is((select latitude from public.locations), 11.556374, 'a location can have a latitude');
select is((select longitude from public.locations), 104.928207, 'and a longitude');
select lives_ok($$update public.locations set latitude = null, longitude = null$$, 'both can be cleared together');
select throws_ok($$update public.locations set latitude = 11.5$$, '23514', null, 'a latitude alone is refused');
select throws_ok($$update public.locations set latitude = 91, longitude = 10$$, '23514', null, 'latitude stays within -90 and 90');
select throws_ok($$update public.locations set latitude = 10, longitude = 181$$, '23514', null, 'longitude stays within -180 and 180');
select * from finish();
rollback;

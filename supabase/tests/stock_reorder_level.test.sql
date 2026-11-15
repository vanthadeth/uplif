-- Reorder level on items: can be set, cleared, never negative.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
insert into auth.users (id, aud, role, email) values ('cdcdcdcd-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'ro-1@test.local');
insert into public.profiles (user_id, full_name) values ('cdcdcdcd-0000-0000-0000-0000000000c1', 'One');
select set_config('request.jwt.claims', json_build_object('sub', 'cdcdcdcd-0000-0000-0000-0000000000c1', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Ro Co', null, 'KH', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'cdcdcdcd-0000-0000-0000-0000000000c1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Ro Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Ro Co')))::text, true);
set local role authenticated;
insert into public.items (company_id, name, currency_code, reorder_level) values ((select id from public.companies), 'Beer', 'USD', 12);
select is((select reorder_level from public.items), 12.000, 'a reorder level can be set when adding an item');
select lives_ok($$update public.items set reorder_level = 5.5$$, 'and changed');
select lives_ok($$update public.items set reorder_level = null$$, 'and cleared');
select throws_ok($$update public.items set reorder_level = -1$$, '23514', null, 'never negative');
select * from finish();
rollback;

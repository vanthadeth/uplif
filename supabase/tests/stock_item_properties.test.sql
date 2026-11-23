-- Stock piece 8 tests: item properties (not counted options). One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('eeeeeeee-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'prop-1@test.local'),
  ('eeeeeeee-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'prop-2@test.local');
insert into public.profiles (user_id, full_name) values
  ('eeeeeeee-0000-0000-0000-0000000000e1', 'One'), ('eeeeeeee-0000-0000-0000-0000000000e2', 'Two');

select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000e1', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Prop Co', null, 'KH', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000e1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Prop Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Prop Co')))::text, true);
set local role authenticated;


insert into public.items (company_id, name, currency_code) values ((select id from public.companies), 'Milk tea', 'USD');
select is((select properties from public.items), '[]'::jsonb, 'a new item has no properties');
select lives_ok($$update public.items set properties = '[{"name":"Sweetness","name_local":null,"selection":"one","required":true,"options":[{"name":"Less sugar","name_local":null,"extra_charge":0},{"name":"Normal","name_local":null,"extra_charge":0}]},{"name":"Topping","selection":"many","required":false,"options":[{"name":"Pearls","extra_charge":0.5}]}]'$$, 'owner saves properties');
select is(jsonb_array_length((select properties from public.items)), 2, 'both groups are stored');
select throws_ok($$update public.items set properties = '{"a":1}'$$, '23514', null, 'must be a list');
select throws_ok($$update public.items set properties = '[{"name":" ","selection":"one","required":true,"options":[{"name":"A","extra_charge":0}]}]'$$, '23514', null, 'blank group name refused');
select throws_ok($$update public.items set properties = '[{"name":"X","selection":"some","required":true,"options":[{"name":"A","extra_charge":0}]}]'$$, '23514', null, 'selection must be one or many');
select throws_ok($$update public.items set properties = '[{"name":"X","selection":"one","required":true,"options":[]}]'$$, '23514', null, 'needs at least one option');
select throws_ok($$update public.items set properties = '[{"name":"X","selection":"one","required":true,"options":[{"name":"A","extra_charge":-1}]}]'$$, '23514', null, 'extra charge cannot be negative');
select throws_ok($$update public.items set properties = '[{"name":"X","selection":"one","required":true,"options":[{"name":"","extra_charge":0}]}]'$$, '23514', null, 'blank option name refused');
select throws_ok($$update public.items set properties = (select jsonb_agg(jsonb_build_object('name','G'||n,'selection','one','required',true,'options',jsonb_build_array(jsonb_build_object('name','A','extra_charge',0)))) from generate_series(1,21) n)$$, '23514', null, 'at most 20 groups');
select is(jsonb_array_length((select properties from public.items)), 2, 'failed saves changed nothing');
reset role;
select * from finish();
rollback;

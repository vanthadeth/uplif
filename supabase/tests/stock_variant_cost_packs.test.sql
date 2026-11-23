-- Variant cost and packs: pack checks, cost hidden without permission, isolation. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok(app.valid_packs(null), 'no packs is fine');
select ok(app.valid_packs('[]'::jsonb), 'empty list is fine');
select ok(app.valid_packs('[{"name":"Box","qty":12},{"name":"Carton","qty":72,"length_cm":60,"width_cm":40,"height_cm":35,"gross_kg":15.5,"net_kg":14}]'::jsonb), 'packs with measurements pass');
select ok(not app.valid_packs('[{"name":"Box","qty":1}]'::jsonb), 'quantity under 2 refused');
select ok(not app.valid_packs('[{"name":"Box","qty":2.5}]'::jsonb), 'fractional quantity refused');
select ok(not app.valid_packs('[{"name":"","qty":12}]'::jsonb), 'empty name refused');
select ok(not app.valid_packs('[{"name":"Box","qty":12,"net_kg":20,"gross_kg":10}]'::jsonb), 'net above gross refused');
select ok(not app.valid_packs('[{"name":"Box","qty":12,"length_cm":-1}]'::jsonb), 'negative measurement refused');
select ok(not app.valid_packs('[{"name":"Box","qty":12,"colour":"red"}]'::jsonb), 'unknown field refused');
select ok(not app.valid_packs('{"name":"Box"}'::jsonb), 'not a list refused');

insert into auth.users (id, aud, role, email) values
  ('eeeeeeee-0000-0000-0000-0000000000f1', 'authenticated', 'authenticated', 'vc-1@test.local'),
  ('eeeeeeee-0000-0000-0000-0000000000f2', 'authenticated', 'authenticated', 'vc-2@test.local');
insert into public.profiles (user_id, full_name) values
  ('eeeeeeee-0000-0000-0000-0000000000f1', 'One'), ('eeeeeeee-0000-0000-0000-0000000000f2', 'Two');
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000f1', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('VC Co', null, 'KH', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000f1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'VC Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'VC Co')))::text, true);
set local role authenticated;

insert into public.items (company_id, name, currency_code, price, packs) values ((select id from public.companies), 'Shirt', 'USD', 10, '[{"name":"Box","qty":12}]');
insert into public.item_variants (company_id, item_id, name, price, packs) select company_id, id, 'Large', 12, '[{"name":"Carton","qty":72,"gross_kg":15,"net_kg":14}]' from public.items;
select is((select count(*)::int from public.item_variants where packs is not null), 1, 'variant keeps its own packs');
select throws_ok($$update public.item_variants set packs = '[{"name":"Box","qty":1}]' where not is_default$$, '23514', null, 'bad variant packs refused');
select throws_ok($$update public.items set packs = '[{"name":"Box","qty":12,"net_kg":9,"gross_kg":1}]'$$, '23514', null, 'bad item packs refused');
select lives_ok($$insert into public.variant_costs (variant_id, company_id, cost) select id, company_id, 6 from public.item_variants where not is_default$$, 'owner saves a variant cost');
select lives_ok($$update public.variant_costs set cost = 7$$, 'owner changes it');
select throws_ok($$update public.variant_costs set cost = -1$$, '23514', null, 'negative cost refused');
select is((select count(*)::int from public.audit_log where action in ('variant_costs.insert', 'variant_costs.update')), 2, 'variant cost changes are audited');
select is((select count(*)::int from public.audit_log where entity_type = 'variant_costs' and details::text like '%7%'), 0, 'without amounts');
reset role;
set local session_replication_role = replica;
delete from public.role_permissions where permission_key = 'stock.cost.view';
set local session_replication_role = origin;
set local role authenticated;
select is((select count(*)::int from public.variant_costs), 0, 'without the permission no variant cost is visible');
select throws_ok($$insert into public.variant_costs (variant_id, company_id, cost) select id, company_id, 1 from public.item_variants where is_default$$, '42501', null, 'and none can be written');
reset role;
select set_config('t.co', (select id::text from public.companies where name = 'VC Co'), true);
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000f2', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Other VC Co', null, 'KH', 'USD', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000f2', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Other VC Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Other VC Co')))::text, true);
set local role authenticated;
select is((select count(*)::int from public.variant_costs), 0, 'other company sees no variant costs');
select throws_ok($$insert into public.variant_costs (variant_id, company_id, cost) values (gen_random_uuid(), current_setting('t.co')::uuid, 1)$$, '42501', null, 'cannot write into another company');
reset role;
select * from finish();
rollback;

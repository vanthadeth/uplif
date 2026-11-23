-- Stock item cost tests: permission, hidden without it, audit without amounts, isolation. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('eeeeeeee-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'cost-1@test.local'),
  ('eeeeeeee-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'cost-2@test.local');
insert into public.profiles (user_id, full_name) values
  ('eeeeeeee-0000-0000-0000-0000000000e1', 'One'), ('eeeeeeee-0000-0000-0000-0000000000e2', 'Two');

select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000e1', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Cost Co', null, 'KH', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000e1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Cost Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Cost Co')))::text, true);
set local role authenticated;


select is((select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.name = 'Warehouse' and rp.permission_key = 'stock.cost.view'), 0, 'warehouse does not see cost by default');
select is((select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.name in ('Manager', 'Accountant', 'Owner', 'Admin') and rp.permission_key = 'stock.cost.view'), 4, 'owner, admin, manager and accountant see cost by default');
insert into public.items (company_id, name, currency_code, price) values ((select id from public.companies), 'Beer', 'USD', 1.5);
select lives_ok($$insert into public.item_costs (item_id, company_id, cost) values ((select id from public.items), (select id from public.companies), 0.9)$$, 'owner saves a cost');
select lives_ok($$update public.item_costs set cost = 1.0$$, 'owner changes the cost');
select throws_ok($$update public.item_costs set cost = -1$$, '23514', null, 'negative cost refused');
select is((select count(*)::int from public.audit_log where action in ('item_costs.insert', 'item_costs.update')), 2, 'cost changes are audited');
select is((select count(*)::int from public.audit_log where entity_type = 'item_costs' and details::text like '%1.0%'), 0, 'but the audit log never holds the amounts');
reset role;
-- Take the permission away from the owner role: cost disappears, items stay readable.
set local session_replication_role = replica;
delete from public.role_permissions where permission_key = 'stock.cost.view';
set local session_replication_role = origin;
set local role authenticated;
select is((select count(*)::int from public.item_costs), 0, 'without the permission no cost is visible');
select is((select count(*)::int from public.items), 1, 'items are still visible');
select throws_ok($$insert into public.item_costs (item_id, company_id, cost) select id, company_id, 5 from public.items$$, '42501', null, 'without the permission no cost can be written');
update public.item_costs set cost = 99;
reset role;
select is((select cost from public.item_costs), 1.0::numeric, 'and the cost is untouched');
select set_config('t.co', (select id::text from public.companies where name = 'Cost Co'), true);
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000e2', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Other Cost Co', null, 'KH', 'USD', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'eeeeeeee-0000-0000-0000-0000000000e2', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Other Cost Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Other Cost Co')))::text, true);
set local role authenticated;
select is((select count(*)::int from public.item_costs), 0, 'other company sees no costs');
select throws_ok($$insert into public.item_costs (item_id, company_id, cost) values (gen_random_uuid(), current_setting('t.co')::uuid, 1)$$, '42501', null, 'cannot write into another company');
reset role;
select * from finish();
rollback;

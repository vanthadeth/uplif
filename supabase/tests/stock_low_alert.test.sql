-- Low-stock notification: fires once when an item's total falls to its reorder level, for Stock managers only. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values ('fafafafa-0000-0000-0000-0000000000f1', 'authenticated', 'authenticated', 'low-1@test.local');
insert into public.profiles (user_id, full_name) values ('fafafafa-0000-0000-0000-0000000000f1', 'One');
select set_config('request.jwt.claims', json_build_object('sub', 'fafafafa-0000-0000-0000-0000000000f1', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Low Co', null, 'KH', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'fafafafa-0000-0000-0000-0000000000f1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Low Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Low Co')))::text, true);
set local role authenticated;
insert into public.locations (company_id, name) values ((select id from public.companies), 'Main store');
insert into public.items (company_id, name, currency_code, reorder_level) values ((select id from public.companies), 'Beer', 'USD', 10), ((select id from public.companies), 'Cola', 'USD', null);
select set_config('t.loc', (select id::text from public.locations), true);
select set_config('t.v', (select v.id::text from public.item_variants v join public.items i on i.id = v.item_id where i.name = 'Beer'), true);
select set_config('t.c', (select v.id::text from public.item_variants v join public.items i on i.id = v.item_id where i.name = 'Cola'), true);
select public.receive_stock(gen_random_uuid(), current_setting('t.loc')::uuid, null, null, null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'qty', 24), jsonb_build_object('variant_id', current_setting('t.c'), 'qty', 24)));
reset role;
select set_config('t.n', (select count(*)::text from public.notifications where kind = 'low_stock'), true);
select is(current_setting('t.n')::int, 0, 'receiving stock notifies nobody');
select set_config('t.owner_emp', (select e.id::text from public.employees e where e.company_id = (select id from public.companies)), true);

set local role authenticated;
select public.adjust_stock(gen_random_uuid(), current_setting('t.loc')::uuid, 'count', null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'counted', 12)));
reset role;
select is((select count(*)::int from public.notifications where kind = 'low_stock'), 0, 'still above the level: no notification');
set local role authenticated;
select public.adjust_stock(gen_random_uuid(), current_setting('t.loc')::uuid, 'count', null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'counted', 10)));
reset role;
select is((select count(*)::int from public.notifications where kind = 'low_stock'), 1, 'falling to the level notifies the manager once');
select is((select (data->>'name') || ':' || (data->>'qty') || ':' || (data->>'level') from public.notifications where kind = 'low_stock'), 'Beer:10.000:10.000', 'it carries the item, quantity and level');
set local role authenticated;
select public.adjust_stock(gen_random_uuid(), current_setting('t.loc')::uuid, 'loss', null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'counted', 4)));
reset role;
select is((select count(*)::int from public.notifications where kind = 'low_stock'), 1, 'falling further does not notify again');
set local role authenticated;
select public.adjust_stock(gen_random_uuid(), current_setting('t.loc')::uuid, 'found', null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'counted', 30)));
select public.adjust_stock(gen_random_uuid(), current_setting('t.loc')::uuid, 'loss', null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'counted', 9)));
reset role;
select is((select count(*)::int from public.notifications where kind = 'low_stock'), 2, 'restocking then falling again notifies again');
set local role authenticated;
select public.adjust_stock(gen_random_uuid(), current_setting('t.loc')::uuid, 'loss', null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.c'), 'counted', 1)));
reset role;
select is((select count(*)::int from public.notifications where kind = 'low_stock'), 2, 'an item with no reorder level never notifies');

-- Only company-wide Stock managers are told: take the permission away and fall again.
set local session_replication_role = replica;
delete from public.role_permissions where permission_key = 'stock.catalog.manage';
set local session_replication_role = origin;
set local role authenticated;
select public.adjust_stock(gen_random_uuid(), current_setting('t.loc')::uuid, 'found', null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'counted', 30)));
select public.adjust_stock(gen_random_uuid(), current_setting('t.loc')::uuid, 'loss', null, jsonb_build_array(jsonb_build_object('variant_id', current_setting('t.v'), 'counted', 2)));
reset role;
select is((select count(*)::int from public.notifications where kind = 'low_stock'), 2, 'without the Stock manager permission nobody is notified');
select * from finish();
rollback;

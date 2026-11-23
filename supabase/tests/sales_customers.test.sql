-- UPLIF Go customers: scope, contacts, photos, plan module and isolation. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('f8000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'sc-owner@test.local'),
  ('f8000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'sc-rep@test.local'),
  ('f8000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'sc-rep2@test.local'),
  ('f8000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'sc-staff@test.local'),
  ('f8000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'sc-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('f8000000-0000-0000-0000-000000000001', 'Owner'), ('f8000000-0000-0000-0000-000000000002', 'Rep'),
  ('f8000000-0000-0000-0000-000000000003', 'Rep Two'), ('f8000000-0000-0000-0000-000000000004', 'Staff'),
  ('f8000000-0000-0000-0000-000000000005', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'f8000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Sc Co', null, 'LA', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'f8000000-0000-0000-0000-000000000005', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Sc Other Co', null, 'LA', 'KHR', 'Main');
reset role;

create temp table ctx as
  select c.id as cid, m.id as owner_mid,
         (select id from public.roles where company_id = c.id and name = 'Sales rep') as rep_role,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role,
         (select m2.id from public.memberships m2 join public.companies c2 on c2.id = m2.company_id where c2.name = 'Sc Other Co') as other_mid,
         (select c2.id from public.companies c2 where c2.name = 'Sc Other Co') as other_cid
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'Sc Co';
grant select on ctx to authenticated;

insert into public.memberships (company_id, user_id, display_name) select cid, 'f8000000-0000-0000-0000-000000000002', 'Rep' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'f8000000-0000-0000-0000-000000000003', 'Rep Two' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'f8000000-0000-0000-0000-000000000004', 'Staff' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select ctx.cid, m.id, case when m.user_id = 'f8000000-0000-0000-0000-000000000004' then ctx.staff_role else ctx.rep_role end
  from ctx join public.memberships m on m.company_id = ctx.cid and m.user_id <> 'f8000000-0000-0000-0000-000000000001';

create temp table people as
  select m.user_id, m.id as mid, e.id as eid
  from public.memberships m join public.employees e on e.membership_id = m.id join ctx on ctx.cid = m.company_id;
grant select on people to authenticated;

create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'f8000000-0000-0000-0000-00000000000' || n, 'role', 'authenticated',
    'app_metadata', json_build_object('company_id', case when n = 5 then (select other_cid from ctx) else (select cid from ctx) end,
      'membership_id', case when n = 5 then (select other_mid from ctx)
                            else (select mid from people where user_id = ('f8000000-0000-0000-0000-00000000000' || n)::uuid) end))::text, true)
$$;

select is((select count(*)::int from people), 4, 'each member has an employee record');

-- two customers: one by rep 1, id chosen by the phone; photos uploaded first
create temp table k as select gen_random_uuid() as c1, gen_random_uuid() as c2, gen_random_uuid() as c3;
grant select on k to authenticated;

-- ===== a salesperson registers a customer with contacts and photos =====
select pg_temp.as_user(2);
set local role authenticated;
select lives_ok($$insert into storage.objects (bucket_id, name) values ('sales-attachments', (select cid::text from ctx) || '/' || (select c1::text from k) || '/a.jpg')$$, 'rep uploads a photo before the customer exists');
select lives_ok($$insert into storage.objects (bucket_id, name) values ('sales-attachments', (select cid::text from ctx) || '/' || (select c1::text from k) || '/b.jpg')$$, 'and a second one');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('sales-attachments', (select other_cid::text from ctx) || '/' || (select c1::text from k) || '/c.jpg')$$, '42501', null, 'not into another company folder');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('sales-attachments', (select cid::text from ctx) || '/not-a-uuid/c.jpg')$$, '42501', null, 'a path of the wrong shape is refused');
select lives_ok($$select public.sales_save_customer((select c1 from k), 'Lim Mini Mart', 'លឹម', 'Street 271', 11.55, 104.9, 'Near the market',
  ('[{"name":"Mr. Lim","phone":"012 111 222"},{"name":"Staff","phone":"012 333 444"}]')::jsonb,
  ('[{"path":"' || (select cid::text from ctx) || '/' || (select c1::text from k) || '/a.jpg","type":"storefront","note":"Front"},
     {"path":"' || (select cid::text from ctx) || '/' || (select c1::text from k) || '/b.jpg","type":"display_shelf","note":"Shelf","is_default":true}]')::jsonb)$$, 'rep registers a customer');
select lives_ok($$select public.sales_save_customer((select c1 from k), 'Lim Mini Mart', 'លឹម', 'Street 271', 11.55, 104.9, 'Near the market', null, null)$$, 'saving again with the same id is safe');
select is((select count(*)::int from public.customers), 1, 'one customer, not two');
select is((select count(*)::int from public.customer_contacts where is_default), 1, 'exactly one default contact');
select is((select name from public.customer_contacts where is_default), 'Mr. Lim', 'the first contact became the default');
select is((select count(*)::int from public.customer_photos where is_default), 1, 'one default photo');
select is((select photo_type::text from public.customer_photos where is_default), 'display_shelf', 'the chosen one');
select throws_ok($$select public.sales_save_customer(gen_random_uuid(), '  ', null, null, null, null, null, null, null)$$, '22023', null, 'a name is required');
select throws_ok($$select public.sales_save_customer(gen_random_uuid(), 'X', null, null, 11.5, null, null, null, null)$$, '22023', null, 'latitude and longitude go together');
select throws_ok($$select public.sales_save_customer(gen_random_uuid(), 'X', null, null, null, null, null, '[{"name":""}]'::jsonb, null)$$, '22023', null, 'a contact needs a name');
select throws_ok($$select public.sales_save_customer((select c2 from k), 'X', null, null, null, null, null, null,
  ('[{"path":"' || (select cid::text from ctx) || '/' || (select c1::text from k) || '/a.jpg"}]')::jsonb)$$, '42501', null, 'a photo of another customer is refused');
select throws_ok($$select public.sales_save_customer((select c2 from k), 'X', null, null, null, null, null, null,
  ('[{"path":"' || (select cid::text from ctx) || '/' || (select c2::text from k) || '/nope.jpg"}]')::jsonb)$$, '22023', null, 'a photo that was never uploaded is refused');
select is((select count(*)::int from public.customers), 1, 'failed saves left nothing behind');
-- changing the default contact moves the flag, deleting the default promotes another
select lives_ok($$select public.sales_save_customer((select c1 from k), 'Lim Mini Mart', null, null, null, null, null,
  '[{"name":"Mr. Lim","phone":"012 111 222"},{"name":"Staff","phone":"012 333 444","is_default":true}]'::jsonb, null)$$, 'rep changes the default contact');
select is((select name from public.customer_contacts where is_default), 'Staff', 'default moved');
select lives_ok($$select public.sales_save_customer((select c1 from k), 'Lim Mini Mart', null, null, null, null, null, '[{"name":"Mr. Lim"}]'::jsonb, null)$$, 'rep removes the default contact');
select is((select name from public.customer_contacts where is_default), 'Mr. Lim', 'another became the default');
select is((select jsonb_array_length(public.sales_customer_detail((select c1 from k)) -> 'photos')), 2, 'detail lists the photos');
select is((select jsonb_array_length(public.sales_customer_list('lim'))), 1, 'search finds it by name');
select is((select jsonb_array_length(public.sales_customer_list('zzz'))), 0, 'and not by something else');
select throws_ok($$delete from public.customers$$, '42501', null, 'no direct deletes');
select throws_ok($$update public.customers set name = 'x'$$, '42501', null, 'no direct updates');
reset role;

-- ===== scope: a second rep sees nothing of the first rep's customers =====
select pg_temp.as_user(3);
set local role authenticated;
select is((select count(*)::int from public.customers), 0, 'rep two cannot see rep one customers');
select is((select count(*)::int from public.customer_contacts), 0, 'nor their contacts');
select is((select count(*)::int from public.customer_photos), 0, 'nor their photos');
select is((select jsonb_array_length(public.sales_customer_list(null))), 0, 'the list is empty');
select is((public.sales_customer_detail((select c1 from k))), null, 'detail returns nothing');
select throws_ok($$select public.sales_save_customer((select c1 from k), 'Hijack', null, null, null, null, null, null, null)$$, '42501', null, 'and cannot edit it');
select throws_ok($$select public.sales_archive_customer((select c1 from k), true)$$, '42501', null, 'or archive it');
reset role;
select pg_temp.as_user(3);
set local role authenticated;
select lives_ok($$select public.sales_save_customer((select c3 from k), 'Rep Two Shop', null, null, null, null, null, null, null)$$, 'rep two registers their own');
select is((select count(*)::int from public.customers), 1, 'and sees only that one');
reset role;

-- ===== staff role has no sales permissions =====
select pg_temp.as_user(4);
set local role authenticated;
select is((select count(*)::int from public.customers), 0, 'staff see no customers');
select throws_ok($$select public.sales_save_customer(gen_random_uuid(), 'Nope', null, null, null, null, null, null, null)$$, '42501', null, 'staff cannot register');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('sales-attachments', (select cid::text from ctx) || '/' || (select c1::text from k) || '/z.jpg')$$, '42501', null, 'staff cannot upload');
reset role;

-- ===== owner (company scope) sees everything, can hand over and archive =====
select pg_temp.as_user(1);
set local role authenticated;
select is((select count(*)::int from public.customers), 2, 'owner sees both customers');
select lives_ok($$select public.sales_assign_customer((select c1 from k), (select eid from people where user_id = 'f8000000-0000-0000-0000-000000000003'))$$, 'owner hands a customer to rep two');
select lives_ok($$select public.sales_archive_customer((select c1 from k), true)$$, 'and archives it');
select is((select jsonb_array_length(public.sales_customer_list(null))), 1, 'archived customers leave the list');
select is((select jsonb_array_length(public.sales_customer_list(null, 50, true))), 2, 'unless asked for');
reset role;
select pg_temp.as_user(3);
set local role authenticated;
select is((select count(*)::int from public.customers), 2, 'rep two now sees the handed-over customer');
select throws_ok($$select public.sales_archive_customer((select c1 from k), false)$$, '42501', null, 'but reps cannot archive');
reset role;

-- ===== another company sees nothing =====
select pg_temp.as_user(5);
set local role authenticated;
select is((select count(*)::int from public.customers), 0, 'other company sees no customers');
select is((select count(*)::int from public.customer_contacts), 0, 'no contacts');
select is((select count(*)::int from public.customer_photos), 0, 'no photos');
select is((public.sales_customer_detail((select c1 from k))), null, 'no detail');
select throws_ok($$select public.sales_save_customer((select c1 from k), 'Steal', null, null, null, null, null, null, null)$$, '42501', null, 'cannot take over a customer id of another company');
select throws_ok($$select public.sales_assign_customer((select c1 from k), (select eid from people limit 1))$$, '42501', null, 'cannot hand it over');
reset role;
select is((select count(*)::int from storage.objects where bucket_id = 'sales-attachments'), 2, 'still just the two photos');

-- ===== the app state =====
select pg_temp.as_user(2);
set local role authenticated;
select is((public.sales_my_state() ->> 'module')::boolean, true, 'module is on');
select is((public.sales_my_state() ->> 'can_create')::boolean, true, 'rep can create');
select is((public.sales_my_state() ->> 'can_manage')::boolean, false, 'rep cannot manage');
reset role;
select pg_temp.as_user(4);
set local role authenticated;
select is((public.sales_my_state() ->> 'can_read')::boolean, false, 'staff cannot read customers');
reset role;

select * from finish();
rollback;

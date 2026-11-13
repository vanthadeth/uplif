-- Push: subscription storage, isolation, sender functions. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('ff000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'cr-owner@test.local'),
  ('ff000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'cr-staff@test.local'),
  ('ff000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'cr-staff2@test.local'),
  ('ff000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'cr-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('ff000000-0000-0000-0000-000000000001', 'Owner'), ('ff000000-0000-0000-0000-000000000002', 'Staff'),
  ('ff000000-0000-0000-0000-000000000003', 'Staff Two'), ('ff000000-0000-0000-0000-000000000005', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'ff000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('PP Co', null, 'LA', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'ff000000-0000-0000-0000-000000000005', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('PP Other Co', null, 'LA', 'KHR', 'Main');
reset role;

create temp table ctx as
  select c.id as cid, m.id as owner_mid,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role,
         (select m2.id from public.memberships m2 join public.companies c2 on c2.id = m2.company_id where c2.name = 'PP Other Co') as other_mid,
         (select c2.id from public.companies c2 where c2.name = 'PP Other Co') as other_cid
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'PP Co';
grant select on ctx to authenticated;

insert into public.memberships (company_id, user_id, display_name) select cid, 'ff000000-0000-0000-0000-000000000002', 'Staff' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'ff000000-0000-0000-0000-000000000003', 'Staff Two' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select ctx.cid, m.id, ctx.staff_role
  from ctx join public.memberships m on m.company_id = ctx.cid and m.user_id <> 'ff000000-0000-0000-0000-000000000001';

create temp table people as
  select m.user_id, m.id as mid, e.id as eid
  from public.memberships m join public.employees e on e.membership_id = m.id join ctx on ctx.cid = m.company_id;
grant select on people to authenticated;

create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'ff000000-0000-0000-0000-00000000000' || n, 'role', 'authenticated',
    'app_metadata', json_build_object('company_id', case when n = 5 then (select other_cid from ctx) else (select cid from ctx) end,
      'membership_id', case when n = 5 then (select other_mid from ctx)
                            else (select mid from people where user_id = ('ff000000-0000-0000-0000-00000000000' || n)::uuid) end))::text, true)
$$;
create function pg_temp.eid(n int) returns uuid language sql as $$ select eid from people where user_id = ('ff000000-0000-0000-0000-00000000000' || n)::uuid $$;
grant execute on function pg_temp.eid(int) to authenticated;



-- staff 2 reports to staff 3
update public.employees set reports_to_id = pg_temp.eid(3) where id = pg_temp.eid(2);

-- own details
select pg_temp.as_user(2);
set local role authenticated;
select lives_ok($$select public.my_save_personal('{"nickname":"Dara","date_of_birth":"1999-06-14","address":"Siem Reap","phone1":"+855 12 345 678","phone2":"096 111 222","e1_name":"Sophea","e1_relation":"Mother","e1_phone":"012 987 654","e2_name":"Rith","e2_relation":"Brother","e2_phone":"077 555 123"}'::jsonb)$$, 'staff saves their details');
select is(public.my_personal() ->> 'nickname', 'Dara', 'and reads them back');
select is(jsonb_array_length(public.my_personal() -> 'phones'), 2, 'two phones');
select is(public.my_personal() -> 'emergency' -> 1 ->> 'relation', 'Brother', 'second emergency contact');
select throws_ok($$select public.my_save_personal('{"phone1":"call me"}'::jsonb)$$, '23514', null, 'a bad phone number is refused');
select lives_ok($$select public.my_save_personal('{"nickname":"Dara","phone1":"012 345 678"}'::jsonb)$$, 'saving fewer fields clears the rest');
select is(jsonb_array_length(public.my_personal() -> 'phones'), 1, 'one phone left');
select is(public.my_personal() -> 'emergency' -> 0 ->> 'name', null, 'emergency contact cleared');
reset role;

-- nobody else reads them
select pg_temp.as_user(3);
set local role authenticated;
select is(public.my_personal() ->> 'nickname', null, 'a colleague sees their own (empty) details, not staff 2''s');
select is((select count(*)::int from public.profiles where nickname = 'Dara'), 0, 'and cannot read the row');
select is((select count(*)::int from public.profile_phones), 0, 'nor the phone numbers');
reset role;
select pg_temp.as_user(5);
set local role authenticated;
select is((select count(*)::int from public.profiles where nickname = 'Dara'), 0, 'another company cannot read the row');
reset role;

-- manager card: private until the manager shares phones
insert into public.profile_phones (user_id, label, number) values ('ff000000-0000-0000-0000-000000000003', 'mobile', '012 222 333');
insert into public.telegram_links (user_id, telegram_id, username) values ('ff000000-0000-0000-0000-000000000003', '111222333', 'boss');
select pg_temp.as_user(2);
set local role authenticated;
select is(public.my_profile() -> 'manager' ->> 'name', 'Staff Two', 'staff see their manager''s name');
select is(public.my_profile() -> 'manager' ->> 'phone', null, 'but not their phone while it is private');
select is(public.my_profile() -> 'manager' ->> 'telegram', null, 'nor Telegram');
select is(public.my_profile() -> 'role' ->> 'name', 'Staff', 'the role is returned');
reset role;
insert into public.membership_sharing (company_id, membership_id, share_phones)
  select cid, (select mid from people where user_id = 'ff000000-0000-0000-0000-000000000003'), true from ctx;
select pg_temp.as_user(2);
set local role authenticated;
select is(public.my_profile() -> 'manager' ->> 'phone', '012 222 333', 'shared: the phone shows');
select is(public.my_profile() -> 'manager' ->> 'telegram', 'boss', 'and Telegram');
reset role;

select * from finish();
rollback;

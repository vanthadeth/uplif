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
select public.create_company('PS Co', null, 'LA', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'ff000000-0000-0000-0000-000000000005', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('PS Other Co', null, 'LA', 'KHR', 'Main');
reset role;

create temp table ctx as
  select c.id as cid, m.id as owner_mid,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role,
         (select m2.id from public.memberships m2 join public.companies c2 on c2.id = m2.company_id where c2.name = 'PS Other Co') as other_mid,
         (select c2.id from public.companies c2 where c2.name = 'PS Other Co') as other_cid
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'PS Co';
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



create temp table ep (a text);
insert into ep values ('https://push.example.test/send/aaaaaaaaaaaaaaaaaaaaaaaa');
grant select on ep to authenticated;
create function pg_temp.ep(n int) returns text language sql as $$ select 'https://push.example.test/send/' || repeat(n::text, 24) $$;
grant execute on function pg_temp.ep(int) to authenticated;

select pg_temp.as_user(2);
set local role authenticated;
select is(public.my_push_registered((select a from ep)), false, 'not registered at first');
select throws_ok($$select public.save_push_subscription('http://insecure.test/x', repeat('a', 40), repeat('b', 20), null)$$, '22023', 'bad address', 'only https addresses');
select lives_ok($$select public.save_push_subscription((select a from ep), repeat('a', 40), repeat('b', 20), 'phone')$$, 'staff saves their phone');
select is(public.my_push_registered((select a from ep)), true, 'now registered');
select throws_ok($$select * from public.push_subscriptions$$, '42501', null, 'nobody reads the table directly');
select lives_ok($$select public.save_push_subscription((select a from ep), repeat('c', 40), repeat('d', 20), 'phone again')$$, 'saving the same address again is fine');
reset role;
select is((select count(*)::int from public.push_subscriptions), 1, 'still one row');
select is((select p256dh from public.push_subscriptions), repeat('c', 40), 'and it was refreshed');

-- a colleague cannot see or remove it
select pg_temp.as_user(3);
set local role authenticated;
select is(public.my_push_registered((select a from ep)), false, 'a colleague does not see it as theirs');
select lives_ok($$select public.remove_push_subscription((select a from ep))$$, 'removing someone else''s address does nothing');
reset role;
select is((select count(*)::int from public.push_subscriptions), 1, 'it is still there');

-- more than 10 devices keeps the newest 10
select pg_temp.as_user(2);
set local role authenticated;
select public.save_push_subscription(pg_temp.ep(g), repeat('a', 40), repeat('b', 20), null) from generate_series(1, 12) g;
reset role;
select is((select count(*)::int from public.push_subscriptions where employee_id = pg_temp.eid(2)), 10, 'at most 10 devices per person');

-- the sender functions are not for signed-in users
select pg_temp.as_user(2);
set local role authenticated;
select throws_ok($$select * from public.push_targets(gen_random_uuid())$$, '42501', null, 'staff cannot ask for push targets');
select throws_ok($$select public.push_drop_subscription((select a from ep))$$, '42501', null, 'staff cannot drop addresses through the sender call');
reset role;

-- a notification looks up the person's phones, with their language
insert into public.performance_reviews (company_id, employee_id, period, overall_percent) select cid, pg_temp.eid(2), date_trunc('month', current_date)::date, 90 from ctx;
create temp table nid as select id from public.notifications where employee_id = pg_temp.eid(2) limit 1;
select is((select count(*)::int from public.push_targets((select id from nid))), 10, 'the sender finds all ten phones');
select is((select distinct locale from public.push_targets((select id from nid))), 'en', 'with the person''s language');
select is((select count(*)::int from public.push_targets(gen_random_uuid())), 0, 'an unknown notification has no targets');
select lives_ok($$select public.push_drop_subscription((select a from ep))$$, 'service side can drop a gone address');
select is((select count(*)::int from public.push_subscriptions where endpoint = (select a from ep)), 0, 'and it is gone');

-- another company
select pg_temp.as_user(5);
set local role authenticated;
select is(public.my_push_registered(pg_temp.ep(1)), false, 'other company sees nothing');
select lives_ok($$select public.remove_push_subscription(pg_temp.ep(1))$$, 'and cannot remove ours');
reset role;
select is((select count(*)::int from public.push_subscriptions where endpoint = pg_temp.ep(1)), 1, 'it is still there');

select * from finish();
rollback;

-- Notifications: created by events, own-only, switch. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('fe000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'cr-owner@test.local'),
  ('fe000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'cr-staff@test.local'),
  ('fe000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'cr-staff2@test.local'),
  ('fe000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'cr-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('fe000000-0000-0000-0000-000000000001', 'Owner'), ('fe000000-0000-0000-0000-000000000002', 'Staff'),
  ('fe000000-0000-0000-0000-000000000003', 'Staff Two'), ('fe000000-0000-0000-0000-000000000005', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'fe000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('NT Co', null, 'LA', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'fe000000-0000-0000-0000-000000000005', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('NT Other Co', null, 'LA', 'KHR', 'Main');
reset role;

create temp table ctx as
  select c.id as cid, m.id as owner_mid,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role,
         (select m2.id from public.memberships m2 join public.companies c2 on c2.id = m2.company_id where c2.name = 'NT Other Co') as other_mid,
         (select c2.id from public.companies c2 where c2.name = 'NT Other Co') as other_cid
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'NT Co';
grant select on ctx to authenticated;

insert into public.memberships (company_id, user_id, display_name) select cid, 'fe000000-0000-0000-0000-000000000002', 'Staff' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'fe000000-0000-0000-0000-000000000003', 'Staff Two' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select ctx.cid, m.id, ctx.staff_role
  from ctx join public.memberships m on m.company_id = ctx.cid and m.user_id <> 'fe000000-0000-0000-0000-000000000001';

create temp table people as
  select m.user_id, m.id as mid, e.id as eid
  from public.memberships m join public.employees e on e.membership_id = m.id join ctx on ctx.cid = m.company_id;
grant select on people to authenticated;

create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'fe000000-0000-0000-0000-00000000000' || n, 'role', 'authenticated',
    'app_metadata', json_build_object('company_id', case when n = 5 then (select other_cid from ctx) else (select cid from ctx) end,
      'membership_id', case when n = 5 then (select other_mid from ctx)
                            else (select mid from people where user_id = ('fe000000-0000-0000-0000-00000000000' || n)::uuid) end))::text, true)
$$;
create function pg_temp.eid(n int) returns uuid language sql as $$ select eid from people where user_id = ('fe000000-0000-0000-0000-00000000000' || n)::uuid $$;
grant execute on function pg_temp.eid(int) to authenticated;


insert into public.positions (company_id, name) select cid, 'Cashier' from ctx;
insert into public.positions (company_id, name) select cid, 'Supervisor' from ctx;
update public.employees set position_id = (select id from public.positions where name = 'Cashier' and company_id = (select cid from ctx)) where id in (pg_temp.eid(2), pg_temp.eid(3));
create temp table pos as select name, id from public.positions where company_id = (select cid from ctx);
grant select on pos to authenticated;

-- nothing yet
select pg_temp.as_user(2);
set local role authenticated;
select is(public.my_unread_notifications(), 0, 'no notifications at first');
select is(public.my_notification_setting(), true, 'the switch is on by default');
reset role;

-- a promotion notifies the person
select pg_temp.as_user(1);
set local role authenticated;
select public.record_career_event(pg_temp.eid(2), 'promotion', (select id from pos where name = 'Supervisor'), current_date, null);
reset role;
-- a decided correction and a saved review notify too (as the system would)
insert into public.attendance_amendments (company_id, employee_id, work_date, in_time, reason) select cid, pg_temp.eid(2), current_date - 1, '09:00', 'forgot' from ctx;
update public.attendance_amendments set status = 'approved', decision_note = 'ok' where employee_id = pg_temp.eid(2);
insert into public.performance_reviews (company_id, employee_id, period, overall_percent) select cid, pg_temp.eid(2), date_trunc('month', current_date)::date, 88 from ctx;

select pg_temp.as_user(2);
set local role authenticated;
select is(public.my_unread_notifications(), 3, 'three notifications arrived');
select is((select array_agg(kind order by kind) from public.my_notifications()), array['amendment_approved', 'performance_review', 'promotion'], 'of the right kinds');
select is((select data ->> 'to' from public.my_notifications() where kind = 'promotion'), 'Supervisor', 'a promotion carries the new position');
select is((select (data ->> 'percent')::int from public.my_notifications() where kind = 'performance_review'), 88, 'a review carries the score');
select is((select count(*)::int from public.notifications), 3, 'they can read their own rows');
select lives_ok($$select public.mark_notifications_read((select array[id] from public.my_notifications() where kind = 'promotion'))$$, 'mark one read');
select is(public.my_unread_notifications(), 2, 'two unread');
select lives_ok($$select public.mark_notifications_read()$$, 'mark all read');
select is(public.my_unread_notifications(), 0, 'none unread');
reset role;

-- the switch
select pg_temp.as_user(2);
set local role authenticated;
select lives_ok($$select public.set_my_notification_setting(false)$$, 'turn notifications off');
select is(public.my_notification_setting(), false, 'the switch is off');
reset role;
insert into public.performance_reviews (company_id, employee_id, period, overall_percent) select cid, pg_temp.eid(2), (date_trunc('month', current_date) - interval '1 month')::date, 70 from ctx;
select pg_temp.as_user(2);
set local role authenticated;
select is((select count(*)::int from public.notifications), 3, 'nothing new while it is off');
select lives_ok($$select public.set_my_notification_setting(true)$$, 'turn it back on');
reset role;

-- a colleague and another company see none of it
select pg_temp.as_user(3);
set local role authenticated;
select is((select count(*)::int from public.my_notifications()), 0, 'colleague has none');
select is((select count(*)::int from public.notifications), 0, 'and cannot read others');
select is((select count(*)::int from public.notification_settings), 0, 'or their settings');
select throws_ok($$select app.notify((select cid from ctx), pg_temp.eid(2), 'promotion', '{}')$$, '42501', null, 'nobody can create one directly');
reset role;
select pg_temp.as_user(5);
set local role authenticated;
select is((select count(*)::int from public.notifications), 0, 'other company reads none');
select is(public.my_unread_notifications(), 0, 'and has none unread');
reset role;

select * from finish();
rollback;

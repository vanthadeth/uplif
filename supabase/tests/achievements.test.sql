-- Achievements: green months, this month's progress, years with the company, and who may read them. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('f9000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ach-owner@test.local'),
  ('f9000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ach-staff@test.local'),
  ('f9000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'ach-staff2@test.local'),
  ('f9000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'ach-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('f9000000-0000-0000-0000-000000000001', 'Owner'), ('f9000000-0000-0000-0000-000000000002', 'Staff'),
  ('f9000000-0000-0000-0000-000000000003', 'Staff Two'), ('f9000000-0000-0000-0000-000000000005', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'f9000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Ach Co', null, 'LA', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'f9000000-0000-0000-0000-000000000005', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Ach Other Co', null, 'LA', 'KHR', 'Main');
reset role;

create temp table ctx as
  select c.id as cid, m.id as owner_mid,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role,
         (select m2.id from public.memberships m2 join public.companies c2 on c2.id = m2.company_id where c2.name = 'Ach Other Co') as other_mid,
         (select c2.id from public.companies c2 where c2.name = 'Ach Other Co') as other_cid
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'Ach Co';
grant select on ctx to authenticated;

insert into public.memberships (company_id, user_id, display_name) select cid, 'f9000000-0000-0000-0000-000000000002', 'Staff' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'f9000000-0000-0000-0000-000000000003', 'Staff Two' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select ctx.cid, m.id, ctx.staff_role
  from ctx join public.memberships m on m.company_id = ctx.cid and m.user_id <> 'f9000000-0000-0000-0000-000000000001';

create temp table people as
  select m.user_id, m.id as mid, e.id as eid
  from public.memberships m join public.employees e on e.membership_id = m.id join ctx on ctx.cid = m.company_id;
grant select on people to authenticated;

create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'f9000000-0000-0000-0000-00000000000' || n, 'role', 'authenticated',
    'app_metadata', json_build_object('company_id', case when n = 5 then (select other_cid from ctx) else (select cid from ctx) end,
      'membership_id', case when n = 5 then (select other_mid from ctx)
                            else (select mid from people where user_id = ('f9000000-0000-0000-0000-00000000000' || n)::uuid) end))::text, true)
$$;

select is((select count(*)::int from people), 3, 'each member has an employee record');


create function pg_temp.eid(n int) returns uuid language sql as $$ select eid from people where user_id = ('f9000000-0000-0000-0000-00000000000' || n)::uuid $$;
grant execute on function pg_temp.eid(int) to authenticated;
select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$select public.setup_working_time('mon_fri')$$, 'working time is set up (Mon to Fri, 08:00 to 17:00)');
reset role;
update public.employees set employment_date = (current_date - interval '2 years 3 months')::date where id = pg_temp.eid(2);

create temp table mo as select (date_trunc('month', current_date) - interval '1 month')::date as m1, (date_trunc('month', current_date) - interval '2 months')::date as m2, (date_trunc('month', current_date) - interval '3 months')::date as m3;
grant select on mo to authenticated;

-- Last month: every weekday on time. Two months ago: the same, but the first weekday starts at 09:00 (60 min late).
-- Three months ago: only three weekdays have events, the rest are absences.
insert into public.attendance_events (company_id, employee_id, kind, client_event_id, device_time, occurred_at)
select (select cid from ctx), pg_temp.eid(2), k.kind, gen_random_uuid(), t, t
from mo, generate_series(mo.m1, (mo.m1 + interval '1 month' - interval '1 day')::date, interval '1 day') d,
     lateral (values ('in'::public.attendance_kind, ((d::date + time '08:00') at time zone 'Asia/Phnom_Penh')),
                     ('out'::public.attendance_kind, ((d::date + time '17:00') at time zone 'Asia/Phnom_Penh'))) k(kind, t)
where extract(isodow from d) <= 5;
insert into public.attendance_events (company_id, employee_id, kind, client_event_id, device_time, occurred_at)
select (select cid from ctx), pg_temp.eid(2), k.kind, gen_random_uuid(), t, t
from mo, generate_series(mo.m2, (mo.m2 + interval '1 month' - interval '1 day')::date, interval '1 day') d,
     lateral (values ('in'::public.attendance_kind, ((d::date + (case when d::date = (select min(x::date) from generate_series(mo.m2, mo.m2 + 6, interval '1 day') x where extract(isodow from x) <= 5) then time '09:00' else time '08:00' end)) at time zone 'Asia/Phnom_Penh')),
                     ('out'::public.attendance_kind, ((d::date + time '17:00') at time zone 'Asia/Phnom_Penh'))) k(kind, t)
where extract(isodow from d) <= 5;
insert into public.attendance_events (company_id, employee_id, kind, client_event_id, device_time, occurred_at)
select (select cid from ctx), pg_temp.eid(2), k.kind, gen_random_uuid(), t, t
from mo, (select x::date d from mo, generate_series(mo.m3, (mo.m3 + interval '1 month' - interval '1 day')::date, interval '1 day') x where extract(isodow from x) <= 5 order by 1 limit 3) w,
     lateral (values ('in'::public.attendance_kind, ((w.d + time '08:00') at time zone 'Asia/Phnom_Penh')),
                     ('out'::public.attendance_kind, ((w.d + time '17:00') at time zone 'Asia/Phnom_Penh'))) k(kind, t);

select pg_temp.as_user(2);
set local role authenticated;
select is((select count(*)::int from public.my_achievements() where kind = 'green_month'), 1, 'one green month');
select is((select period from public.my_achievements() where kind = 'green_month'), (select m1 from mo), 'it is last month');
select is((select n = total from public.my_achievements() where kind = 'green_month'), true, 'every counted day was on time');
select is((select count(*)::int from public.my_achievements() where kind = 'green_month' and period = (select m2 from mo)), 0, 'one late day spoils a month');
select is((select count(*)::int from public.my_achievements() where kind = 'green_month' and period = (select m3 from mo)), 0, 'a month with absences is not green');
select is((select count(*)::int from public.my_achievements() where kind = 'progress'), 1, 'one progress row for this month');
select is((select period from public.my_achievements() where kind = 'progress'), date_trunc('month', current_date)::date, 'for the current month');
select is((select max(n) from public.my_achievements() where kind = 'tenure'), 2, 'two full years with the company');
select is((select count(*)::int from public.my_achievements() where kind = 'tenure'), 2, 'one row per year');
reset role;

-- someone without a linked employee record, or from another company, gets nothing
select pg_temp.as_user(5);
set local role authenticated;
select is((select count(*)::int from public.my_achievements() where kind = 'green_month'), 0, 'another company sees only its own record');
reset role;

select * from finish();
rollback;

-- Attendance slice A1: clock in/out, flags, selfie bucket, settings, plan gate and isolation. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('fd000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'at-owner@test.local'),
  ('fd000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'at-mgr@test.local'),
  ('fd000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'at-staff@test.local'),
  ('fd000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'at-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('fd000000-0000-0000-0000-000000000001', 'Owner'), ('fd000000-0000-0000-0000-000000000003', 'Manager'),
  ('fd000000-0000-0000-0000-000000000004', 'Staff'), ('fd000000-0000-0000-0000-000000000005', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'fd000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('OffAtt Co', null, 'KH', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'fd000000-0000-0000-0000-000000000005', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('OffAtt Other Co', null, 'KH', 'KHR', 'Main');
reset role;

create temp table ctx as
  select c.id as cid, m.id as owner_mid,
         (select id from public.roles where company_id = c.id and name = 'Manager') as mgr_role,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role,
         (select m2.id from public.memberships m2 join public.companies c2 on c2.id = m2.company_id where c2.name = 'OffAtt Other Co') as other_mid,
         (select c2.id from public.companies c2 where c2.name = 'OffAtt Other Co') as other_cid
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'OffAtt Co';
grant select on ctx to authenticated;

insert into public.memberships (company_id, user_id, display_name) select cid, 'fd000000-0000-0000-0000-000000000003', 'Manager' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'fd000000-0000-0000-0000-000000000004', 'Staff' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select ctx.cid, m.id, case m.user_id when 'fd000000-0000-0000-0000-000000000003' then ctx.mgr_role else ctx.staff_role end
  from ctx join public.memberships m on m.company_id = ctx.cid and m.user_id <> 'fd000000-0000-0000-0000-000000000001';

create temp table people as
  select m.user_id, m.id as mid, e.id as eid
  from public.memberships m join public.employees e on e.membership_id = m.id join ctx on ctx.cid = m.company_id;
grant select on people to authenticated;

create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'fd000000-0000-0000-0000-00000000000' || n, 'role', 'authenticated',
    'app_metadata', json_build_object('company_id', case when n = 5 then (select other_cid from ctx) else (select cid from ctx) end,
      'membership_id', case when n = 5 then (select other_mid from ctx)
                            else (select mid from people where user_id = ('fd000000-0000-0000-0000-00000000000' || n)::uuid) end))::text, true)
$$;
create function pg_temp.eid(n int) returns uuid language sql as $$ select eid from people where user_id = ('fd000000-0000-0000-0000-00000000000' || n)::uuid $$;
grant execute on function pg_temp.eid(int) to authenticated;
-- A selfie path in employee n's folder.
create function pg_temp.sp(n int, f text) returns text language sql as $$ select (select cid::text from ctx) || '/' || pg_temp.eid(n)::text || '/2027-03-01/' || f $$;
grant execute on function pg_temp.sp(int, text) to authenticated;
create function pg_temp.clock(k public.attendance_kind, cid uuid, dt timestamptz, off boolean) returns jsonb
language sql as $$ select public.attendance_clock(k, cid, dt, 11.5564, 104.9282, 20, null, 'dev-a', off) $$;
grant execute on function pg_temp.clock(public.attendance_kind, uuid, timestamptz, boolean) to authenticated;


update public.employees set branch_id = (select id from public.branches where company_id = (select cid from ctx)) where id = pg_temp.eid(4);
update public.branches set latitude = 11.5564, longitude = 104.9282 where company_id = (select cid from ctx);
insert into public.attendance_settings (company_id, geofence_mode, default_radius_m, selfie_required, allow_without_selfie)
  select cid, 'flag', 150, false, true from ctx on conflict (company_id) do update set selfie_required = false;
create temp table ids (a uuid, b uuid, c uuid, d uuid);
insert into ids select gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid();
grant select on ids to authenticated;

select pg_temp.as_user(4);
set local role authenticated;
-- two taps made offline two hours ago, sent now
select is((pg_temp.clock('in', (select a from ids), now() - interval '3 hours', true) -> 'flags') ? 'offline', true, 'an offline in is flagged offline');
select ok(abs(extract(epoch from ((pg_temp.clock('in', (select a from ids), now() - interval '3 hours', true) ->> 'occurred_at')::timestamptz - (now() - interval '3 hours')))) < 1, 'and counts at the time the phone recorded');
select is((pg_temp.clock('in', (select a from ids), now() - interval '3 hours', true) ->> 'repeat')::boolean, true, 'sending it twice is safe');
select is((pg_temp.clock('out', (select b from ids), now() - interval '1 hour', true) -> 'flags') ? 'clock_drift', false, 'an old device time is not drift when offline');
select throws_ok($$select pg_temp.clock('in', gen_random_uuid(), now() - interval '2 hours', true)$$, 'P0001', 'out of order', 'an offline tap before a later event is refused');
select throws_ok($$select pg_temp.clock('in', gen_random_uuid(), now() - interval '9 days', true)$$, 'P0001', 'too old', 'more than 7 days old is refused');
select is((pg_temp.clock('in', (select c from ids), now() + interval '1 hour', true) -> 'flags') ? 'clock_drift', true, 'a future time is drift');
select ok(((pg_temp.clock('out', (select d from ids), now(), false)) ->> 'occurred_at')::timestamptz <= now() + interval '1 second', 'an online clock still counts at server time');
select is((select count(*)::int from public.attendance_events), 4, 'four events saved');
reset role;

select is((select count(*)::int from public.attendance_events where 'offline' = any(flags)), 3, 'three are marked offline');

-- another company cannot send into ours and sees nothing
select pg_temp.as_user(5);
set local role authenticated;
select is((select count(*)::int from public.attendance_events), 0, 'other company reads no events');
reset role;

select * from finish();
rollback;

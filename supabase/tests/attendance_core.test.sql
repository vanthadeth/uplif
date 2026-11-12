-- Attendance slice A1: clock in/out, flags, selfie bucket, settings, plan gate and isolation. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('f8000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'at-owner@test.local'),
  ('f8000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'at-mgr@test.local'),
  ('f8000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'at-staff@test.local'),
  ('f8000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'at-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('f8000000-0000-0000-0000-000000000001', 'Owner'), ('f8000000-0000-0000-0000-000000000003', 'Manager'),
  ('f8000000-0000-0000-0000-000000000004', 'Staff'), ('f8000000-0000-0000-0000-000000000005', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'f8000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Attend Co', null, 'KH', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'f8000000-0000-0000-0000-000000000005', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Attend Other Co', null, 'KH', 'KHR', 'Main');
reset role;

create temp table ctx as
  select c.id as cid, m.id as owner_mid,
         (select id from public.roles where company_id = c.id and name = 'Manager') as mgr_role,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role,
         (select m2.id from public.memberships m2 join public.companies c2 on c2.id = m2.company_id where c2.name = 'Attend Other Co') as other_mid,
         (select c2.id from public.companies c2 where c2.name = 'Attend Other Co') as other_cid
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'Attend Co';
grant select on ctx to authenticated;

insert into public.memberships (company_id, user_id, display_name) select cid, 'f8000000-0000-0000-0000-000000000003', 'Manager' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'f8000000-0000-0000-0000-000000000004', 'Staff' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select ctx.cid, m.id, case m.user_id when 'f8000000-0000-0000-0000-000000000003' then ctx.mgr_role else ctx.staff_role end
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
create function pg_temp.eid(n int) returns uuid language sql as $$ select eid from people where user_id = ('f8000000-0000-0000-0000-00000000000' || n)::uuid $$;
grant execute on function pg_temp.eid(int) to authenticated;
-- A selfie path in employee n's folder.
create function pg_temp.sp(n int, f text) returns text language sql as $$ select (select cid::text from ctx) || '/' || pg_temp.eid(n)::text || '/2027-03-01/' || f $$;
grant execute on function pg_temp.sp(int, text) to authenticated;
create function pg_temp.clock(k public.attendance_kind, cid uuid, lat double precision, lon double precision, acc int, sel text, dev text default 'dev-a', dt timestamptz default now()) returns jsonb
language sql as $$ select public.attendance_clock(k, cid, dt, lat, lon, acc, sel, dev) $$;
grant execute on function pg_temp.clock(public.attendance_kind, uuid, double precision, double precision, int, text, text, timestamptz) to authenticated;

update public.employees set reports_to_id = pg_temp.eid(3) where id = pg_temp.eid(4);
update public.employees set branch_id = (select id from public.branches where company_id = (select cid from ctx)) where id in (pg_temp.eid(3), pg_temp.eid(4));

-- ===== permissions seeded =====
select is((select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.name = 'Staff' and r.company_id = (select cid from ctx) and rp.permission_key in ('attendance.clock.self', 'attendance.record.read')), 2, 'staff may clock and see their own records');
select is((select data_scope::text from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.name = 'Manager' and r.company_id = (select cid from ctx) and rp.permission_key = 'attendance.record.read'), 'team', 'manager reads records at team scope');
select is((select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.name = 'Staff' and r.company_id = (select cid from ctx) and rp.permission_key in ('attendance.selfie.view', 'attendance.settings.manage')), 0, 'staff cannot view others selfies or change settings');

-- ===== branch location =====
select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$update public.branches set latitude = 11.5564, longitude = 104.9282, geofence_radius_m = 150 where company_id = (select cid from ctx)$$, 'owner sets the branch location');
select throws_ok($$update public.branches set latitude = 12 , longitude = null where company_id = (select cid from ctx)$$, '23514', null, 'latitude and longitude come as a pair');
select throws_ok($$update public.branches set latitude = 95, longitude = 10 where company_id = (select cid from ctx)$$, '23514', null, 'latitude out of range is refused');
reset role;
select pg_temp.as_user(4);
set local role authenticated;
update public.branches set latitude = 1, longitude = 1 where company_id = (select cid from ctx);
reset role;
select is((select latitude from public.branches where company_id = (select cid from ctx)), 11.5564::double precision, 'staff cannot move the branch');

-- ===== settings =====
select pg_temp.as_user(4);
set local role authenticated;
select throws_ok($$select public.get_attendance_settings()$$, '42501', 'not allowed', 'staff cannot read settings');
select throws_ok($$select public.save_attendance_settings('block', 150, 4, false)$$, '42501', 'not allowed', 'staff cannot save settings');
reset role;
select pg_temp.as_user(1);
set local role authenticated;
select is((select (public.get_attendance_settings() ->> 'geofence_mode')), 'flag', 'defaults: geofence flags only');
select throws_ok($$update public.company_settings set attendance_selfie_retention_days = 365$$, 'P0001', 'plan limit: selfie retention', 'retention is capped by the plan');
select lives_ok($$update public.company_settings set attendance_selfie_retention_days = 30$$, 'a shorter retention is fine');
select lives_ok($$select public.save_attendance_settings('flag', 150, 4, false)$$, 'owner saves settings');
reset role;

-- ===== selfie bucket =====
select pg_temp.as_user(4);
set local role authenticated;
select lives_ok($$insert into storage.objects (bucket_id, name) values ('attendance-selfies', pg_temp.sp(4, 'in1.jpg'))$$, 'staff uploads a selfie to their own folder');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('attendance-selfies', pg_temp.sp(3, 'x.jpg'))$$, '42501', null, 'staff cannot upload into a colleague folder');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('attendance-selfies', (select other_cid::text from ctx) || '/' || pg_temp.eid(4)::text || '/2027-03-01/x.jpg')$$, '42501', null, 'nor into another company');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('attendance-selfies', pg_temp.eid(4)::text || '/x.jpg')$$, '42501', null, 'a path of the wrong shape is refused');
select is((select count(*)::int from storage.objects where bucket_id = 'attendance-selfies'), 1, 'staff sees their own selfie');
reset role;
select pg_temp.as_user(3);
set local role authenticated;
select is((select count(*)::int from storage.objects where bucket_id = 'attendance-selfies'), 0, 'a manager cannot open it straight from storage (audited call comes in slice A4)');
reset role;
select pg_temp.as_user(5);
set local role authenticated;
select is((select count(*)::int from storage.objects where bucket_id = 'attendance-selfies'), 0, 'another company sees nothing');
reset role;

-- ===== clocking =====
select pg_temp.as_user(4);
set local role authenticated;
select is((public.attendance_my_state() ->> 'linked')::boolean, true, 'state: staff is linked to an employee');
select is((public.attendance_my_state() #>> '{branch,name}'), 'Main', 'state: carries the branch');
select ok((public.attendance_my_state() -> 'last') = 'null'::jsonb, 'state: nothing clocked yet');
select throws_ok($$select pg_temp.clock('out', gen_random_uuid(), 11.5564, 104.9282, 20, pg_temp.sp(4, 'in1.jpg'))$$, 'P0001', 'not clocked in', 'cannot clock out before clocking in');
select throws_ok($$select pg_temp.clock('in', gen_random_uuid(), 11.5564, 104.9282, 20, null)$$, 'P0001', 'selfie required', 'a selfie is required');
select throws_ok($$select pg_temp.clock('in', gen_random_uuid(), 11.5564, 104.9282, 20, pg_temp.sp(4, 'missing.jpg'))$$, 'P0001', 'selfie not found', 'the selfie must really be uploaded');
select throws_ok($$select pg_temp.clock('in', gen_random_uuid(), 11.5564, 104.9282, 20, pg_temp.sp(3, 'in1.jpg'))$$, 'P0001', 'selfie not found', 'a selfie in someone else folder is refused');
create temp table first_ev as select gen_random_uuid() as cid_ev;
grant select on first_ev to authenticated;
select lives_ok($$select pg_temp.clock('in', (select cid_ev from first_ev), 11.5564, 104.9282, 20, pg_temp.sp(4, 'in1.jpg'))$$, 'clock in inside the area');
select is((select flags from public.attendance_events where client_event_id = (select cid_ev from first_ev)), '{}'::text[], 'no flags inside the area');
select is((select inside_geofence from public.attendance_events where client_event_id = (select cid_ev from first_ev)), true, 'recorded as inside');
select is((pg_temp.clock('in', (select cid_ev from first_ev), 11.5564, 104.9282, 20, pg_temp.sp(4, 'in1.jpg')) ->> 'repeat')::boolean, true, 'the same client id is a safe retry');
select is((select count(*)::int from public.attendance_events), 1, 'a retry adds nothing');
select throws_ok($$select pg_temp.clock('in', gen_random_uuid(), 11.5564, 104.9282, 20, pg_temp.sp(4, 'in1.jpg'))$$, 'P0001', 'already clocked in', 'cannot clock in twice in a row');
select is((public.attendance_my_state() #>> '{last,kind}'), 'in', 'state: last is in');

-- out, far away, no selfie allowed yet
insert into storage.objects (bucket_id, name) values ('attendance-selfies', pg_temp.sp(4, 'out1.jpg'));
select lives_ok($$select pg_temp.clock('out', gen_random_uuid(), 11.60, 104.9282, 30, pg_temp.sp(4, 'out1.jpg'))$$, 'clock out outside the area is allowed (flag mode)');
select ok((select 'outside_geofence' = any (flags) from public.attendance_events where kind = 'out'), 'outside the area is flagged');
select ok((select distance_m > 4000 from public.attendance_events where kind = 'out'), 'the distance is kept');
select throws_ok($$select pg_temp.clock('out', gen_random_uuid(), 11.5564, 104.9282, 20, pg_temp.sp(4, 'out1.jpg'))$$, 'P0001', 'not clocked in', 'cannot clock out twice');

-- flags: no gps, low accuracy, drift
insert into storage.objects (bucket_id, name) values ('attendance-selfies', pg_temp.sp(4, 'in2.jpg')), ('attendance-selfies', pg_temp.sp(4, 'out2.jpg')), ('attendance-selfies', pg_temp.sp(4, 'in3.jpg'));
select lives_ok($$select pg_temp.clock('in', gen_random_uuid(), null, null, null, pg_temp.sp(4, 'in2.jpg'))$$, 'clock in without GPS');
select ok((select 'no_gps' = any (flags) from public.attendance_events where selfie_path = pg_temp.sp(4, 'in2.jpg')), 'no GPS is flagged');
select lives_ok($$select pg_temp.clock('out', gen_random_uuid(), 11.5564, 104.9282, 250, pg_temp.sp(4, 'out2.jpg'), 'dev-a', now() - interval '1 hour')$$, 'clock out with poor accuracy and a wrong phone clock');
select ok((select flags @> array['low_accuracy', 'clock_drift'] from public.attendance_events where selfie_path = pg_temp.sp(4, 'out2.jpg')), 'accuracy and drift are flagged');
reset role;

-- ===== block mode and missing selfie switch =====
select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$select public.save_attendance_settings('block', 150, 4, true)$$, 'owner switches to block and allows no-selfie');
reset role;
select pg_temp.as_user(4);
set local role authenticated;
select throws_ok($$select pg_temp.clock('in', gen_random_uuid(), 11.60, 104.9282, 20, pg_temp.sp(4, 'in3.jpg'))$$, 'P0001', 'outside area', 'block mode refuses a clock outside the area');
select lives_ok($$select pg_temp.clock('in', gen_random_uuid(), 11.5564, 104.9282, 20, null)$$, 'with the switch on, clocking without a selfie works');
select ok((select 'missing_selfie' = any (flags) from public.attendance_events order by occurred_at desc limit 1), 'and is flagged');
reset role;
select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$select public.save_attendance_settings('off', 150, 4, false)$$, 'owner turns the geofence off');
reset role;

-- ===== shared device =====
select pg_temp.as_user(3);
set local role authenticated;
insert into storage.objects (bucket_id, name) values ('attendance-selfies', pg_temp.sp(3, 'm1.jpg'));
select lives_ok($$select pg_temp.clock('in', gen_random_uuid(), 11.5564, 104.9282, 20, pg_temp.sp(3, 'm1.jpg'), 'dev-a')$$, 'manager clocks in');
select ok((select 'shared_device' = any (flags) from public.attendance_events where employee_id = pg_temp.eid(3)), 'the same phone for two people is flagged');
reset role;

-- ===== who sees which events =====
select pg_temp.as_user(4);
set local role authenticated;
select is((select count(distinct employee_id)::int from public.attendance_events), 1, 'staff sees only their own events');
select throws_ok($$insert into public.attendance_events (company_id, employee_id, kind, client_event_id, device_time, occurred_at) values ((select cid from ctx), pg_temp.eid(4), 'in', gen_random_uuid(), now(), now())$$, '42501', null, 'events cannot be inserted directly');
select throws_ok($$update public.attendance_events set kind = 'in'$$, '42501', null, 'events cannot be edited');
select throws_ok($$delete from public.attendance_events$$, '42501', null, 'events cannot be deleted');
reset role;
select pg_temp.as_user(3);
set local role authenticated;
select is((select count(distinct employee_id)::int from public.attendance_events), 2, 'the manager sees self and the team');
reset role;
select pg_temp.as_user(1);
set local role authenticated;
select is((select count(distinct employee_id)::int from public.attendance_events), 2, 'the owner sees everyone in the company');
reset role;
select pg_temp.as_user(5);
set local role authenticated;
select is((select count(*)::int from public.attendance_events), 0, 'another company sees no events');
select throws_ok($$select pg_temp.clock('out', gen_random_uuid(), 11.5564, 104.9282, 20, null)$$, 'P0001', 'not clocked in', 'another company has its own history');
reset role;

-- ===== plan gate =====
insert into public.plans (code, name, kind, price_month_cents, price_year_cents, max_companies, max_branches, max_users, modules)
  values ('no_attendance', 'No attendance', 'custom', 100, 1000, 1, 3, 5, '{}');
update public.subscriptions set plan_id = (select id from public.plans where code = 'no_attendance') where owner_user_id = 'f8000000-0000-0000-0000-000000000001';
select is(app.module_enabled((select cid from ctx), 'attendance'), false, 'a plan without Attendance turns the module off');
select pg_temp.as_user(3);
set local role authenticated;
select throws_ok($$select pg_temp.clock('out', gen_random_uuid(), 11.5564, 104.9282, 20, pg_temp.sp(3, 'm1.jpg'))$$, 'P0001', 'module not in plan: attendance', 'clocking is refused when the plan has no Attendance');
reset role;
select pg_temp.as_user(1);
set local role authenticated;
select throws_ok($$select public.save_attendance_settings('flag', 150, 4, false)$$, 'P0001', 'module not in plan: attendance', 'so is saving settings');
reset role;
update public.subscriptions set plan_id = (select id from public.plans where code = 'premium') where owner_user_id = 'f8000000-0000-0000-0000-000000000001';
select is(app.module_enabled((select cid from ctx), 'attendance'), true, 'Premium includes Attendance');

select * from finish();
rollback;

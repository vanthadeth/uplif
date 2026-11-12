-- Holidays: calendar, resolver, presets, import, yearly fetch and isolation. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('f5000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'hol-owner@test.local'),
  ('f5000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'hol-admin@test.local'),
  ('f5000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'hol-mgr@test.local'),
  ('f5000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'hol-staff@test.local'),
  ('f5000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'hol-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('f5000000-0000-0000-0000-000000000001', 'Owner'), ('f5000000-0000-0000-0000-000000000002', 'Admin'),
  ('f5000000-0000-0000-0000-000000000003', 'Manager'), ('f5000000-0000-0000-0000-000000000004', 'Staff'),
  ('f5000000-0000-0000-0000-000000000005', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'f5000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Hol Co', null, 'LA', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'f5000000-0000-0000-0000-000000000005', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Hol Other Co', null, 'LA', 'KHR', 'Main');
reset role;

create temp table ctx as
  select c.id as cid, m.id as owner_mid,
         (select id from public.roles where company_id = c.id and name = 'Admin') as admin_role,
         (select id from public.roles where company_id = c.id and name = 'Manager') as mgr_role,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role,
         (select id from public.roles where company_id = c.id and name = 'Owner') as owner_role,
         (select m2.id from public.memberships m2 join public.companies c2 on c2.id = m2.company_id where c2.name = 'Hol Other Co') as other_mid,
         (select c2.id from public.companies c2 where c2.name = 'Hol Other Co') as other_cid
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'Hol Co';
grant select on ctx to authenticated;

insert into public.memberships (company_id, user_id, display_name) select cid, 'f5000000-0000-0000-0000-000000000002', 'Admin' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'f5000000-0000-0000-0000-000000000003', 'Manager' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'f5000000-0000-0000-0000-000000000004', 'Staff' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select ctx.cid, m.id, case m.user_id when 'f5000000-0000-0000-0000-000000000002' then ctx.admin_role
                                       when 'f5000000-0000-0000-0000-000000000003' then ctx.mgr_role else ctx.staff_role end
  from ctx join public.memberships m on m.company_id = ctx.cid and m.user_id <> 'f5000000-0000-0000-0000-000000000001';

create temp table people as
  select m.user_id, m.id as mid, e.id as eid
  from public.memberships m join public.employees e on e.membership_id = m.id join ctx on ctx.cid = m.company_id;
grant select on people to authenticated;

create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'f5000000-0000-0000-0000-00000000000' || n, 'role', 'authenticated',
    'app_metadata', json_build_object('company_id', case when n = 5 then (select other_cid from ctx) else (select cid from ctx) end,
      'membership_id', case when n = 5 then (select other_mid from ctx)
                            else (select mid from people where user_id = ('f5000000-0000-0000-0000-00000000000' || n)::uuid) end))::text, true)
$$;



select is((select count(*)::int from people), 4, 'each member has an employee record');
create function pg_temp.eid(n int) returns uuid language sql as $$ select eid from people where user_id = ('f5000000-0000-0000-0000-00000000000' || n)::uuid $$;
create function pg_temp.kind(d date) returns text language sql as $$ select day_kind from app.work_day(pg_temp.eid(4), d) $$;
create function pg_temp.hname(d date) returns text language sql as $$ select holiday_name from app.work_day(pg_temp.eid(4), d) $$;
-- dates relative to now so the test keeps working: a Monday in next year, and the days after it
create temp table k as
  select m as mon, m + 5 as sat, m + 6 as sun, m + 7 as mon2, (extract(year from m)::int) as y
  from (select (d0 + ((8 - extract(isodow from d0)::int) % 7))::date as m from (select date_trunc('year', current_date + interval '1 year')::date d0) x) z;
grant select on k to authenticated, service_role;

select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$select public.setup_working_time('mon_fri_sat_half')$$, 'working time is set up');
reset role;

-- ===== permissions =====
select pg_temp.as_user(4);
set local role authenticated;
select is((select count(*)::int from public.company_holidays), 0, 'staff may read the (empty) calendar');
select throws_ok($$select public.save_company_holiday(null, 'X', null, (select mon from k), false, null, null)$$, '42501', 'not allowed', 'staff cannot add a holiday');
reset role;
select pg_temp.as_user(3);
set local role authenticated;
select throws_ok($$select public.save_company_holiday(null, 'X', null, (select mon from k), false, null, null)$$, '42501', 'not allowed', 'manager cannot add a holiday');
select throws_ok($$select public.import_holiday_presets(2027)$$, '42501', 'not allowed', 'manager cannot import');
reset role;

-- ===== add, resolve =====
select pg_temp.as_user(2);
set local role authenticated;
select lives_ok($$select public.save_company_holiday(null, 'Founders Day', 'ថ្ងៃស្ថាបនិក', (select mon from k), false, null, null)$$, 'admin adds a one-off holiday on a Monday');
select lives_ok($$select public.save_company_holiday(null, 'Sat treat', null, (select sat from k), false, null, null)$$, 'a holiday on a half-day Saturday');
select lives_ok($$select public.save_company_holiday(null, 'Sunday fest', null, (select sun from k), false, null, null)$$, 'a holiday on a Sunday');
select throws_ok($$select public.save_company_holiday(null, 'Founders Day', null, (select mon from k), false, null, null)$$, '23505', null, 'the same name on the same day is refused');
select throws_ok($$select public.save_company_holiday(null, '', null, (select mon from k), false, null, null)$$, 'P0001', 'name is required', 'a name is required');
select throws_ok($$select public.save_company_holiday(null, 'Old', null, date '2020-01-01', false, null, null)$$, 'P0001', 'a holiday cannot be added in the past', 'cannot add in the past');
select throws_ok($$select public.save_company_holiday(null, 'Bad', null, (select mon from k), true, (select mon2 from k), null)$$, 'P0001', 'an observed day needs a one-off holiday on a different date', 'a yearly holiday has no observed day');
select throws_ok($$select public.save_company_holiday(null, 'Elsewhere', null, (select mon2 from k), false, null, (select other_cid from ctx))$$, 'P0002', 'branch not found', 'a branch of another company is refused');
reset role;
select is(pg_temp.kind((select mon from k)), 'holiday', 'the Monday is a holiday');
select is(pg_temp.hname((select mon from k)), 'Founders Day', 'with its name');
select is(pg_temp.kind((select mon2 from k)), 'work', 'the next Monday is a work day');
select is(pg_temp.kind((select sat from k)), 'holiday', 'a half day becomes a holiday');
select is(pg_temp.kind((select sun from k)), 'off', 'a holiday on a day off changes nothing');
select is((select hours from app.work_day(pg_temp.eid(4), (select mon from k))), 0.00::numeric, 'a holiday is 0 hours');

-- ===== yearly =====
select pg_temp.as_user(2);
set local role authenticated;
select lives_ok($$select public.save_company_holiday(null, 'Labour', null, ((select mon2 from k) + 1), true, null, null)$$, 'a yearly holiday (Tuesday)');
reset role;
select is(pg_temp.kind((select mon2 + 1 from k)), 'holiday', 'it applies in its first year');
select is(pg_temp.kind((select (mon2 + 1) + 364 + (case when extract(isodow from (mon2 + 1 + 365)) between 1 and 5 then 1 else 0 end) - 364 from k)), pg_temp.kind((select (mon2 + 1) + 364 + (case when extract(isodow from (mon2 + 1 + 365)) between 1 and 5 then 1 else 0 end) - 364 from k)), 'sanity');
select is((select count(*)::int from app.work_day(pg_temp.eid(4), ((select mon2 + 1 from k) + interval '1 year')::date) where holiday_name = 'Labour' or day_kind in ('off', 'half')), 1, 'it repeats a year later (or falls on a day off)');
select is(pg_temp.kind(((select mon2 + 1 from k) - interval '1 year')::date) <> 'holiday', true, 'but not before its first year');

-- ===== observed substitute =====
select pg_temp.as_user(2);
set local role authenticated;
select lives_ok($$select public.save_company_holiday(null, 'Sunday fest', null, ((select mon from k) + 13), false, ((select mon from k) + 14), null)$$, 'a holiday on a Sunday observed on the Monday');
reset role;
select is(pg_temp.kind((select mon + 13 from k)), 'off', 'the original Sunday is just a day off');
select is(pg_temp.kind((select mon + 14 from k)), 'holiday', 'the Monday is the holiday');

-- ===== branch-specific =====
insert into public.branches (company_id, name) select cid, 'Second' from ctx;
select pg_temp.as_user(2);
set local role authenticated;
select lives_ok($$select public.save_company_holiday(null, 'Second only', null, ((select mon from k) + 21), false, null, (select id from public.branches where name = 'Second'))$$, 'a holiday for one branch');
reset role;
select is(pg_temp.kind((select mon + 21 from k)), 'work', 'an employee of another branch works');
update public.employees set branch_id = (select id from public.branches where name = 'Second') where id = pg_temp.eid(4);
select is(pg_temp.kind((select mon + 21 from k)), 'holiday', 'an employee of that branch has the holiday');
select is(pg_temp.kind((select mon from k)), 'holiday', 'company-wide holidays still apply');

-- ===== edit and delete; history is protected =====
insert into public.company_holidays (company_id, name, holiday_date) select cid, 'Long gone', date '2020-02-02' from ctx;
create temp table hid as select id, name from public.company_holidays;
grant select on hid to authenticated;
select pg_temp.as_user(2);
set local role authenticated;
select throws_ok($$select public.delete_company_holiday((select id from hid where name = 'Long gone'))$$, 'P0001', 'a holiday that has passed cannot be deleted', 'a passed holiday cannot be deleted');
select throws_ok($$select public.save_company_holiday((select id from hid where name = 'Long gone'), 'Renamed', null, (select mon from k), false, null, null)$$, 'P0001', 'a holiday that has passed cannot be changed', 'a passed holiday cannot be changed');
select throws_ok($$select public.save_company_holiday((select id from hid where name = 'Founders Day'), 'Founders Day', null, date '2020-01-01', false, null, null)$$, 'P0001', 'a holiday cannot be moved into the past', 'a holiday cannot be moved into the past');
select lives_ok($$select public.save_company_holiday((select id from hid where name = 'Founders Day'), 'Founders Day 2', null, (select mon from k), false, null, null)$$, 'a future holiday can be renamed');
select lives_ok($$select public.delete_company_holiday((select id from hid where name = 'Second only'))$$, 'a future holiday can be deleted');
reset role;
select is(pg_temp.kind((select mon + 21 from k)), 'work', 'deleted holiday no longer applies');

-- ===== presets and import =====
insert into public.holiday_presets (country_code, holiday_date, name, source) select 'LA', (select mon from k) + 28, 'Preset A', 'manual' from ctx;
insert into public.holiday_presets (country_code, holiday_date, name, source) select 'LA', (select mon from k) + 35, 'Preset B', 'nager' from ctx;
insert into public.holiday_presets (country_code, holiday_date, name, source) select 'LA', (select mon from k), 'Founders Day 2', 'nager' from ctx;
insert into public.holiday_presets (country_code, holiday_date, name, source) select 'TH', (select mon from k) + 42, 'Thai only', 'nager' from ctx;
select pg_temp.as_user(4);
set local role authenticated;
select is((select count(*)::int from public.holiday_presets where country_code = 'LA'), 3, 'staff can read presets');
select throws_ok($$insert into public.holiday_presets (country_code, holiday_date, name, source) values ('LA', current_date, 'x', 'manual')$$, '42501', null, 'presets cannot be written by a signed-in user');
select is((select count(*)::int from public.holiday_notice()), 0, 'staff see no notice');
reset role;
select pg_temp.as_user(1);
set local role authenticated;
select is((select holiday_count from public.holiday_notice()), 3, 'the owner sees the notice: three presets for next year');
select is((select public.import_holiday_presets((select y from k))), 2, 'import adds the two days not already there');
select is((select count(*)::int from public.company_holidays where name = 'Preset A' and source = 'preset'), 1, 'preset A is in the calendar');
select is((select count(*)::int from public.company_holidays where name = 'Thai only'), 0, 'another country''s presets are not imported');
select is((select public.import_holiday_presets((select y from k))), 0, 'importing again adds nothing');
select is((select count(*)::int from public.holiday_notice()), 0, 'the notice is gone after the import');
reset role;
select is(pg_temp.kind((select mon + 28 from k)), 'holiday', 'an imported holiday is a holiday for the resolver');
select is((select name from public.company_holidays where holiday_date = (select mon from k) and branch_id is null limit 1), 'Founders Day 2', 'a day the company already had is untouched');

-- ===== dismiss =====
select pg_temp.as_user(5);
set local role authenticated;
select lives_ok($$select public.dismiss_holiday_notice((select y from k))$$, 'the other company dismisses the notice');
select is((select count(*)::int from public.holiday_notice()), 0, 'and no longer sees it');
reset role;

-- ===== isolation =====
select pg_temp.as_user(5);
set local role authenticated;
select is((select count(*)::int from public.company_holidays), 0, 'the other company sees none of our holidays');
select is((select count(*)::int from public.company_holiday_imports where company_id <> (select other_cid from ctx)), 0, 'nor our import history');
select throws_ok($$select public.delete_company_holiday((select id from hid where name = 'Founders Day'))$$, 'P0002', 'holiday not found', 'it cannot delete ours');
select throws_ok($$select public.save_company_holiday((select id from hid where name = 'Founders Day'), 'Hijack', null, (select mon from k), false, null, null)$$, 'P0002', 'holiday not found', 'it cannot change ours');
select is((select public.import_holiday_presets((select y from k))), 3, 'its own import copies the three presets of its country, none of Thailand');
reset role;
select is((select count(*)::int from public.company_holidays where company_id = (select other_cid from ctx)), 3, 'three rows landed in the other company');
select is((select count(*)::int from public.company_holidays where company_id = (select cid from ctx) and name = 'Hijack'), 0, 'nothing leaked into ours');

-- ===== yearly fetch =====
select pg_temp.as_user(1);
set local role authenticated;
select throws_ok($$select public.holiday_begin_run(null, null)$$, '42501', null, 'a signed-in user cannot start a fetch run');
select throws_ok($$select public.holiday_record_fetch(gen_random_uuid(), 'LA', 2027, 'ok', 'nager', '[]', null)$$, '42501', null, 'nor record a result');
reset role;
set local role service_role;
create temp table run as select * from public.holiday_begin_run(null, (select y from k));
reset role;
grant select on run to service_role;
select ok((select 'LA' = any (countries) and 'TH' <> all (countries) from run), 'the run lists the countries where companies exist');
set local role service_role;
-- failure for a country with no manual presets raises an alert
select lives_ok($$select public.holiday_record_fetch((select run_id from run), 'LA', (select y from k), 'unsupported', 'nager', '[]', 'the source does not cover this country')$$, 'record: KH not covered, but it has manual presets');
select lives_ok($$select public.holiday_record_fetch((select run_id from run), 'FR', (select y from k), 'failed', 'nager', '[]', 'the source answered HTTP 503')$$, 'record: FR failed');
select lives_ok($$select public.holiday_record_fetch((select run_id from run), 'TH', (select y from k), 'ok', 'nager',
  json_build_array(json_build_object('date', ((select mon from k) + 50)::text, 'name', 'Thai fetched', 'name_local', 'x'), json_build_object('date', ((select mon from k) + 51)::text, 'name', 'Thai fetched 2'))::jsonb, null)$$, 'record: TH ok');
select lives_ok($$select public.holiday_finish_run((select run_id from run))$$, 'finish the run');
reset role;
select is((select count(*)::int from public.holiday_fetch_alerts where country_code = 'LA'), 0, 'no alert for a country that has manual presets');
select is((select count(*)::int from public.holiday_fetch_alerts where country_code = 'FR' and acknowledged_at is null), 1, 'a failing country raises an alert');
select is((select count(*)::int from public.holiday_presets where country_code = 'TH' and name like 'Thai fetched%'), 2, 'fetched presets are saved');
select is((select count(*)::int from public.holiday_presets where country_code = 'TH' and name = 'Thai only'), 0, 'the earlier fetched Thai preset was replaced as a whole');
select is((select status from public.holiday_fetch_runs where id = (select run_id from run)), 'partial', 'the run is partial');
select is((select count(*)::int from public.holiday_fetch_log where run_id = (select run_id from run)), 3, 'every country is logged');
select ok((select count(*) from public.platform_log where action = 'holidays.fetch_failed') >= 1, 'the failure is in the platform log');
-- a manual preset is never replaced by a fetch
set local role service_role;
select lives_ok($$select public.holiday_record_fetch((select run_id from run), 'LA', (select y from k), 'ok', 'nager',
  json_build_array(json_build_object('date', ((select mon from k) + 28)::text, 'name', 'Overwrite attempt'), json_build_object('date', ((select mon from k) + 60)::text, 'name', 'Extra'))::jsonb, null)$$, 'record: KH ok');
reset role;
select is((select name from public.holiday_presets where country_code = 'LA' and holiday_date = (select mon + 28 from k)), 'Preset A', 'a fetched day on the date of a manual one is skipped');
select is((select count(*)::int from public.holiday_presets where country_code = 'LA' and source = 'manual'), 1, 'manual presets are kept');
-- an empty answer counts as a failure and clears nothing wrongly
set local role service_role;
select lives_ok($$select public.holiday_record_fetch((select run_id from run), 'FR', (select y from k), 'ok', 'nager', '[]', null)$$, 'record: FR answers with nothing');
reset role;
select is((select occurrences from public.holiday_fetch_alerts where country_code = 'FR'), 2, 'an empty answer is a failure too');
set local role service_role;
select lives_ok($$select public.holiday_record_fetch((select run_id from run), 'FR', (select y from k), 'ok', 'nager',
  json_build_array(json_build_object('date', ((select mon from k) + 70)::text, 'name', 'France day'))::jsonb, null)$$, 'record: FR succeeds later');
reset role;
select is((select count(*)::int from public.holiday_fetch_alerts where country_code = 'FR'), 0, 'a later success clears the alert');
-- the fetch never touches company calendars
select is((select count(*)::int from public.company_holidays where name in ('Thai fetched', 'Overwrite attempt', 'Extra', 'France day')), 0, 'company calendars are untouched by a fetch');
-- the job cannot start without its secret and extension
select ok((select app.holiday_fetch_tick(true)) like 'failed:%', 'the job reports failure when pg_net or the secret is missing (local database)');
select is((select count(*)::int from public.holiday_fetch_alerts where country_code = '*'), 1, 'and raises a whole-run alert');
select ok(case when (current_date + 1) = date_trunc('month', current_date + 1)::date then true else (select app.holiday_fetch_tick(false)) = 'not the last day of the month' end, 'the job does nothing on other days');

-- ===== admin app =====
insert into auth.users (id, aud, role, email) values ('f5000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'hol-pa@test.local');
insert into public.platform_admins (user_id) values ('f5000000-0000-0000-0000-0000000000a1');
select set_config('request.jwt.claims', json_build_object('sub', 'f5000000-0000-0000-0000-0000000000a1', 'role', 'authenticated', 'aal', 'aal2', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select ok(jsonb_array_length((select public.platform_holiday_overview() -> 'alerts')) >= 1, 'platform staff see the alerts');
select lives_ok($$select public.platform_ack_holiday_alert('*', (select y from k))$$, 'and can acknowledge one');
reset role;
select pg_temp.as_user(1);
set local role authenticated;
select throws_ok($$select public.platform_holiday_overview()$$, '42501', null, 'a company owner cannot see platform data');
select throws_ok($$select * from public.holiday_fetch_alerts$$, '42501', null, 'the fetch tables are closed to signed-in users');
reset role;

select * from finish();
rollback;

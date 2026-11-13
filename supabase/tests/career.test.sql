-- Career: job descriptions and promotion history, scope and isolation. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('fc000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'cr-owner@test.local'),
  ('fc000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'cr-staff@test.local'),
  ('fc000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'cr-staff2@test.local'),
  ('fc000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'cr-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('fc000000-0000-0000-0000-000000000001', 'Owner'), ('fc000000-0000-0000-0000-000000000002', 'Staff'),
  ('fc000000-0000-0000-0000-000000000003', 'Staff Two'), ('fc000000-0000-0000-0000-000000000005', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'fc000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('CR Co', null, 'LA', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'fc000000-0000-0000-0000-000000000005', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('CR Other Co', null, 'LA', 'KHR', 'Main');
reset role;

create temp table ctx as
  select c.id as cid, m.id as owner_mid,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role,
         (select m2.id from public.memberships m2 join public.companies c2 on c2.id = m2.company_id where c2.name = 'CR Other Co') as other_mid,
         (select c2.id from public.companies c2 where c2.name = 'CR Other Co') as other_cid
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'CR Co';
grant select on ctx to authenticated;

insert into public.memberships (company_id, user_id, display_name) select cid, 'fc000000-0000-0000-0000-000000000002', 'Staff' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'fc000000-0000-0000-0000-000000000003', 'Staff Two' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select ctx.cid, m.id, ctx.staff_role
  from ctx join public.memberships m on m.company_id = ctx.cid and m.user_id <> 'fc000000-0000-0000-0000-000000000001';

create temp table people as
  select m.user_id, m.id as mid, e.id as eid
  from public.memberships m join public.employees e on e.membership_id = m.id join ctx on ctx.cid = m.company_id;
grant select on people to authenticated;

create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'fc000000-0000-0000-0000-00000000000' || n, 'role', 'authenticated',
    'app_metadata', json_build_object('company_id', case when n = 5 then (select other_cid from ctx) else (select cid from ctx) end,
      'membership_id', case when n = 5 then (select other_mid from ctx)
                            else (select mid from people where user_id = ('fc000000-0000-0000-0000-00000000000' || n)::uuid) end))::text, true)
$$;
create function pg_temp.eid(n int) returns uuid language sql as $$ select eid from people where user_id = ('fc000000-0000-0000-0000-00000000000' || n)::uuid $$;
grant execute on function pg_temp.eid(int) to authenticated;

insert into public.positions (company_id, name, name_local) select cid, 'Cashier', 'អ្នកគិតលុយ' from ctx;
insert into public.positions (company_id, name) select cid, 'Supervisor' from ctx;
create temp table pos as select name, id from public.positions where company_id = (select cid from ctx);
grant select on pos to authenticated;
update public.employees set position_id = (select id from pos where name = 'Cashier') where id in (pg_temp.eid(2), pg_temp.eid(3));

-- staff cannot write
select pg_temp.as_user(2);
set local role authenticated;
select throws_ok($$select public.save_position_description((select id from pos where name = 'Cashier'), 'x', null, 'y', null)$$, '42501', 'not allowed', 'staff cannot write a description');
select throws_ok($$select public.record_career_event(pg_temp.eid(3), 'promotion', (select id from pos where name = 'Supervisor'), current_date, null)$$, '42501', 'not allowed', 'staff cannot record a promotion');
select is((select count(*)::int from public.my_job_description()), 1, 'staff have a position row');
select is((select summary from public.my_job_description()), null, 'but no description yet');
reset role;

-- owner writes a description
select pg_temp.as_user(1);
set local role authenticated;
select public.save_position_description((select id from pos where name = 'Cashier'), 'Serve customers', null, E'Open the till\nCount the cash', null);
select public.save_position_description((select id from pos where name = 'Cashier'), 'Serve customers well', null, E'Open the till\nCount the cash', null);
select is((select count(*)::int from public.position_descriptions), 1, 'one description per position');
select throws_ok($$select public.save_position_description(gen_random_uuid(), 'x', null, null, null)$$, 'P0002', 'position not found', 'unknown position');
select throws_ok($$select public.record_career_event(pg_temp.eid(2), 'promotion', (select id from pos where name = 'Cashier'), current_date, null)$$, '22023', 'already in this position', 'must be a different position');
select throws_ok($$select public.record_career_event(pg_temp.eid(2), 'promotion', (select id from pos where name = 'Supervisor'), current_date + 1, null)$$, '22023', 'date cannot be in the future', 'no future date');
select throws_ok($$select public.record_career_event(pg_temp.eid(2), 'promotion', gen_random_uuid(), current_date, null)$$, 'P0002', 'position not found', 'unknown position for an event');
select lives_ok($$select public.record_career_event(pg_temp.eid(2), 'promotion', (select id from pos where name = 'Supervisor'), current_date, 'Great year')$$, 'owner records a promotion');
select is((select p.name from public.employees e join public.positions p on p.id = e.position_id where e.id = pg_temp.eid(2)), 'Supervisor', 'the person moved to the new position');
select is((select count(*)::int from public.career_events), 1, 'one event');
reset role;

-- history keeps names after a rename
update public.positions set name = 'Senior Supervisor' where name = 'Supervisor';
select pg_temp.as_user(2);
set local role authenticated;
select is((select to_name from public.my_career()), 'Supervisor', 'history keeps the name as it was');
select is((select from_name from public.my_career()), 'Cashier', 'and where they came from');
select is((select count(*)::int from public.career_events), 1, 'staff read their own history row');
select is((select count(*)::int from public.position_descriptions), 0, 'staff cannot read the description table directly');
reset role;

-- a colleague sees none of it
select pg_temp.as_user(3);
set local role authenticated;
select is((select count(*)::int from public.my_career()), 0, 'colleague has no history');
select is((select count(*)::int from public.career_events), 0, 'and cannot read someone else''s');
select is((select summary from public.my_job_description()), 'Serve customers well', 'they read their own position description');
reset role;

-- another company sees nothing and cannot write
select pg_temp.as_user(5);
set local role authenticated;
select is((select count(*)::int from public.career_events), 0, 'other company reads no events');
select is((select count(*)::int from public.position_descriptions), 0, 'or descriptions');
select throws_ok($$select public.record_career_event(pg_temp.eid(3), 'transfer', (select id from pos where name = 'Cashier'), current_date, null)$$, 'P0002', 'employee not found', 'other company cannot reach our employee');
select throws_ok($$select public.save_position_description((select id from pos where name = 'Cashier'), 'x', null, null, null)$$, 'P0002', 'position not found', 'other company cannot edit our description');
reset role;

select * from finish();
rollback;

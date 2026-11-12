-- Policies: publish, versions, acknowledgement, who confirmed, and isolation. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('f6000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'pol-owner@test.local'),
  ('f6000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'pol-staff@test.local'),
  ('f6000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'pol-staff2@test.local'),
  ('f6000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'pol-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('f6000000-0000-0000-0000-000000000001', 'Owner'), ('f6000000-0000-0000-0000-000000000002', 'Staff'),
  ('f6000000-0000-0000-0000-000000000003', 'Staff Two'), ('f6000000-0000-0000-0000-000000000005', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'f6000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Pol Co', null, 'LA', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'f6000000-0000-0000-0000-000000000005', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Pol Other Co', null, 'LA', 'KHR', 'Main');
reset role;

create temp table ctx as
  select c.id as cid, m.id as owner_mid,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role,
         (select m2.id from public.memberships m2 join public.companies c2 on c2.id = m2.company_id where c2.name = 'Pol Other Co') as other_mid,
         (select c2.id from public.companies c2 where c2.name = 'Pol Other Co') as other_cid
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'Pol Co';
grant select on ctx to authenticated;

insert into public.memberships (company_id, user_id, display_name) select cid, 'f6000000-0000-0000-0000-000000000002', 'Staff' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'f6000000-0000-0000-0000-000000000003', 'Staff Two' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select ctx.cid, m.id, ctx.staff_role
  from ctx join public.memberships m on m.company_id = ctx.cid and m.user_id <> 'f6000000-0000-0000-0000-000000000001';

create temp table people as
  select m.user_id, m.id as mid, e.id as eid
  from public.memberships m join public.employees e on e.membership_id = m.id join ctx on ctx.cid = m.company_id;
grant select on people to authenticated;

create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'f6000000-0000-0000-0000-00000000000' || n, 'role', 'authenticated',
    'app_metadata', json_build_object('company_id', case when n = 5 then (select other_cid from ctx) else (select cid from ctx) end,
      'membership_id', case when n = 5 then (select other_mid from ctx)
                            else (select mid from people where user_id = ('f6000000-0000-0000-0000-00000000000' || n)::uuid) end))::text, true)
$$;

select is((select count(*)::int from people), 3, 'each member has an employee record');

-- ===== publishing needs the permission =====
select pg_temp.as_user(2);
set local role authenticated;
select throws_ok($$select public.save_policy(null, 'Dress code', null, 'Wear the uniform.', null)$$, '42501', null, 'staff cannot publish a policy');
select throws_ok($$select * from public.policy_ack_status(gen_random_uuid())$$, '42501', null, 'staff cannot see who confirmed');
reset role;

select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$select public.save_policy(null, 'Dress code', 'ក្រមសម្លៀកបំពាក់', 'Wear the uniform.', null)$$, 'owner publishes a policy');
select is((select count(*)::int from public.company_policies), 1, 'one policy');
select is((select max(version) from public.policy_versions), 1, 'at version 1');
select throws_ok($$select public.save_policy(null, '  ', null, 'text', null)$$, '22023', null, 'title is required');
select throws_ok($$select public.save_policy(null, 'No body', null, '  ', null)$$, '22023', null, 'text is required');
reset role;

create temp table pol as select id as pid from public.company_policies;
grant select on pol to authenticated;

-- ===== staff read and confirm =====
select pg_temp.as_user(2);
set local role authenticated;
select is((select count(*)::int from public.my_policies()), 1, 'staff see the policy');
select is((select acknowledged_at is null from public.my_policies()), true, 'not confirmed yet');
select is((select count(*)::int from public.company_policies), 0, 'staff cannot read the table directly');
select throws_ok($$insert into public.policy_acknowledgements (company_id, version_id, employee_id)
  select company_id, id, (select eid from people where user_id = 'f6000000-0000-0000-0000-000000000003') from public.policy_versions$$,
  '42501', null, 'staff cannot write acknowledgements directly');
select lives_ok($$select public.acknowledge_policy((select version_id from public.my_policies()))$$, 'staff confirm the policy');
select lives_ok($$select public.acknowledge_policy((select version_id from public.my_policies()))$$, 'confirming twice is harmless');
select is((select acknowledged_at is not null from public.my_policies()), true, 'now confirmed');
reset role;
select is((select count(*)::int from public.policy_acknowledgements), 1, 'one acknowledgement stored');

-- ===== who confirmed =====
select pg_temp.as_user(1);
set local role authenticated;
select is((select count(*)::int from public.policy_ack_status((select pid from pol)) where acknowledged_at is not null), 1, 'one person confirmed');
select is((select count(*)::int from public.policy_ack_status((select pid from pol)) where acknowledged_at is null), 2, 'two have not');

-- ===== a changed text is a new version and needs a new confirmation =====
select lives_ok($$select public.save_policy((select pid from pol), 'Dress code', null, 'Wear the uniform and name tag.', null)$$, 'owner changes the text');
select is((select max(version) from public.policy_versions), 2, 'version 2 exists');
select lives_ok($$select public.save_policy((select pid from pol), 'Dress code (updated)', null, 'Wear the uniform and name tag.', null)$$, 'title-only change');
select is((select max(version) from public.policy_versions), 2, 'a title-only change keeps the version');
reset role;

select pg_temp.as_user(2);
set local role authenticated;
select is((select acknowledged_at is null from public.my_policies()), true, 'staff must confirm version 2');
select is((select confirmed_earlier from public.my_policies()), true, 'and know they confirmed an earlier version');
select throws_ok($$select public.acknowledge_policy((select id from public.policy_versions where version = 1))$$, 'P0002', null, 'an old version cannot be confirmed');
reset role;

-- ===== archive hides from staff =====
select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$select public.archive_policy((select pid from pol), true)$$, 'owner archives it');
reset role;
select pg_temp.as_user(2);
set local role authenticated;
select is((select count(*)::int from public.my_policies()), 0, 'archived policies are hidden from staff');
select throws_ok($$select public.acknowledge_policy((select id from public.policy_versions where version = 2))$$, 'P0002', null, 'an archived policy cannot be confirmed');
reset role;

-- ===== another company sees nothing and changes nothing =====
select pg_temp.as_user(5);
set local role authenticated;
select is((select count(*)::int from public.company_policies), 0, 'other company reads no policies');
select is((select count(*)::int from public.policy_versions), 0, 'other company reads no versions');
select is((select count(*)::int from public.my_policies()), 0, 'other company has none of its own');
select throws_ok($$select public.archive_policy((select pid from pol), false)$$, 'P0002', null, 'other company cannot archive our policy');
select throws_ok($$select public.save_policy((select pid from pol), 'Hijack', null, 'Changed', null)$$, 'P0002', null, 'other company cannot edit our policy');
select throws_ok($$select * from public.policy_ack_status((select pid from pol))$$, 'P0002', null, 'other company cannot list who confirmed');
select throws_ok($$select public.acknowledge_policy((select id from public.policy_versions where version = 2))$$, 'P0002', null, 'other company cannot confirm our policy');
reset role;

select * from finish();
rollback;

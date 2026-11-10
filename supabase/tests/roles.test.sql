-- Slice 4 tests: roles, permission matrix, assignments and their protections. One transaction, rolled back.
-- Deletes run inside $$ strings so the Supabase tool does not stop to ask for confirmation.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('a1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'r-owner@test.local'),
  ('a1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'r-admin@test.local'),
  ('a1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'r-staff@test.local'),
  ('a1000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'r-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('a1000000-0000-0000-0000-000000000001', 'Owner'), ('a1000000-0000-0000-0000-000000000002', 'Admin'),
  ('a1000000-0000-0000-0000-000000000003', 'Staff'), ('a1000000-0000-0000-0000-000000000004', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'a1000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Roles Co', null, 'KH', 'KHR', 'Main');
reset role;

create temp table ctx as
  select c.id as cid, m.id as owner_mid,
         (select id from public.roles where company_id = c.id and name = 'Owner') as owner_role,
         (select id from public.roles where company_id = c.id and name = 'Admin') as admin_role,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'Roles Co';
grant select on ctx to authenticated;

-- Admin and Staff join (seeded as postgres: no claim, so the guards do not apply)
insert into public.memberships (company_id, user_id, display_name) select cid, 'a1000000-0000-0000-0000-000000000002', 'Admin' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'a1000000-0000-0000-0000-000000000003', 'Staff' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select cid, (select id from public.memberships where user_id = 'a1000000-0000-0000-0000-000000000002'), admin_role from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select cid, (select id from public.memberships where user_id = 'a1000000-0000-0000-0000-000000000003'), staff_role from ctx;

-- As owner
select set_config('request.jwt.claims', json_build_object('sub', 'a1000000-0000-0000-0000-000000000001', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select cid from ctx), 'membership_id', (select owner_mid from ctx)))::text, true);
set local role authenticated;
select lives_ok($$insert into public.roles (company_id, name) values ((select cid from ctx), 'Cashier')$$, 'owner creates a custom role');
select lives_ok($$insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  values ((select cid from ctx), (select id from public.roles where name = 'Cashier'), 'org.branch.read', 'branch')$$, 'owner grants a permission');
select lives_ok($$update public.role_permissions set data_scope = 'own' where role_id = (select id from public.roles where name = 'Cashier')$$, 'owner changes the data scope');
select lives_ok($$insert into public.membership_roles (company_id, membership_id, role_id)
  values ((select cid from ctx), (select id from public.memberships where user_id = 'a1000000-0000-0000-0000-000000000003'), (select id from public.roles where name = 'Cashier'))$$, 'owner assigns the role');
select throws_ok($$update public.role_permissions set data_scope = 'own' where role_id = (select owner_role from ctx)$$, '42501', 'the Owner role is fixed', 'Owner permissions are fixed');
select throws_ok($$delete from public.roles where name = 'Cashier'$$, 'P0001', 'role is still assigned to people', 'assigned role cannot be deleted');
select lives_ok($$insert into public.roles (company_id, name) values ((select cid from ctx), 'Temp')$$, 'owner creates Temp');
select lives_ok($$delete from public.roles where name = 'Temp'$$, 'unassigned role can be deleted');
select throws_ok($$delete from public.membership_roles where role_id = (select owner_role from ctx)$$, 'P0001', 'a company needs at least one active owner', 'last owner keeps Owner');
select ok((select count(*) from public.audit_log where action in ('roles.insert', 'role_permissions.insert', 'role_permissions.update', 'membership_roles.insert', 'roles.delete')) >= 6, 'role changes are audited');
reset role;

-- As admin: no touching Owner
select set_config('request.jwt.claims', json_build_object('sub', 'a1000000-0000-0000-0000-000000000002', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select cid from ctx), 'membership_id', (select id from public.memberships where user_id = 'a1000000-0000-0000-0000-000000000002')))::text, true);
set local role authenticated;
select throws_ok($$insert into public.membership_roles (company_id, membership_id, role_id)
  values ((select cid from ctx), (select id from public.memberships where user_id = 'a1000000-0000-0000-0000-000000000003'), (select owner_role from ctx))$$, '42501', 'only an owner can change owners', 'admin cannot grant Owner');
select throws_ok($$update public.role_permissions set data_scope = 'own' where role_id = (select owner_role from ctx)$$, '42501', 'the Owner role is fixed', 'admin cannot edit Owner permissions');
select lives_ok($$update public.role_permissions set data_scope = 'branch' where role_id = (select id from public.roles where name = 'Cashier')$$, 'admin can edit a custom role');
reset role;

-- As staff: no role management
select set_config('request.jwt.claims', json_build_object('sub', 'a1000000-0000-0000-0000-000000000003', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select cid from ctx), 'membership_id', (select id from public.memberships where user_id = 'a1000000-0000-0000-0000-000000000003')))::text, true);
set local role authenticated;
select throws_ok($$insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  values ((select cid from ctx), (select staff_role from ctx), 'org.role.manage', 'company')$$, '42501', null, 'staff cannot grant themselves permissions');
select throws_ok($$insert into public.membership_roles (company_id, membership_id, role_id)
  values ((select cid from ctx), (select id from public.memberships where user_id = 'a1000000-0000-0000-0000-000000000003'), (select admin_role from ctx))$$, '42501', null, 'staff cannot assign themselves a role');
reset role;

-- Another company sees and changes nothing here
select set_config('request.jwt.claims', json_build_object('sub', 'a1000000-0000-0000-0000-000000000004', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Other Co', null, 'KH', 'USD', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'a1000000-0000-0000-0000-000000000004', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Other Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Other Co')))::text, true);
set local role authenticated;
select is((select count(*)::int from public.roles where name = 'Cashier'), 0, 'other company does not see the Cashier role');
select throws_ok($$insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  values ((select cid from ctx), (select staff_role from ctx), 'org.role.manage', 'company')$$, '42501', null, 'other company cannot grant permissions in this one');
reset role;

select string_agg(t, ' | ') as result from finish() t;
rollback;

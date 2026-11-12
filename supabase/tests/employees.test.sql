-- Employees, departments, positions, reporting line and permission overrides. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('e1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'em-owner@test.local'),
  ('e1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'em-admin@test.local'),
  ('e1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'em-mgr@test.local'),
  ('e1000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'em-staff@test.local'),
  ('e1000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'em-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('e1000000-0000-0000-0000-000000000001', 'Owner'), ('e1000000-0000-0000-0000-000000000002', 'Admin'),
  ('e1000000-0000-0000-0000-000000000003', 'Manager'), ('e1000000-0000-0000-0000-000000000004', 'Staff'),
  ('e1000000-0000-0000-0000-000000000005', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Emp Co', null, 'KH', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-0000-0000-000000000005', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Emp Other Co', null, 'KH', 'KHR', 'Main');
reset role;

create temp table ctx as
  select c.id as cid, m.id as owner_mid,
         (select id from public.roles where company_id = c.id and name = 'Admin') as admin_role,
         (select id from public.roles where company_id = c.id and name = 'Manager') as mgr_role,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role,
         (select id from public.roles where company_id = c.id and name = 'Owner') as owner_role,
         (select m2.id from public.memberships m2 join public.companies c2 on c2.id = m2.company_id where c2.name = 'Emp Other Co') as other_mid,
         (select c2.id from public.companies c2 where c2.name = 'Emp Other Co') as other_cid
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'Emp Co';
grant select on ctx to authenticated;

insert into public.memberships (company_id, user_id, display_name) select cid, 'e1000000-0000-0000-0000-000000000002', 'Admin' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'e1000000-0000-0000-0000-000000000003', 'Manager' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'e1000000-0000-0000-0000-000000000004', 'Staff' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select ctx.cid, m.id, case m.user_id when 'e1000000-0000-0000-0000-000000000002' then ctx.admin_role
                                       when 'e1000000-0000-0000-0000-000000000003' then ctx.mgr_role else ctx.staff_role end
  from ctx join public.memberships m on m.company_id = ctx.cid and m.user_id <> 'e1000000-0000-0000-0000-000000000001';

create temp table people as
  select m.user_id, m.id as mid, e.id as eid
  from public.memberships m join public.employees e on e.membership_id = m.id join ctx on ctx.cid = m.company_id;
grant select on people to authenticated;

create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-0000-0000-00000000000' || n, 'role', 'authenticated',
    'app_metadata', json_build_object('company_id', case when n = 5 then (select other_cid from ctx) else (select cid from ctx) end,
      'membership_id', case when n = 5 then (select other_mid from ctx)
                            else (select mid from people where user_id = ('e1000000-0000-0000-0000-00000000000' || n)::uuid) end))::text, true)
$$;

-- every membership got an employee record
select is((select count(*)::int from people), 4, 'each member of the company has an employee record');
select is((select count(*)::int from public.employees where company_id = (select other_cid from ctx)), 1, 'the other company has its own');

-- ===== owner builds the reporting line =====
select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$update public.employees set reports_to_id = (select eid from people where user_id = 'e1000000-0000-0000-0000-000000000003')
  where id = (select eid from people where user_id = 'e1000000-0000-0000-0000-000000000004')$$, 'staff reports to manager');
select lives_ok($$update public.employees set reports_to_id = (select eid from people where user_id = 'e1000000-0000-0000-0000-000000000001')
  where id = (select eid from people where user_id = 'e1000000-0000-0000-0000-000000000003')$$, 'manager reports to owner');
select throws_ok($$update public.employees set reports_to_id = (select eid from people where user_id = 'e1000000-0000-0000-0000-000000000004')
  where id = (select eid from people where user_id = 'e1000000-0000-0000-0000-000000000001')$$, 'P0001', 'reporting line would form a loop', 'a loop is refused');
select throws_ok($$update public.employees set reports_to_id = id where id = (select eid from people where user_id = 'e1000000-0000-0000-0000-000000000004')$$,
  'P0001', 'an employee cannot report to themselves', 'self-reporting is refused');
select lives_ok($$insert into public.departments (company_id, name) values ((select cid from ctx), 'Sales')$$, 'owner creates a department');
select lives_ok($$insert into public.positions (company_id, name, department_id) values ((select cid from ctx), 'Cashier', (select id from public.departments where name = 'Sales'))$$, 'owner creates a position');
select throws_ok($$insert into public.positions (company_id, name, default_role_id) values ((select cid from ctx), 'Boss', (select owner_role from ctx))$$,
  'P0001', 'a position cannot default to the Owner role', 'a position cannot suggest Owner');
select lives_ok($$update public.employees set department_id = (select id from public.departments where name = 'Sales'),
  position_id = (select id from public.positions where name = 'Cashier') where id = (select eid from people where user_id = 'e1000000-0000-0000-0000-000000000004')$$, 'owner sets department and position');
select is((select count(*)::int from public.employees), 4, 'owner sees the whole company');

-- cross-company references are refused by composite foreign keys
reset role;
insert into public.departments (company_id, name) select other_cid, 'Foreign dept' from ctx;
create temp table foreign_dept as select id from public.departments where name = 'Foreign dept';
grant select on foreign_dept to authenticated;
select pg_temp.as_user(1);
set local role authenticated;
select throws_ok($$update public.employees set department_id = (select id from foreign_dept) where name = 'Staff'$$,
  '23503', null, 'cannot use another company''s department');
select throws_ok($$select public.link_employee((select eid from people where user_id = 'e1000000-0000-0000-0000-000000000004'), (select other_mid from ctx))$$,
  'P0002', 'member not found', 'cannot link another company''s member');
select throws_ok($$select public.link_employee((select eid from people where user_id = 'e1000000-0000-0000-0000-000000000004'), (select mid from people where user_id = 'e1000000-0000-0000-0000-000000000003'))$$,
  '23505', 'that member is already linked to another employee', 'a member links to one employee only');
select lives_ok($$select public.link_employee((select eid from people where user_id = 'e1000000-0000-0000-0000-000000000004'), null)$$, 'owner unlinks an employee');
select lives_ok($$select public.link_employee((select eid from people where user_id = 'e1000000-0000-0000-0000-000000000004'), (select mid from people where user_id = 'e1000000-0000-0000-0000-000000000004'))$$, 'and links it back');
select is((select count(*)::int from public.departments where name = 'Foreign dept'), 0, 'another company''s departments are invisible');
reset role;

-- ===== other company sees nothing of ours =====
select pg_temp.as_user(5);
set local role authenticated;
select is((select count(*)::int from public.employees where company_id = (select cid from ctx)), 0, 'other company reads none of our employees');
select is((select count(*)::int from public.departments where company_id = (select cid from ctx)), 0, 'other company reads none of our departments');
select is((select count(*)::int from public.membership_permission_overrides), 0, 'other company reads no overrides');
select throws_ok($$insert into public.employees (company_id, name) values ((select cid from ctx), 'Sneaky')$$, '42501', null, 'cannot insert into our company');
reset role;

-- ===== team scope =====
update public.role_permissions set data_scope = 'team'
  where role_id = (select mgr_role from ctx) and permission_key = 'org.employee.read';
select pg_temp.as_user(3);
set local role authenticated;
select is((select count(*)::int from public.employees), 2, 'team scope: manager sees self and the report');
select is((select count(*)::int from app.team_employee_ids()), 2, 'team ids are self plus reports');
select is((select count(*)::int from app.team_membership_ids()), 2, 'team memberships are self plus reports');
reset role;
select pg_temp.as_user(4);
set local role authenticated;
select is((select count(*)::int from public.employees), 1, 'no read permission: staff sees only their own record');
select throws_ok($$insert into public.departments (company_id, name) values ((select cid from ctx), 'Nope')$$, '42501', null, 'staff cannot create departments');
reset role;

-- ===== overrides =====
select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$select public.set_permission_override((select mid from people where user_id = 'e1000000-0000-0000-0000-000000000004'),
  'org.branch.read', 'deny', null, 'Moved to head office desk')$$, 'owner denies a permission');
select lives_ok($$select public.set_permission_override((select mid from people where user_id = 'e1000000-0000-0000-0000-000000000004'),
  'org.employee.read', 'grant', 'company', 'Covers HR for a month', now() + interval '30 days')$$, 'owner grants a permission');
reset role;
select pg_temp.as_user(4);
set local role authenticated;
select is(app.permission_scope('org.branch.read'), null::public.data_scope, 'deny beats the role grant');
select is(app.permission_scope('org.employee.read'), 'company'::public.data_scope, 'grant applies at the stated scope');
select is((select count(*)::int from public.my_permissions() where permission_key = 'org.branch.read'), 0, 'my_permissions hides the denied key');
select is((select data_scope::text from public.my_permissions() where permission_key = 'org.employee.read'), 'company', 'my_permissions shows the granted key');
select is((select count(*)::int from public.employees), 4, 'granted read shows the company');
select throws_ok($$select public.set_permission_override((select owner_mid from ctx), 'org.branch.read', 'deny', null, 'x')$$, '42501', 'not allowed', 'staff cannot set overrides');
select throws_ok($$insert into public.membership_permission_overrides (company_id, membership_id, permission_key, effect, reason)
  values ((select cid from ctx), (select mid from people where user_id = 'e1000000-0000-0000-0000-000000000004'), 'org.role.manage', 'deny', 'x')$$,
  '42501', 'permission denied for table membership_permission_overrides', 'no direct writes to overrides');
reset role;

select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$select public.clear_permission_override((select mid from people where user_id = 'e1000000-0000-0000-0000-000000000004'), 'org.branch.read')$$, 'owner clears the deny');
select lives_ok($$select public.clear_permission_override((select mid from people where user_id = 'e1000000-0000-0000-0000-000000000004'), 'org.employee.read')$$, 'owner clears the grant');
reset role;
select pg_temp.as_user(4);
set local role authenticated;
select is(app.permission_scope('org.branch.read'), 'branch'::public.data_scope, 'role applies again after the override is cleared');
reset role;

-- guards, checked as admin
select pg_temp.as_user(2);
set local role authenticated;
select throws_ok($$select public.set_permission_override((select owner_mid from ctx), 'org.branch.read', 'deny', null, 'x')$$, '42501', 'an owner cannot be overridden', 'owner cannot be overridden');
select throws_ok($$select public.set_permission_override((select mid from people where user_id = 'e1000000-0000-0000-0000-000000000002'), 'org.branch.read', 'deny', null, 'x')$$,
  '42501', 'you cannot change your own permissions', 'no overriding yourself');
select throws_ok($$select public.set_permission_override((select other_mid from ctx), 'org.branch.read', 'deny', null, 'x')$$, 'P0002', 'member not found', 'cannot override another company''s member');
select throws_ok($$select public.set_permission_override((select mid from people where user_id = 'e1000000-0000-0000-0000-000000000004'), 'org.branch.read', 'deny', 'own', 'x')$$,
  'P0001', 'a deny has no scope', 'a deny carries no scope');
select throws_ok($$select public.set_permission_override((select mid from people where user_id = 'e1000000-0000-0000-0000-000000000004'), 'org.branch.read', 'grant', null, 'x')$$,
  'P0001', 'a grant needs a scope', 'a grant needs a scope');
select throws_ok($$select public.set_permission_override((select mid from people where user_id = 'e1000000-0000-0000-0000-000000000004'), 'org.branch.read', 'deny', null, '  ')$$,
  'P0001', 'a reason is required', 'a reason is required');
select throws_ok($$select public.set_permission_override((select mid from people where user_id = 'e1000000-0000-0000-0000-000000000004'), 'platform.anything.do', 'grant', 'company', 'x')$$,
  'P0002', 'unknown permission', 'unknown keys are refused');
select lives_ok($$select public.set_permission_override((select mid from people where user_id = 'e1000000-0000-0000-0000-000000000003'), 'org.employee.read', 'deny', null, 'Not needed')$$, 'admin denies the manager');
reset role;
select pg_temp.as_user(3);
set local role authenticated;
select is((select count(*)::int from public.employees), 1, 'denied manager still sees their own record only');
reset role;

-- a manager with role management cannot grant above their own scope
delete from public.membership_permission_overrides;
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select cid, mgr_role, 'org.role.manage', 'company' from ctx;
select pg_temp.as_user(3);
set local role authenticated;
select throws_ok($$select public.set_permission_override((select mid from people where user_id = 'e1000000-0000-0000-0000-000000000004'), 'org.employee.read', 'grant', 'company', 'x')$$,
  '42501', 'you cannot grant more than you have', 'cannot grant above own scope');
select lives_ok($$select public.set_permission_override((select mid from people where user_id = 'e1000000-0000-0000-0000-000000000004'), 'org.employee.read', 'grant', 'team', 'Needs team view')$$, 'can grant up to own scope');
reset role;

-- expired override is ignored
delete from public.membership_permission_overrides;
insert into public.membership_permission_overrides (company_id, membership_id, permission_key, effect, reason, expires_at)
  select cid, (select mid from people where user_id = 'e1000000-0000-0000-0000-000000000002'), 'org.employee.read', 'deny', 'old', now() - interval '1 day' from ctx;
select pg_temp.as_user(2);
set local role authenticated;
select is(app.permission_scope('org.employee.read'), 'company'::public.data_scope, 'an expired override no longer applies');
reset role;

-- audit
select ok((select count(*) from public.audit_log where company_id = (select cid from ctx) and action in ('permission_override.set', 'permission_override.clear')) >= 4, 'override changes are audited');
select ok((select count(*) from public.audit_log where company_id = (select cid from ctx) and action like 'employees.%') >= 2, 'employee changes are audited');

-- ===== leaving =====
select pg_temp.as_user(1);
set local role authenticated;
select throws_ok($$update public.employees set status = 'left' where id = (select eid from people where user_id = 'e1000000-0000-0000-0000-000000000001')$$,
  'P0001', 'an owner cannot be marked as left', 'owner cannot be marked as left');
select lives_ok($$update public.employees set status = 'left' where id = (select eid from people where user_id = 'e1000000-0000-0000-0000-000000000003')$$, 'owner marks the manager as left');
reset role;
select is((select status::text from public.memberships where id = (select mid from people where user_id = 'e1000000-0000-0000-0000-000000000003')), 'suspended', 'leaving suspends the login and frees the seat');
select is((select reports_to_id from public.employees where id = (select eid from people where user_id = 'e1000000-0000-0000-0000-000000000004')),
  (select eid from people where user_id = 'e1000000-0000-0000-0000-000000000001'), 'the leaver''s reports move up to their manager');
select ok((select end_date from public.employees where id = (select eid from people where user_id = 'e1000000-0000-0000-0000-000000000003')) is not null, 'end date is set');
select pg_temp.as_user(1);
set local role authenticated;
select throws_ok($$update public.employees set reports_to_id = (select eid from people where user_id = 'e1000000-0000-0000-0000-000000000003') where name = 'Staff'$$,
  'P0001', 'the manager has left the company', 'cannot report to someone who left');
reset role;

select * from finish();
rollback;

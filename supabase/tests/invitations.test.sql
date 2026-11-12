-- Invitations from an employee record: create, preview, accept, get a new link, revoke, seats and protections.
-- One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('f0000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'inv-owner@test.local'),
  ('f0000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'inv-staff@test.local'),
  ('f0000000-0000-0000-0000-0000000000a3', 'authenticated', 'authenticated', 'inv-admin@test.local'),
  ('f0000000-0000-0000-0000-0000000000a4', 'authenticated', 'authenticated', 'inv-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('f0000000-0000-0000-0000-0000000000a1', 'Owner'), ('f0000000-0000-0000-0000-0000000000a2', 'Staffer Profile'),
  ('f0000000-0000-0000-0000-0000000000a3', 'Admin'), ('f0000000-0000-0000-0000-0000000000a4', 'Other');

-- Owner creates the company
select set_config('request.jwt.claims', json_build_object('sub', 'f0000000-0000-0000-0000-0000000000a1', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Invite Co', null, 'KH', 'KHR', 'Main');
reset role;
create temp table ctx as
  select c.id as cid, m.id as mid,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role,
         (select id from public.roles where company_id = c.id and name = 'Warehouse') as wh_role,
         (select id from public.roles where company_id = c.id and name = 'Admin') as admin_role,
         (select id from public.roles where company_id = c.id and name = 'Owner') as owner_role,
         (select id from public.branches where company_id = c.id limit 1) as branch
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'Invite Co';
grant select on ctx to authenticated;

-- Employee records the admin will invite
insert into public.positions (company_id, name) select cid, 'Cashier' from ctx;
insert into public.employees (company_id, name, position_id) select cid, 'Sok Dara', (select id from public.positions where name = 'Cashier') from ctx;
insert into public.employees (company_id, name) select cid, 'Admin Person' from ctx;
insert into public.employees (company_id, name) select cid, 'To Revoke' from ctx;
insert into public.employees (company_id, name, status) select cid, 'Gone Person', 'left' from ctx;
insert into public.employees (company_id, name) select cid, 'To Replace' from ctx;
create function pg_temp.emp(p text) returns uuid language sql as $$ select id from public.employees where name = p $$;
grant execute on function pg_temp.emp(text) to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'f0000000-0000-0000-0000-0000000000a1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select cid from ctx), 'membership_id', (select mid from ctx)))::text, true);
set local role authenticated;
select throws_ok($$select public.create_invite(pg_temp.emp('Sok Dara'), jsonb_build_array(jsonb_build_object('role_id', (select owner_role from ctx))))$$, 'P0001', 'owner cannot be invited', 'owner role cannot be invited');
select throws_ok($$select public.create_invite(pg_temp.emp('Sok Dara'), '[]'::jsonb)$$, 'P0001', 'choose between 1 and 10 roles', 'at least one role is needed');
select throws_ok($$select public.create_invite(pg_temp.emp('Sok Dara'), jsonb_build_array(jsonb_build_object('role_id', (select staff_role from ctx))), '[]'::jsonb, 5)$$, 'P0001', 'expiry must be 1, 3, 7 or 14 days', 'only 1, 3, 7 or 14 days');
select throws_ok($$select public.create_invite(pg_temp.emp('Gone Person'), jsonb_build_array(jsonb_build_object('role_id', (select staff_role from ctx))))$$, 'P0001', 'employee has left the company', 'a leaver cannot be invited');
select throws_ok($$select public.create_invite(gen_random_uuid(), jsonb_build_array(jsonb_build_object('role_id', (select staff_role from ctx))))$$, 'P0002', 'employee not found', 'an invite needs a real employee');
select throws_ok($$select public.create_invite(pg_temp.emp('Sok Dara'), jsonb_build_array(jsonb_build_object('role_id', (select staff_role from ctx)), jsonb_build_object('role_id', (select staff_role from ctx))))$$, 'P0001', 'the same role and branch is listed twice', 'a duplicate role is refused');
select throws_ok($$select public.create_invite(pg_temp.emp('Sok Dara'), jsonb_build_array(jsonb_build_object('role_id', (select staff_role from ctx))),
  jsonb_build_array(jsonb_build_object('permission_key', 'org.audit.read', 'effect', 'grant', 'data_scope', 'company')))$$, 'P0001', 'a reason is required', 'an override needs a reason');
select throws_ok($$select public.create_invite(pg_temp.emp('Sok Dara'), jsonb_build_array(jsonb_build_object('role_id', (select staff_role from ctx))),
  jsonb_build_array(jsonb_build_object('permission_key', 'no.such.key', 'effect', 'deny', 'reason', 'x')))$$, 'P0002', 'unknown permission', 'an override needs a real permission');

-- Sok Dara: two roles (one branch-limited), one override, a note, 3 days
select set_config('test.tok1', (public.create_invite(pg_temp.emp('Sok Dara'),
  jsonb_build_array(jsonb_build_object('role_id', (select staff_role from ctx), 'branch_id', (select branch from ctx)), jsonb_build_object('role_id', (select wh_role from ctx))),
  jsonb_build_array(jsonb_build_object('permission_key', 'org.audit.read', 'effect', 'grant', 'data_scope', 'company', 'reason', 'Helps with month end')),
  3, 'Welcome to the team')) ->> 'token', true);
select throws_ok($$select public.create_invite(pg_temp.emp('Sok Dara'), jsonb_build_array(jsonb_build_object('role_id', (select staff_role from ctx))))$$, 'P0001', 'employee already has a pending invitation', 'one pending invitation per employee');
select set_config('test.tok2', (public.create_invite(pg_temp.emp('Admin Person'), jsonb_build_array(jsonb_build_object('role_id', (select admin_role from ctx))))) ->> 'token', true);
select set_config('test.tok3', (public.create_invite(pg_temp.emp('To Revoke'), jsonb_build_array(jsonb_build_object('role_id', (select staff_role from ctx))))) ->> 'token', true);
select set_config('test.tok5', (public.create_invite(pg_temp.emp('To Replace'), jsonb_build_array(jsonb_build_object('role_id', (select staff_role from ctx))))) ->> 'token', true);
select is((select count(*)::int from public.invitations), 4, 'owner sees the invitations');
select is((select jsonb_array_length(roles) from public.invitations where employee_record_id = pg_temp.emp('Sok Dara')), 2, 'both roles are stored');
select is((select (expires_at < now() + interval '3 days 1 minute' and expires_at > now() + interval '2 days 23 hours')::text from public.invitations where employee_record_id = pg_temp.emp('Sok Dara')), 'true', 'the chosen lifetime is used');
select lives_ok($$select public.revoke_invitation((select id from public.invitations where employee_record_id = pg_temp.emp('To Revoke')))$$, 'owner revokes an invitation');
select is((public.invite_seats() ->> 'is_owner')::boolean, true, 'the owner is told they own the plan');
select is((public.invite_seats() ->> 'pending')::int, 3, 'pending invitations count towards seats');
reset role;
select is((select count(*)::int from public.invitations where token_hash::text like '%' || current_setting('test.tok1') || '%'), 0, 'plain token is not stored');

-- Preview works before sign-in and says why a link cannot be used
set local role anon;
select is((select state from public.preview_invitation(current_setting('test.tok1'))), 'pending', 'anonymous holder can preview a valid link');
select is((select employee_name from public.preview_invitation(current_setting('test.tok1'))), 'Sok Dara', 'preview names the employee');
select is((select position_name from public.preview_invitation(current_setting('test.tok1'))), 'Cashier', 'preview shows the position');
select is((select jsonb_array_length(access) from public.preview_invitation(current_setting('test.tok1'))), 2, 'preview lists both roles');
select is((select note from public.preview_invitation(current_setting('test.tok1'))), 'Welcome to the team', 'preview shows the note');
select is((select state from public.preview_invitation(current_setting('test.tok3'))), 'revoked', 'a revoked link says so');
select is((select employee_name from public.preview_invitation(current_setting('test.tok3'))), null, 'a revoked link shows no details');
select is((select count(*)::int from public.preview_invitation('not-a-token')), 0, 'garbage shows nothing');
reset role;

-- Accepting
select set_config('request.jwt.claims', json_build_object('sub', 'f0000000-0000-0000-0000-0000000000a2', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select throws_ok($$select public.accept_invitation(current_setting('test.tok3'))$$, 'P0002', null, 'revoked link cannot be accepted');
select throws_ok($$select public.accept_invitation('not-a-token')$$, 'P0002', null, 'garbage token is rejected');
select lives_ok($$select public.accept_invitation(current_setting('test.tok1'))$$, 'staffer accepts');
select throws_ok($$select public.accept_invitation(current_setting('test.tok1'))$$, 'P0002', null, 'link is single-use');
reset role;
select is((select membership_id from public.employees where name = 'Sok Dara'), (select id from public.memberships where user_id = 'f0000000-0000-0000-0000-0000000000a2'), 'the employee record is linked to the new member');
select is((select count(*)::int from public.employees where company_id = (select cid from ctx)), 6, 'no duplicate employee record is created (owner plus five)');
select is((select display_name from public.memberships where user_id = 'f0000000-0000-0000-0000-0000000000a2'), 'Sok Dara', 'the member takes the employee name');
select is((select count(*)::int from public.membership_roles mr join public.memberships m on m.id = mr.membership_id where m.user_id = 'f0000000-0000-0000-0000-0000000000a2'), 2, 'both roles were applied');
select is((select branch_id from public.membership_roles mr join public.memberships m on m.id = mr.membership_id where m.user_id = 'f0000000-0000-0000-0000-0000000000a2' and mr.role_id = (select staff_role from ctx)), (select branch from ctx), 'the branch limit was applied');
select is((select count(*)::int from public.membership_permission_overrides o join public.memberships m on m.id = o.membership_id where m.user_id = 'f0000000-0000-0000-0000-0000000000a2' and o.permission_key = 'org.audit.read' and o.effect = 'grant'), 1, 'the override was applied');
select is((select status::text from public.invitations where employee_record_id = pg_temp.emp('Sok Dara')), 'accepted', 'the invitation is marked accepted');
select is((select state from public.preview_invitation(current_setting('test.tok1'))), 'accepted', 'an accepted link says so');

-- Get a new link: old link dies, new one works, the seat is kept
select set_config('request.jwt.claims', json_build_object('sub', 'f0000000-0000-0000-0000-0000000000a1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select cid from ctx), 'membership_id', (select mid from ctx)))::text, true);
set local role authenticated;
select is((public.invite_seats() ->> 'pending')::int, 2, 'two pending before the replacement');
select set_config('test.tok6', (public.replace_invite((select id from public.invitations where employee_record_id = pg_temp.emp('To Replace') and status = 'pending'), 14)) ->> 'token', true);
select is((public.invite_seats() ->> 'pending')::int, 2, 'replacing keeps the seat');
select is((select count(*)::int from public.invitations where employee_record_id = pg_temp.emp('To Replace') and status = 'revoked'), 1, 'the old invitation is revoked');
select throws_ok($$select public.replace_invite((select id from public.invitations where employee_record_id = pg_temp.emp('Sok Dara')))$$, 'P0002', 'invitation not found', 'an accepted invitation cannot be replaced');
reset role;
-- An expired invitation can also get a new link
update public.invitations set expires_at = now() - interval '1 day' where employee_record_id = pg_temp.emp('Admin Person');
select is((select state from public.preview_invitation(current_setting('test.tok2'))), 'expired', 'an expired link says so');
select is((select count(*)::int from public.preview_invitation(current_setting('test.tok2')) where employee_name is not null), 0, 'an expired link shows no details');
select set_config('request.jwt.claims', json_build_object('sub', 'f0000000-0000-0000-0000-0000000000a1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select cid from ctx), 'membership_id', (select mid from ctx)))::text, true);
set local role authenticated;
select is((public.invite_seats() ->> 'pending')::int, 1, 'an expired invitation no longer holds a seat');
select set_config('test.tok7', (public.replace_invite((select id from public.invitations where employee_record_id = pg_temp.emp('Admin Person') and status = 'pending'))) ->> 'token', true);
reset role;

select set_config('request.jwt.claims', json_build_object('sub', 'f0000000-0000-0000-0000-0000000000a4', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select throws_ok($$select public.accept_invitation(current_setting('test.tok5'))$$, 'P0002', null, 'the replaced link no longer works');
select lives_ok($$select public.accept_invitation(current_setting('test.tok6'))$$, 'the new link works');
reset role;

-- Staffer has no invitation rights and sees no invitations
select set_config('request.jwt.claims', json_build_object('sub', 'f0000000-0000-0000-0000-0000000000a2', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select cid from ctx),
  'membership_id', (select id from public.memberships where user_id = 'f0000000-0000-0000-0000-0000000000a2')))::text, true);
set local role authenticated;
select throws_ok($$select public.create_invite(pg_temp.emp('Gone Person'), jsonb_build_array(jsonb_build_object('role_id', (select staff_role from ctx))))$$, '42501', null, 'staff cannot invite');
select throws_ok($$select public.replace_invite(gen_random_uuid())$$, '42501', null, 'staff cannot get new links');
select throws_ok($$select public.invite_seats()$$, '42501', null, 'staff cannot read seats');
select is((select count(*)::int from public.invitations), 0, 'staff cannot list invitations');
reset role;

-- Admin joins through the second link; Admin is not the plan owner
select set_config('request.jwt.claims', json_build_object('sub', 'f0000000-0000-0000-0000-0000000000a3', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select lives_ok($$select public.accept_invitation(current_setting('test.tok7'))$$, 'admin accepts');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'f0000000-0000-0000-0000-0000000000a3', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select cid from ctx),
  'membership_id', (select id from public.memberships where user_id = 'f0000000-0000-0000-0000-0000000000a3')))::text, true);
set local role authenticated;
select is((public.invite_seats() ->> 'is_owner')::boolean, false, 'an admin is not told they own the plan');
select is((public.invite_seats() -> 'companies'), 'null'::jsonb, 'an admin never sees the owner''s company list');
select is((public.invite_seats() ->> 'owner_name'), 'Owner', 'an admin is told who to ask');
select throws_ok($$update public.memberships set status = 'suspended' where id = (select mid from ctx)$$, 'P0001', 'a company needs at least one active owner', 'last owner cannot be suspended');
select throws_ok($$update public.memberships set status = 'suspended' where user_id = 'f0000000-0000-0000-0000-0000000000a3'$$, '42501', null, 'members cannot suspend themselves');
select lives_ok($$update public.memberships set status = 'suspended' where user_id = 'f0000000-0000-0000-0000-0000000000a2'$$, 'admin suspends staffer');
reset role;
select ok((select count(*) from public.audit_log where action = 'invitation.create') = 4, 'creations are audited');
select ok((select count(*) from public.audit_log where action = 'invitation.replace') = 2, 'replacements are audited');
select ok((select count(*) from public.audit_log where action = 'invitation.accept') = 3, 'acceptances are audited');
select ok((select count(*) from public.audit_log where action = 'permission_override.set') = 1, 'overrides applied by an invitation are audited');

select string_agg(t, ' | ') as result from finish() t;
rollback;

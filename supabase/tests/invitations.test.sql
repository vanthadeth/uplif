-- Slice 3 tests: invitations, acceptance and member protections. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('f0000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'inv-owner@test.local'),
  ('f0000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'inv-staff@test.local'),
  ('f0000000-0000-0000-0000-0000000000a3', 'authenticated', 'authenticated', 'inv-admin@test.local');
insert into public.profiles (user_id, full_name) values
  ('f0000000-0000-0000-0000-0000000000a1', 'Owner'), ('f0000000-0000-0000-0000-0000000000a2', 'Staffer'),
  ('f0000000-0000-0000-0000-0000000000a3', 'Admin');

-- Owner creates the company
select set_config('request.jwt.claims', json_build_object('sub', 'f0000000-0000-0000-0000-0000000000a1', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Invite Co', null, 'KH', 'KHR', 'Main');
reset role;
create temp table ctx as
  select c.id as cid, m.id as mid,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role,
         (select id from public.roles where company_id = c.id and name = 'Admin') as admin_role,
         (select id from public.roles where company_id = c.id and name = 'Owner') as owner_role
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'Invite Co';
grant select on ctx to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'f0000000-0000-0000-0000-0000000000a1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select cid from ctx), 'membership_id', (select mid from ctx)))::text, true);
set local role authenticated;
select throws_ok($$select public.create_invitation((select owner_role from ctx), null, 'x')$$, 'P0001', 'owner cannot be invited', 'owner role cannot be invited');
select set_config('test.tok1', (public.create_invitation((select staff_role from ctx), null, 'Staffer')) ->> 'token', true);
select set_config('test.tok2', (public.create_invitation((select admin_role from ctx), null, 'Admin')) ->> 'token', true);
select set_config('test.tok3', (public.create_invitation((select staff_role from ctx), null, 'To revoke')) ->> 'token', true);
select is((select count(*)::int from public.invitations), 3, 'owner sees the invitations');
select lives_ok($$select public.revoke_invitation((select id from public.invitations where label = 'To revoke'))$$, 'owner revokes an invitation');
reset role;
select is((select count(*)::int from public.invitations where token_hash::text like '%' || current_setting('test.tok1') || '%'), 0, 'plain token is not stored');

-- Revoked token fails for a new user
select set_config('request.jwt.claims', json_build_object('sub', 'f0000000-0000-0000-0000-0000000000a2', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select is((select count(*)::int from public.preview_invitation(current_setting('test.tok3'))), 0, 'revoked link shows nothing');
select throws_ok($$select public.accept_invitation(current_setting('test.tok3'))$$, 'P0002', null, 'revoked link cannot be accepted');
select throws_ok($$select public.accept_invitation('not-a-token')$$, 'P0002', null, 'garbage token is rejected');
select is((select company_name from public.preview_invitation(current_setting('test.tok1'))), 'Invite Co', 'valid link previews the company');
select lives_ok($$select public.accept_invitation(current_setting('test.tok1'))$$, 'staffer accepts');
select throws_ok($$select public.accept_invitation(current_setting('test.tok1'))$$, 'P0002', null, 'link is single-use');
reset role;
select is((select count(*)::int from public.membership_roles mr join public.memberships m on m.id = mr.membership_id
           where m.user_id = 'f0000000-0000-0000-0000-0000000000a2' and mr.role_id = (select staff_role from ctx)), 1, 'staffer got the Staff role');

-- Staffer has no invitation rights and sees no invitations
select set_config('request.jwt.claims', json_build_object('sub', 'f0000000-0000-0000-0000-0000000000a2', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select cid from ctx),
  'membership_id', (select id from public.memberships where user_id = 'f0000000-0000-0000-0000-0000000000a2')))::text, true);
set local role authenticated;
select throws_ok($$select public.create_invitation((select staff_role from ctx), null, 'x')$$, '42501', null, 'staff cannot invite');
select is((select count(*)::int from public.invitations), 0, 'staff cannot list invitations');
reset role;

-- Admin joins; Admin cannot remove the only Owner, nobody can suspend themselves
select set_config('request.jwt.claims', json_build_object('sub', 'f0000000-0000-0000-0000-0000000000a3', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select lives_ok($$select public.accept_invitation(current_setting('test.tok2'))$$, 'admin accepts');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'f0000000-0000-0000-0000-0000000000a3', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select cid from ctx),
  'membership_id', (select id from public.memberships where user_id = 'f0000000-0000-0000-0000-0000000000a3')))::text, true);
set local role authenticated;
select throws_ok($$update public.memberships set status = 'suspended' where id = (select mid from ctx)$$, 'P0001', 'a company needs at least one active owner', 'last owner cannot be suspended');
select throws_ok($$update public.memberships set status = 'suspended' where user_id = 'f0000000-0000-0000-0000-0000000000a3'$$, '42501', null, 'members cannot suspend themselves');
select lives_ok($$update public.memberships set status = 'suspended' where user_id = 'f0000000-0000-0000-0000-0000000000a2'$$, 'admin suspends staffer');
reset role;
select is((select count(*)::int from public.audit_log where action in ('invitation.create', 'invitation.accept', 'invitation.revoke', 'memberships.update')), 7, 'invitation and member changes are audited');

select string_agg(t, ' | ') as result from finish() t;
rollback;

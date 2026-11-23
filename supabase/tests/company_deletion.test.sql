-- Tests for company deletion: owner-only, hidden while deleted, restore, and the daily purge. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('dddddddd-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'del-owner@test.local'),
  ('dddddddd-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'del-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('dddddddd-0000-0000-0000-0000000000a1', 'Owner'), ('dddddddd-0000-0000-0000-0000000000a2', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'dddddddd-0000-0000-0000-0000000000a1', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Gone Co', null, 'KH', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'dddddddd-0000-0000-0000-0000000000a1', 'role', 'authenticated',
  'app_metadata', json_build_object('company_id', (select id from public.companies where name = 'Gone Co'),
  'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = 'Gone Co')))::text, true);

set local role authenticated;
select throws_ok($$select public.delete_company((select id from public.companies where name = 'Gone Co'), 'wrong name')$$, 'P0001', null, 'the typed name must match');
select ok((select count(*) from public.companies) = 1, 'company is still live after a wrong name');
select lives_ok($$select public.delete_company((select id from public.companies where name = 'Gone Co'), 'Gone Co')$$, 'owner deletes the company');
select is((select count(*)::int from public.companies), 0, 'a deleted company is hidden from its own members');
select is((select count(*)::int from public.branches), 0, 'its branches are hidden too');
select is((select count(*)::int from public.list_my_companies() where deleted_at is not null and is_owner), 1, 'the owner still lists it, marked deleted');
select throws_ok($$select public.switch_company((select membership_id from public.list_my_companies() limit 1))$$, '42501', null, 'cannot switch into a deleted company');
select lives_ok($$select public.restore_company((select company_id from public.list_my_companies() limit 1))$$, 'owner restores within the grace period');
select is((select count(*)::int from public.companies), 1, 'a restored company is back');

-- someone who is not an owner cannot delete
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'dddddddd-0000-0000-0000-0000000000a2', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select throws_ok($$select public.delete_company((select id from public.companies where name = 'Gone Co'), 'Gone Co')$$, '42501', null, 'a stranger cannot delete it');
reset role;

-- the purge removes only companies past their date, audit rows included
select set_config('request.jwt.claims', '', true);
update public.companies set deleted_at = now() - interval '31 days', purge_after = now() - interval '1 day', deleted_by = 'dddddddd-0000-0000-0000-0000000000a1' where name = 'Gone Co';
select ok((select count(*) from public.audit_log where company_id = (select id from public.companies where name = 'Gone Co')) > 0, 'the company has audit rows before the purge');
select is(app.purge_deleted_companies(), 1, 'the purge removes one company');
select is((select count(*)::int from public.companies where name = 'Gone Co'), 0, 'the company is gone');
select is((select count(*)::int from public.branches where name = 'Main' and company_id not in (select id from public.companies)), 0, 'nothing is left behind');
select ok((select purged_at is not null from public.company_deletions where name = 'Gone Co'), 'the deletion record stays, marked purged');

select * from finish();
rollback;

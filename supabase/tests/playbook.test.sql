-- Playbook: write, audience by position, progress, pictures and isolation. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('f7000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'pb-owner@test.local'),
  ('f7000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'pb-staff@test.local'),
  ('f7000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'pb-staff2@test.local'),
  ('f7000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'pb-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('f7000000-0000-0000-0000-000000000001', 'Owner'), ('f7000000-0000-0000-0000-000000000002', 'Staff'),
  ('f7000000-0000-0000-0000-000000000003', 'Staff Two'), ('f7000000-0000-0000-0000-000000000005', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'f7000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Pb Co', null, 'LA', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'f7000000-0000-0000-0000-000000000005', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Pb Other Co', null, 'LA', 'KHR', 'Main');
reset role;

create temp table ctx as
  select c.id as cid, m.id as owner_mid,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role,
         (select m2.id from public.memberships m2 join public.companies c2 on c2.id = m2.company_id where c2.name = 'Pb Other Co') as other_mid,
         (select c2.id from public.companies c2 where c2.name = 'Pb Other Co') as other_cid
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'Pb Co';
grant select on ctx to authenticated;

insert into public.memberships (company_id, user_id, display_name) select cid, 'f7000000-0000-0000-0000-000000000002', 'Staff' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'f7000000-0000-0000-0000-000000000003', 'Staff Two' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select ctx.cid, m.id, ctx.staff_role
  from ctx join public.memberships m on m.company_id = ctx.cid and m.user_id <> 'f7000000-0000-0000-0000-000000000001';

create temp table people as
  select m.user_id, m.id as mid, e.id as eid
  from public.memberships m join public.employees e on e.membership_id = m.id join ctx on ctx.cid = m.company_id;
grant select on people to authenticated;

create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'f7000000-0000-0000-0000-00000000000' || n, 'role', 'authenticated',
    'app_metadata', json_build_object('company_id', case when n = 5 then (select other_cid from ctx) else (select cid from ctx) end,
      'membership_id', case when n = 5 then (select other_mid from ctx)
                            else (select mid from people where user_id = ('f7000000-0000-0000-0000-00000000000' || n)::uuid) end))::text, true)
$$;

select is((select count(*)::int from people), 3, 'each member has an employee record');


-- a position that only staff 3 holds
insert into public.positions (company_id, name) select cid, 'Cashier' from ctx;
create temp table pos as select id as pid from public.positions where name = 'Cashier';
grant select on pos to authenticated;
update public.employees set position_id = (select pid from pos) where id = (select eid from people where user_id = 'f7000000-0000-0000-0000-000000000003');

-- ===== writing needs the permission =====
select pg_temp.as_user(2);
set local role authenticated;
select throws_ok($$select public.save_playbook(null, 'Open the shop', null, null, null, null, '[{"title":"Unlock"}]'::jsonb)$$, '42501', null, 'staff cannot write a guide');
select throws_ok($$select * from public.playbook_progress_status(gen_random_uuid())$$, '42501', null, 'staff cannot see progress');
reset role;

select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$select public.save_playbook(null, 'Open the shop', 'បើកហាង', 'Daily', 10, null,
  '[{"title":"Unlock the door","body":"<p>Use the <b>front</b> key.</p>"},{"title":"Count the cash","skip_if":true,"skip_condition":"the safe is empty","body":"<p>Count it.</p>"}]'::jsonb)$$, 'owner writes a guide');
select is((select count(*)::int from public.playbook_steps), 2, 'two steps');
select is((select array_agg(position order by position) from public.playbook_steps), array[1, 2], 'numbered in order');
select throws_ok($$select public.save_playbook(null, '  ', null, null, null, null, '[{"title":"x"}]'::jsonb)$$, '22023', null, 'a title is required');
select throws_ok($$select public.save_playbook(null, 'No steps', null, null, null, null, '[]'::jsonb)$$, '22023', null, 'a guide needs steps');
select throws_ok($$select public.save_playbook(null, 'Bad', null, null, null, null, '[{"title":"x","skip_if":true}]'::jsonb)$$, '23514', null, 'skip-if needs a condition');
select throws_ok($$select public.save_playbook(null, 'Bad pic', null, null, null, null, ('[{"title":"x","image_path":"' || (select other_cid::text from ctx) || '/a.jpg"}]')::jsonb)$$, '42501', null, 'a picture of another company is refused');
reset role;

create temp table gd as select id as gid from public.playbook_guides where title = 'Open the shop';
grant select on gd to authenticated;

-- ===== everyone sees a guide with no positions chosen =====
select pg_temp.as_user(2);
set local role authenticated;
select is((select count(*)::int from public.my_playbooks()), 1, 'staff see the guide');
select is((select step_count from public.my_playbooks()), 2, 'with its two steps');
select is((select count(*)::int from public.my_playbook_steps((select gid from gd))), 2, 'and can read the steps');
select is((select skip_condition from public.my_playbook_steps((select gid from gd)) where step_position = 2), 'the safe is empty', 'skip-if text arrives');
select lives_ok($$select public.set_playbook_done((select gid from gd), true)$$, 'staff mark it done');
select is((select done_at is not null from public.my_playbooks()), true, 'it shows as done');
select lives_ok($$select public.set_playbook_done((select gid from gd), false)$$, 'and can undo it');
select is((select done_at is null from public.my_playbooks()), true, 'it shows as not done');
select is((select count(*)::int from public.playbook_guides), 0, 'staff cannot read the tables directly');
reset role;

-- ===== audience by position =====
select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$select public.save_playbook((select gid from gd), 'Open the shop', null, 'Daily', 10, array[(select pid from pos)],
  '[{"title":"Unlock the door","body":"<p>Key.</p>"}]'::jsonb)$$, 'owner limits the guide to a position');
select is((select count(*)::int from public.playbook_steps), 1, 'steps were replaced');
reset role;
select pg_temp.as_user(2);
set local role authenticated;
select is((select count(*)::int from public.my_playbooks()), 0, 'staff without that position no longer see it');
select throws_ok($$select * from public.my_playbook_steps((select gid from gd))$$, 'P0002', null, 'and cannot read its steps');
select throws_ok($$select public.set_playbook_done((select gid from gd), true)$$, 'P0002', null, 'or mark it done');
reset role;
select pg_temp.as_user(3);
set local role authenticated;
select is((select count(*)::int from public.my_playbooks()), 1, 'staff with the position see it');
select lives_ok($$select public.set_playbook_done((select gid from gd), true)$$, 'and mark it done');
reset role;

-- ===== the owner sees who finished =====
select pg_temp.as_user(1);
set local role authenticated;
select is((select count(*)::int from public.playbook_progress_status((select gid from gd))), 1, 'only people it is for are listed');
select is((select done_at is not null from public.playbook_progress_status((select gid from gd))), true, 'and they are done');
reset role;

-- ===== archive hides =====
select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$select public.archive_playbook((select gid from gd), true)$$, 'owner archives it');
reset role;
select pg_temp.as_user(3);
set local role authenticated;
select is((select count(*)::int from public.my_playbooks()), 0, 'archived guides are hidden');
reset role;

-- ===== pictures =====
select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$insert into storage.objects (bucket_id, name) values ('playbook-images', (select cid::text from ctx) || '/a.jpg')$$, 'owner uploads a picture');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('playbook-images', (select other_cid::text from ctx) || '/b.jpg')$$, '42501', null, 'not into another company folder');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('playbook-images', (select cid::text from ctx) || '/x/y.jpg')$$, '42501', null, 'a path of the wrong shape is refused');
reset role;
select pg_temp.as_user(2);
set local role authenticated;
select is((select count(*)::int from storage.objects where bucket_id = 'playbook-images'), 1, 'staff of the company can read it');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('playbook-images', (select cid::text from ctx) || '/c.jpg')$$, '42501', null, 'staff cannot upload');
reset role;
select pg_temp.as_user(5);
set local role authenticated;
select is((select count(*)::int from storage.objects where bucket_id = 'playbook-images'), 0, 'another company sees no pictures');
select is((select count(*)::int from public.my_playbooks()), 0, 'another company sees no guides');
select throws_ok($$select public.archive_playbook((select gid from gd), false)$$, 'P0002', null, 'another company cannot archive our guide');
select throws_ok($$select public.save_playbook((select gid from gd), 'Hijack', null, null, null, null, '[{"title":"x"}]'::jsonb)$$, 'P0002', null, 'another company cannot edit our guide');
select throws_ok($$select * from public.playbook_progress_status((select gid from gd))$$, 'P0002', null, 'another company cannot see progress');
select throws_ok($$select * from public.my_playbook_steps((select gid from gd))$$, 'P0002', null, 'another company cannot read the steps');
reset role;

select * from finish();
rollback;

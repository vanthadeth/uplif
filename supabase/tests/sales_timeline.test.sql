-- UPLIF Go customers: scope, contacts, photos, plan module and isolation. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('f9000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'st-owner@test.local'),
  ('f9000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'st-rep@test.local'),
  ('f9000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'st-rep2@test.local'),
  ('f9000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'st-staff@test.local'),
  ('f9000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'st-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('f9000000-0000-0000-0000-000000000001', 'Owner'), ('f9000000-0000-0000-0000-000000000002', 'Rep'),
  ('f9000000-0000-0000-0000-000000000003', 'Rep Two'), ('f9000000-0000-0000-0000-000000000004', 'Staff'),
  ('f9000000-0000-0000-0000-000000000005', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'f9000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('St Co', null, 'LA', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'f9000000-0000-0000-0000-000000000005', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('St Other Co', null, 'LA', 'KHR', 'Main');
reset role;

create temp table ctx as
  select c.id as cid, m.id as owner_mid,
         (select id from public.roles where company_id = c.id and name = 'Sales rep') as rep_role,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role,
         (select m2.id from public.memberships m2 join public.companies c2 on c2.id = m2.company_id where c2.name = 'St Other Co') as other_mid,
         (select c2.id from public.companies c2 where c2.name = 'St Other Co') as other_cid
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'St Co';
grant select on ctx to authenticated;

insert into public.memberships (company_id, user_id, display_name) select cid, 'f9000000-0000-0000-0000-000000000002', 'Rep' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'f9000000-0000-0000-0000-000000000003', 'Rep Two' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'f9000000-0000-0000-0000-000000000004', 'Staff' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select ctx.cid, m.id, case when m.user_id = 'f9000000-0000-0000-0000-000000000004' then ctx.staff_role else ctx.rep_role end
  from ctx join public.memberships m on m.company_id = ctx.cid and m.user_id <> 'f9000000-0000-0000-0000-000000000001';

create temp table people as
  select m.user_id, m.id as mid, e.id as eid
  from public.memberships m join public.employees e on e.membership_id = m.id join ctx on ctx.cid = m.company_id;
grant select on people to authenticated;

create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'f9000000-0000-0000-0000-00000000000' || n, 'role', 'authenticated',
    'app_metadata', json_build_object('company_id', case when n = 5 then (select other_cid from ctx) else (select cid from ctx) end,
      'membership_id', case when n = 5 then (select other_mid from ctx)
                            else (select mid from people where user_id = ('f9000000-0000-0000-0000-00000000000' || n)::uuid) end))::text, true)
$$;

select is((select count(*)::int from people), 4, 'each member has an employee record');


create temp table k as select gen_random_uuid() as c1, gen_random_uuid() as c2, gen_random_uuid() as op1, gen_random_uuid() as op2, gen_random_uuid() as op3, gen_random_uuid() as op4;
grant select on k to authenticated;

-- rep 1 registers a customer, rep 2 registers another
select pg_temp.as_user(2);
set local role authenticated;
select public.sales_save_customer((select c1 from k), 'Rep One Shop', null, null, null, null, null, null, null);
select lives_ok($$insert into storage.objects (bucket_id, name) values ('sales-attachments', (select cid::text from ctx) || '/' || (select c1::text from k) || '/n.jpg')$$, 'photo uploaded for a note');
select lives_ok($$select public.sales_add_note((select c1 from k), (select op1 from k), 'Wants a carton price', array[(select cid::text from ctx) || '/' || (select c1::text from k) || '/n.jpg'], now() - interval '5 minutes')$$, 'rep adds a note with a photo');
select lives_ok($$select public.sales_add_note((select c1 from k), (select op1 from k), 'Wants a carton price', null, now())$$, 'sending the same note again is safe');
select is((select count(*)::int from public.customer_events), 1, 'stored once');
select throws_ok($$select public.sales_add_note((select c1 from k), gen_random_uuid(), '  ', null, now())$$, '22023', null, 'an empty note is refused');
select throws_ok($$select public.sales_add_note((select c1 from k), gen_random_uuid(), 'x', array[(select cid::text from ctx) || '/' || (select c1::text from k) || '/missing.jpg'], now())$$, '22023', null, 'a photo that was never uploaded is refused');
select throws_ok($$select public.sales_add_note((select c1 from k), gen_random_uuid(), 'x', array[(select other_cid::text from ctx) || '/' || (select c1::text from k) || '/n.jpg'], now())$$, '42501', null, 'a photo of another company is refused');
select throws_ok($$select public.sales_add_comment((select c1 from k), gen_random_uuid(), 'I am not a manager')$$, '42501', null, 'a rep cannot write a manager comment');
select throws_ok($$update public.customer_events set body = 'edited'$$, '42501', null, 'events cannot be edited');
select throws_ok($$delete from public.customer_events$$, '42501', null, 'or deleted');
select is((select jsonb_array_length(public.sales_timeline((select c1 from k)))), 1, 'timeline has the note');
select is((public.sales_timeline((select c1 from k)) -> 0 ->> 'mine')::boolean, true, 'marked as mine');
select is((select jsonb_array_length(public.sales_inbox())), 1, 'inbox lists the conversation');
select is((public.sales_inbox() -> 0 ->> 'unread')::boolean, false, 'own note is not unread');
reset role;

-- rep 2 sees nothing of it
select pg_temp.as_user(3);
set local role authenticated;
select is((select count(*)::int from public.customer_events), 0, 'rep two sees no events');
select throws_ok($$select public.sales_timeline((select c1 from k))$$, '42501', null, 'cannot open the timeline');
select throws_ok($$select public.sales_add_note((select c1 from k), gen_random_uuid(), 'sneaky', null, now())$$, '42501', null, 'cannot add a note');
select is((select jsonb_array_length(public.sales_inbox())), 0, 'inbox is empty');
reset role;

-- the owner (company scope) comments
select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$select public.sales_add_comment((select c1 from k), (select op2 from k), 'Offer 3 percent, no more')$$, 'owner writes a manager comment');
select lives_ok($$select public.sales_add_comment((select c1 from k), (select op2 from k), 'Offer 3 percent, no more')$$, 'retry is safe');
select throws_ok($$select public.sales_add_comment((select c1 from k), gen_random_uuid(), '  ')$$, '22023', null, 'empty comment refused');
select is((select jsonb_array_length(public.sales_timeline((select c1 from k)))), 2, 'two events now');
reset role;

-- rep 1 sees the comment as unread, reading clears it
select pg_temp.as_user(2);
set local role authenticated;
select is((public.sales_inbox() -> 0 ->> 'unread')::boolean, true, 'the comment is unread');
select is((public.sales_inbox() -> 0 ->> 'kind'), 'comment', 'latest is the comment');
select lives_ok($$select public.sales_mark_read((select c1 from k))$$, 'rep opens the conversation');
select is((public.sales_inbox() -> 0 ->> 'unread')::boolean, false, 'no longer unread');
reset role;

select pg_temp.as_user(1);
set local role authenticated;
select is((public.sales_my_state() ->> 'can_comment')::boolean, true, 'owner can comment');
reset role;
select pg_temp.as_user(2);
set local role authenticated;
select is((public.sales_my_state() ->> 'can_comment')::boolean, false, 'rep cannot');
reset role;

-- staff and the other company
select pg_temp.as_user(4);
set local role authenticated;
select is((select count(*)::int from public.customer_events), 0, 'staff see no events');
select throws_ok($$select public.sales_inbox()$$, '42501', null, 'staff have no inbox');
reset role;
select pg_temp.as_user(5);
set local role authenticated;
select is((select count(*)::int from public.customer_events), 0, 'other company sees no events');
select throws_ok($$select public.sales_add_comment((select c1 from k), gen_random_uuid(), 'x')$$, '42501', null, 'other company cannot comment');
select throws_ok($$select public.sales_timeline((select c1 from k))$$, '42501', null, 'or read');
select is((select count(*)::int from public.customer_event_reads), 0, 'read marks are private');
reset role;

select * from finish();
rollback;

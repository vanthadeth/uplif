-- Learn tests: grading, retake rules, hidden answers, results scope. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('fa000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'lt-owner@test.local'),
  ('fa000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'lt-staff@test.local'),
  ('fa000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'lt-staff2@test.local'),
  ('fa000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'lt-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('fa000000-0000-0000-0000-000000000001', 'Owner'), ('fa000000-0000-0000-0000-000000000002', 'Staff'),
  ('fa000000-0000-0000-0000-000000000003', 'Staff Two'), ('fa000000-0000-0000-0000-000000000005', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'fa000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('LT Co', null, 'LA', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'fa000000-0000-0000-0000-000000000005', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('LT Other Co', null, 'LA', 'KHR', 'Main');
reset role;

create temp table ctx as
  select c.id as cid, m.id as owner_mid,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role,
         (select m2.id from public.memberships m2 join public.companies c2 on c2.id = m2.company_id where c2.name = 'LT Other Co') as other_mid,
         (select c2.id from public.companies c2 where c2.name = 'LT Other Co') as other_cid
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'LT Co';
grant select on ctx to authenticated;

insert into public.memberships (company_id, user_id, display_name) select cid, 'fa000000-0000-0000-0000-000000000002', 'Staff' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'fa000000-0000-0000-0000-000000000003', 'Staff Two' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select ctx.cid, m.id, ctx.staff_role
  from ctx join public.memberships m on m.company_id = ctx.cid and m.user_id <> 'fa000000-0000-0000-0000-000000000001';

create temp table people as
  select m.user_id, m.id as mid, e.id as eid
  from public.memberships m join public.employees e on e.membership_id = m.id join ctx on ctx.cid = m.company_id;
grant select on people to authenticated;

create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'fa000000-0000-0000-0000-00000000000' || n, 'role', 'authenticated',
    'app_metadata', json_build_object('company_id', case when n = 5 then (select other_cid from ctx) else (select cid from ctx) end,
      'membership_id', case when n = 5 then (select other_mid from ctx)
                            else (select mid from people where user_id = ('fa000000-0000-0000-0000-00000000000' || n)::uuid) end))::text, true)
$$;

create temp table t (tid uuid);
grant select, insert, update on t to authenticated;

-- the owner writes a test with two questions (pass mark 80, retake 90)
select pg_temp.as_user(1);
set local role authenticated;
insert into t select public.save_learn_test(null, 'Safety basics', null, 80, 90, $q$[
  {"prompt":"Q1","options":[{"label":"right","correct":true},{"label":"wrong"}]},
  {"prompt":"Q2","options":[{"label":"wrong"},{"label":"right","correct":true},{"label":"also wrong"}]}
]$q$::jsonb);
select is((select count(*)::int from public.learn_questions), 2, 'two questions saved');
select is((select count(*)::int from public.learn_options where is_correct), 2, 'one right answer each');
select throws_ok($$select public.save_learn_test(null, 'Bad', null, 80, 90, '[{"prompt":"Q","options":[{"label":"a"},{"label":"b"}]}]'::jsonb)$$, '22023', 'each question needs exactly one right answer', 'a question needs a right answer');
select throws_ok($$select public.save_learn_test(null, 'Bad', null, 80, 90, '[{"prompt":"Q","options":[{"label":"a","correct":true}]}]'::jsonb)$$, '22023', 'each question needs 2 to 6 answers', 'a question needs 2 to 6 answers');
select throws_ok($$select public.save_learn_test(null, 'Bad', null, 0, 90, '[]'::jsonb)$$, '22023', 'pass mark must be 1 to 100', 'pass mark range');
reset role;
-- keep the right answers for grading below
create temp table ans as
  select q.id as qid, o.id as right_id, (select o2.id from public.learn_options o2 where o2.question_id = q.id and not o2.is_correct order by o2.position limit 1) as wrong_id
  from public.learn_questions q join public.learn_options o on o.question_id = q.id and o.is_correct;
grant select on ans to authenticated;

-- staff cannot read tests, questions or right answers directly, or write
select pg_temp.as_user(2);
set local role authenticated;
select is((select count(*)::int from public.learn_options), 0, 'staff cannot read right answers');
select is((select count(*)::int from public.learn_tests), 0, 'staff cannot read tests directly');
select throws_ok($$insert into public.learn_attempts (company_id, test_id, employee_id, correct, total, score_percent, passed) select cid, (select tid from t), (select eid from people where user_id = 'fa000000-0000-0000-0000-000000000002'), 2, 2, 100, true from ctx$$, '42501', null, 'no direct attempt writes');
select throws_ok($$select public.save_learn_test(null, 'Sneaky', null, 1, 1, '[{"prompt":"Q","options":[{"label":"a","correct":true},{"label":"b"}]}]'::jsonb)$$, '42501', 'not allowed', 'staff cannot write tests');
select is((select status from public.my_learn_tests()), 'new', 'a new test is open');
select is((select count(*)::int from public.learn_questions_for((select tid from t)) where options::text like '%correct%'), 0, 'questions carry no answer flags');

-- one right of two = 50%, failed
select is((select passed from public.submit_learn_attempt((select tid from t),
  (select jsonb_object_agg(qid::text, right_id::text) from (select qid, right_id from ans order by qid limit 1) x))), false, '50% fails at 80');
select is((select status from public.my_learn_tests()), 'failed', 'status is failed');
-- try again at once, all right
select is((select score_percent from public.submit_learn_attempt((select tid from t), (select jsonb_object_agg(qid::text, right_id::text) from ans))), 100, 'full marks');
select is((select status from public.my_learn_tests()), 'passed', 'status is passed');
select throws_ok($$select public.submit_learn_attempt((select tid from t), '{}'::jsonb)$$, 'P0001', 'not due yet', 'cannot retake before it is due');
select throws_ok($$select * from public.learn_questions_for((select tid from t))$$, 'P0001', 'not due yet', 'no questions before it is due');
reset role;

-- 85 days after the pass: due soon; 100 days: overdue
update public.learn_attempts set taken_at = now() - interval '85 days' where passed;
select pg_temp.as_user(2);
set local role authenticated;
select is((select status from public.my_learn_tests()), 'due_soon', 'due within 7 days');
reset role;
update public.learn_attempts set taken_at = now() - interval '100 days' where passed;
select pg_temp.as_user(2);
set local role authenticated;
select is((select status from public.my_learn_tests()), 'overdue', 'overdue after the retake period');
-- a failed retake
select is((select passed from public.submit_learn_attempt((select tid from t), '{}'::jsonb)), false, 'empty answers fail the retake');
reset role;
select is((select count(*)::int from public.learn_attempts where is_retake and not passed), 1, 'the failed retake is marked');

-- results: owner sees the failed retake, a colleague without permission sees nothing
select pg_temp.as_user(1);
set local role authenticated;
select is((select count(*)::int from public.learn_results() where failed_retake), 1, 'owner sees the failed retake');
reset role;
select pg_temp.as_user(3);
set local role authenticated;
select throws_ok($$select * from public.learn_results()$$, '42501', 'not allowed', 'staff cannot read results');
select is((select count(*)::int from public.learn_attempts), 0, 'a colleague cannot read someone else''s attempts');
reset role;

-- another company sees nothing and cannot take this company's test
select pg_temp.as_user(5);
set local role authenticated;
select is((select count(*)::int from public.my_learn_tests()), 0, 'other company sees no tests');
select throws_ok($$select * from public.learn_questions_for((select tid from t))$$, 'P0002', 'test not found', 'other company cannot open the questions');
select throws_ok($$select public.submit_learn_attempt((select tid from t), '{}'::jsonb)$$, 'P0002', 'test not found', 'other company cannot submit');
select is((select count(*)::int from public.learn_results()), 0, 'other company sees no results');
reset role;

-- archived tests disappear for staff
select pg_temp.as_user(1);
set local role authenticated;
select public.archive_learn_test((select tid from t), true);
reset role;
select pg_temp.as_user(2);
set local role authenticated;
select is((select count(*)::int from public.my_learn_tests()), 0, 'an archived test is hidden from staff');
reset role;

select * from finish();
rollback;

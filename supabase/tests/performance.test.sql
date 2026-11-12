-- Performance: KPIs per position, monthly reviews, scope and isolation. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('fb000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'pf-owner@test.local'),
  ('fb000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'pf-staff@test.local'),
  ('fb000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'pf-staff2@test.local'),
  ('fb000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'pf-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('fb000000-0000-0000-0000-000000000001', 'Owner'), ('fb000000-0000-0000-0000-000000000002', 'Staff'),
  ('fb000000-0000-0000-0000-000000000003', 'Staff Two'), ('fb000000-0000-0000-0000-000000000005', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'fb000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('PF Co', null, 'LA', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'fb000000-0000-0000-0000-000000000005', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('PF Other Co', null, 'LA', 'KHR', 'Main');
reset role;

create temp table ctx as
  select c.id as cid, m.id as owner_mid,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role,
         (select m2.id from public.memberships m2 join public.companies c2 on c2.id = m2.company_id where c2.name = 'PF Other Co') as other_mid,
         (select c2.id from public.companies c2 where c2.name = 'PF Other Co') as other_cid
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'PF Co';
grant select on ctx to authenticated;

insert into public.memberships (company_id, user_id, display_name) select cid, 'fb000000-0000-0000-0000-000000000002', 'Staff' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'fb000000-0000-0000-0000-000000000003', 'Staff Two' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select ctx.cid, m.id, ctx.staff_role
  from ctx join public.memberships m on m.company_id = ctx.cid and m.user_id <> 'fb000000-0000-0000-0000-000000000001';

create temp table people as
  select m.user_id, m.id as mid, e.id as eid
  from public.memberships m join public.employees e on e.membership_id = m.id join ctx on ctx.cid = m.company_id;
grant select on people to authenticated;

create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'fb000000-0000-0000-0000-00000000000' || n, 'role', 'authenticated',
    'app_metadata', json_build_object('company_id', case when n = 5 then (select other_cid from ctx) else (select cid from ctx) end,
      'membership_id', case when n = 5 then (select other_mid from ctx)
                            else (select mid from people where user_id = ('fb000000-0000-0000-0000-00000000000' || n)::uuid) end))::text, true)
$$;
create function pg_temp.eid(n int) returns uuid language sql as $$ select eid from people where user_id = ('fb000000-0000-0000-0000-00000000000' || n)::uuid $$;
grant execute on function pg_temp.eid(int) to authenticated;

-- a position for staff 2 and 3
insert into public.positions (company_id, name) select cid, 'Cashier' from ctx;
update public.employees set position_id = (select id from public.positions where name = 'Cashier' and company_id = (select cid from ctx))
  where id in (pg_temp.eid(2), pg_temp.eid(3));
create temp table pos as select id from public.positions where name = 'Cashier' and company_id = (select cid from ctx);
grant select on pos to authenticated;
create temp table k as select null::uuid as a where false;
create temp table kk (a uuid, b uuid);
grant select, insert on kk to authenticated;

select pg_temp.as_user(1);
set local role authenticated;
insert into kk select public.save_kpi(null, (select id from pos), 'Speed', null, 3, true), public.save_kpi(null, (select id from pos), 'Accuracy', 'ភាពត្រឹមត្រូវ', 1, true);
select is((select count(*)::int from public.kpis), 2, 'two KPIs saved');
select throws_ok($$select public.save_kpi(null, (select id from pos), '', null, 1, true)$$, '22023', 'name is required', 'a KPI needs a name');
select throws_ok($$select public.save_kpi(null, (select id from pos), 'X', null, 0, true)$$, '22023', 'weight must be 1 to 100', 'weight range');
reset role;

-- staff cannot write KPIs or read the tables directly; they see their own KPIs
select pg_temp.as_user(2);
set local role authenticated;
select throws_ok($$select public.save_kpi(null, (select id from pos), 'Sneaky', null, 1, true)$$, '42501', 'not allowed', 'staff cannot set KPIs');
select is((select count(*)::int from public.kpis), 0, 'staff cannot read the KPI table directly');
select is((select count(*)::int from public.my_kpis()), 2, 'staff see their own two KPIs');
select is((select count(*)::int from public.my_kpis() where last_score is not null), 0, 'no review, no score');
select throws_ok($$select * from public.performance_review_list(current_date)$$, '42501', 'not allowed', 'staff cannot list reviewees');
select throws_ok($$select public.submit_performance_review(pg_temp.eid(3), current_date, '{}'::jsonb, null)$$, '42501', 'not allowed', 'staff cannot review a colleague');
reset role;

-- the owner reviews staff: Speed 100 (weight 3), Accuracy 60 (weight 1) => (300+60)/4 = 90
select pg_temp.as_user(1);
set local role authenticated;
select is((select count(*)::int from public.performance_review_list(current_date)), 2, 'owner may review both staff, not themselves');
select throws_ok($$select public.submit_performance_review(pg_temp.eid(1), current_date, '{}'::jsonb, null)$$, '42501', 'not allowed', 'nobody reviews themselves');
select throws_ok($$select public.submit_performance_review(pg_temp.eid(2), current_date, jsonb_build_object((select a::text from kk), 100), null)$$, '22023', 'every KPI needs a score', 'every KPI must be scored');
select throws_ok($$select public.submit_performance_review(pg_temp.eid(2), current_date, jsonb_build_object((select a::text from kk), 101, (select b::text from kk), 0), null)$$, '22023', 'scores are 0 to 100', 'score range');
select throws_ok($$select public.submit_performance_review(pg_temp.eid(2), (current_date + interval '2 months')::date, jsonb_build_object((select a::text from kk), 100, (select b::text from kk), 60), null)$$, '22023', 'that month has not started', 'no review for a future month');
select is(public.submit_performance_review(pg_temp.eid(2), current_date, jsonb_build_object((select a::text from kk), 100, (select b::text from kk), 60), 'Good month'), 90, 'weighted overall is 90');
select is(public.submit_performance_review(pg_temp.eid(2), current_date, jsonb_build_object((select a::text from kk), 80, (select b::text from kk), 40), null), 70, 'sending again replaces it');
select is((select count(*)::int from public.performance_reviews), 1, 'still one review for the month');
select is((select count(*)::int from public.performance_scores), 2, 'two scores kept');
select is((select score from public.performance_review_form(pg_temp.eid(2), current_date) where name = 'Speed'), 80, 'the form shows the given score');
reset role;

-- a change to KPIs does not rewrite the old review
update public.kpis set weight = 50 where name = 'Accuracy';
select is((select overall_percent from public.performance_reviews), 70, 'old review keeps its own weights');

-- staff see their own reviews and KPI scores only
select pg_temp.as_user(2);
set local role authenticated;
select is((select overall_percent from public.my_reviews()), 70, 'staff see their own score');
select is((select last_score from public.my_kpis() where name = 'Speed'), 80, 'and the score per KPI');
select is((select count(*)::int from public.performance_reviews), 1, 'they can read their own review row');
reset role;
select pg_temp.as_user(3);
set local role authenticated;
select is((select count(*)::int from public.my_reviews()), 0, 'a colleague has no review');
select is((select count(*)::int from public.performance_reviews), 0, 'and cannot read anyone else''s');
select is((select count(*)::int from public.performance_scores), 0, 'or their scores');
reset role;

-- another company sees nothing and cannot review
select pg_temp.as_user(5);
set local role authenticated;
select is((select count(*)::int from public.my_kpis()), 0, 'other company has no KPIs');
select throws_ok($$select public.submit_performance_review(pg_temp.eid(2), current_date, '{}'::jsonb, null)$$, '42501', 'not allowed', 'other company cannot review');
select throws_ok($$select * from public.performance_review_form(pg_temp.eid(2), current_date)$$, '42501', 'not allowed', 'other company cannot open the form');
select is((select count(*)::int from public.performance_reviews), 0, 'other company reads no reviews');
reset role;

select * from finish();
rollback;

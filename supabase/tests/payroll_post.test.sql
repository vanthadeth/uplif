-- Posting payslips: post, notify, confirm, ask for review, answer, revise, and who can see what.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('ff000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'pr-owner@test.local'),
  ('ff000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'pr-staff@test.local'),
  ('ff000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'pr-manager@test.local'),
  ('ff000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'pr-acct@test.local'),
  ('ff000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'pr-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('ff000000-0000-0000-0000-000000000001', 'Owner'), ('ff000000-0000-0000-0000-000000000002', 'Staff'),
  ('ff000000-0000-0000-0000-000000000003', 'Manager'), ('ff000000-0000-0000-0000-000000000004', 'Acct'),
  ('ff000000-0000-0000-0000-000000000005', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'ff000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Pr Co', null, 'PS', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'ff000000-0000-0000-0000-000000000005', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Pr Other Co', null, 'PS', 'KHR', 'Main');
reset role;

create temp table ctx as
  select c.id as cid, m.id as owner_mid,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role,
         (select id from public.roles where company_id = c.id and name = 'Manager') as mgr_role,
         (select id from public.roles where company_id = c.id and name = 'Accountant') as acct_role,
         (select m2.id from public.memberships m2 join public.companies c2 on c2.id = m2.company_id where c2.name = 'Pr Other Co') as other_mid,
         (select c2.id from public.companies c2 where c2.name = 'Pr Other Co') as other_cid
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'Pr Co';
grant select on ctx to authenticated;

insert into public.memberships (company_id, user_id, display_name) select cid, 'ff000000-0000-0000-0000-000000000002', 'Staff' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'ff000000-0000-0000-0000-000000000003', 'Manager' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'ff000000-0000-0000-0000-000000000004', 'Acct' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select ctx.cid, m.id, case m.user_id when 'ff000000-0000-0000-0000-000000000002' then ctx.staff_role
                                      when 'ff000000-0000-0000-0000-000000000003' then ctx.mgr_role else ctx.acct_role end
  from ctx join public.memberships m on m.company_id = ctx.cid and m.user_id <> 'ff000000-0000-0000-0000-000000000001';
-- Give the manager role the pay permissions at team scope: the database must still refuse, because pay is company scope only.
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select cid, mgr_role, k, 'team' from ctx, (values ('payroll.terms.view'), ('payroll.terms.manage')) v(k)
  on conflict do nothing;

create temp table people as
  select m.user_id, m.id as mid, e.id as eid
  from public.memberships m join public.employees e on e.membership_id = m.id join ctx on ctx.cid = m.company_id;
grant select on people to authenticated;

create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'ff000000-0000-0000-0000-00000000000' || n, 'role', 'authenticated',
    'app_metadata', json_build_object('company_id', case when n = 5 then (select other_cid from ctx) else (select cid from ctx) end,
      'membership_id', case when n = 5 then (select other_mid from ctx)
                            else (select mid from people where user_id = ('ff000000-0000-0000-0000-00000000000' || n)::uuid) end))::text, true)
$$;
create function pg_temp.eid(n int) returns uuid language sql as $$ select eid from people where user_id = ('ff000000-0000-0000-0000-00000000000' || n)::uuid $$;
grant execute on function pg_temp.eid(int) to authenticated;
create temp table pi as select id, code from public.pay_items where company_id = (select cid from ctx);
grant select on pi to authenticated;

create temp table pl as select id, kind from public.pay_plans where company_id = (select cid from ctx);
grant select on pl to authenticated;
create temp table cal as select date_trunc('month', current_date)::date as this_m, (date_trunc('month', current_date) - interval '1 month')::date as prev_m;

select pg_temp.as_user(1);
set local role authenticated;
select public.payroll_save_terms(pg_temp.eid(2), (select id from pi where code = 'BASIC'), 400, null, 'KHR', current_date - 90, null);
select public.payroll_save_terms(pg_temp.eid(3), (select id from pi where code = 'BASIC'), 300, null, 'KHR', current_date - 90, null);
select public.payroll_open_run((select id from pl where kind = 'fixed'), current_date);
create temp table sl as select
  (select payslip_id from public.payroll_run_slips((select id from public.payroll_runs() where plan_kind = 'fixed')) where employee_id = pg_temp.eid(2)) as staff_sid,
  (select payslip_id from public.payroll_run_slips((select id from public.payroll_runs() where plan_kind = 'fixed')) where employee_id = pg_temp.eid(3)) as mgr_sid,
  (select id from public.payroll_runs() where plan_kind = 'fixed') as run_id;
grant select on sl to authenticated;

-- Staff and manager see nothing before posting
reset role;
select pg_temp.as_user(2);
set local role authenticated;
select is((select count(*)::int from public.my_payslips()), 0, 'staff see no payslip while it is a draft');
select throws_ok($$select public.my_payslip((select staff_sid from sl))$$, 'P0002', 'payroll: not found', 'and cannot open the draft');
select throws_ok($$select public.payroll_post((select staff_sid from sl))$$, '42501', 'not allowed', 'staff cannot post');
reset role;

-- Posting
select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$select public.payroll_delete_line((select (l ->> 'id')::uuid from jsonb_array_elements(public.payroll_payslip((select mgr_sid from sl))->'lines') l limit 1))$$, 'a line is removed from the manager''s draft');
select throws_ok($$select public.payroll_post((select mgr_sid from sl))$$, 'P0001', 'payroll: empty', 'an empty payslip cannot be posted');
select lives_ok($$select public.payroll_post((select staff_sid from sl))$$, 'a payslip is posted');
select is((select status from public.payslips where id = (select staff_sid from sl)), 'posted', 'it is posted');
select throws_ok($$select public.payroll_post((select staff_sid from sl))$$, 'P0001', 'payroll: status', 'posting twice is refused');
select throws_ok($$select public.payroll_save_line((select staff_sid from sl), null, (select id from pi where code = 'FINE'), 1, 1, 'x')$$, 'P0001', 'payroll: status', 'a posted payslip cannot be edited');
select is((select public.payroll_post_run((select run_id from sl)) ->> 'skipped'), '1', 'post-all skips what cannot be posted');
select is((select public.payroll_post_run((select run_id from sl)) ->> 'posted'), '0', 'and posts nothing twice');
reset role;
select ok((select count(*) from public.notifications where employee_id = pg_temp.eid(2) and kind = 'payslip_posted') = 1, 'the employee is notified');
select is((select count(*)::int from public.audit_log where company_id = (select cid from ctx) and entity_type like 'payslip%' and details::text ~ '[0-9]{3}'), 0, 'the audit log holds no amounts');

-- Second approver
update public.payroll_settings set require_second_approver = true where company_id = (select cid from ctx);
insert into public.role_permissions (company_id, role_id, permission_key, data_scope) select cid, acct_role, 'payroll.payslip.post', 'company' from ctx on conflict do nothing;
select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$select public.payroll_save_line((select mgr_sid from sl), null, (select id from pi where code = 'BASIC'), 1, 300, 'Restored')$$, 'the draft is rebuilt by the owner');
select throws_ok($$select public.payroll_post((select mgr_sid from sl))$$, 'P0001', 'payroll: second approver', 'the same person cannot post what they prepared');
reset role;
select pg_temp.as_user(4);
set local role authenticated;
select lives_ok($$select public.payroll_post((select mgr_sid from sl))$$, 'someone else can');
reset role;

-- Staff: own only
select pg_temp.as_user(2);
set local role authenticated;
select is((select count(*)::int from public.my_payslips()), 1, 'staff see their own posted payslip');
select is((select net from public.my_payslips() limit 1), 400.00, 'with its total');
select throws_ok($$select public.my_payslip((select mgr_sid from sl))$$, 'P0002', 'payroll: not found', 'and not a colleague''s');
select throws_ok($$select public.my_confirm_payslip((select mgr_sid from sl))$$, 'P0002', 'payroll: not found', 'or confirm it');
select throws_ok($$select public.my_request_payslip_review((select mgr_sid from sl), 'not mine')$$, 'P0002', 'payroll: not found', 'or ask a review of it');
select is((select jsonb_array_length(public.my_payslip((select staff_sid from sl)) -> 'lines')), 1, 'the payslip shows its lines');
select lives_ok($$select public.my_confirm_payslip((select staff_sid from sl))$$, 'the employee confirms');
select is((select status from public.my_payslips() limit 1), 'confirmed', 'it is confirmed');
select throws_ok($$select public.my_confirm_payslip((select staff_sid from sl))$$, 'P0001', 'payroll: status', 'confirming again is refused');
select throws_ok($$select public.my_request_payslip_review((select staff_sid from sl), 'too late')$$, 'P0001', 'payroll: status', 'a confirmed payslip cannot be reviewed');
select throws_ok($$update public.payslips set status = 'confirmed'$$, '42501', null, 'status cannot be changed directly');
reset role;

-- Review: ask, revise, ask again, answer
select pg_temp.as_user(3);
set local role authenticated;
select throws_ok($$select public.my_request_payslip_review((select mgr_sid from sl), 'x')$$, 'P0001', 'payroll: reason', 'a review needs a message');
select lives_ok($$select public.my_request_payslip_review((select mgr_sid from sl), 'I worked a holiday')$$, 'the employee asks for a review');
select throws_ok($$select public.my_request_payslip_review((select mgr_sid from sl), 'again please')$$, 'P0001', 'payroll: status', 'only one review at a time');
select throws_ok($$select public.payroll_reviews()$$, '42501', 'not allowed', 'the manager cannot read reviews as admin');
reset role;
select pg_temp.as_user(1);
set local role authenticated;
select is((select count(*)::int from public.payroll_reviews()), 1, 'the admin sees one open review');
select throws_ok($$select public.payroll_answer_review((select id from public.payroll_reviews()), 'no')$$, 'P0001', 'payroll: reason', 'an answer needs words');
select lives_ok($$select public.payroll_revise_payslip((select id from public.payroll_reviews()), 'Holiday pay added')$$, 'the admin revises');
create temp table rv as select (select id from public.payslips where company_id = (select cid from ctx) and employee_id = pg_temp.eid(3) and is_current and run_id = (select run_id from sl)) as new_sid;
grant select on rv to authenticated;
select is((select version from public.payslips where id = (select new_sid from rv)), 2, 'the new version is 2');
select is((select status from public.payslips where id = (select new_sid from rv)), 'draft', 'a draft');
select is((select status from public.payslips where id = (select mgr_sid from sl)), 'superseded', 'the old one is superseded');
select is((select count(*)::int from public.payslip_lines where payslip_id = (select new_sid from rv)), 1, 'the lines are copied');
select lives_ok($$select public.payroll_save_line((select new_sid from rv), null, (select id from pi where code = 'FINE'), 1, 10, 'Holiday adjustment')$$, 'the new draft is edited');
select throws_ok($$select public.payroll_save_line((select mgr_sid from sl), null, (select id from pi where code = 'FINE'), 1, 10, 'x')$$, 'P0001', 'payroll: status', 'the old version stays untouched');
select throws_ok($$select public.payroll_revise_payslip((select id from public.payslip_reviews limit 1), null)$$, 'P0001', 'payroll: status', 'a review is revised once');
select is((select count(*)::int from public.payroll_reviews()), 0, 'no open review remains');
select is((select count(*)::int from public.payroll_reviews(false)), 1, 'but the history keeps it');
reset role;
select pg_temp.as_user(4);
set local role authenticated;
select lives_ok($$select public.payroll_post((select new_sid from rv))$$, 'version 2 is posted');
reset role;
select pg_temp.as_user(3);
set local role authenticated;
select is((select count(*)::int from public.my_payslips()), 2, 'the employee keeps both versions');
select is((select count(*)::int from public.my_payslips() where is_current and status = 'posted' and version = 2), 1, 'version 2 is the current one');
select lives_ok($$select public.my_request_payslip_review((select new_sid from rv), 'Still wrong')$$, 'a second review on the new version');
reset role;
select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$select public.payroll_answer_review((select id from public.payroll_reviews()), 'The figures stand, see the note')$$, 'the admin answers');
select is((select status from public.payslips where id = (select new_sid from rv)), 'posted', 'the payslip goes back to posted');
reset role;
select ok((select count(*) from public.notifications where employee_id = pg_temp.eid(3) and kind = 'payslip_review_answered') = 1, 'the employee is told');

-- Other company and manager
select pg_temp.as_user(5);
set local role authenticated;
select is((select count(*)::int from public.my_payslips()), 0, 'the other company has no payslips');
select throws_ok($$select public.my_payslip((select staff_sid from sl))$$, 'P0002', 'payroll: not found', 'cannot open ours');
select throws_ok($$select public.payroll_post((select staff_sid from sl))$$, 'P0002', 'payroll: not found', 'or post ours');
select is((select count(*)::int from public.payslip_reviews), 0, 'or read our reviews');
reset role;

select * from finish();
rollback;

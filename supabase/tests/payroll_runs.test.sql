-- Pay runs: plans, rules, drafts built from reference pay and rules, overrides, suggestions, bonus, permissions and isolation.
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
grant select on cal to authenticated;
insert into public.performance_reviews (company_id, employee_id, period, overall_percent)
  select cid, pg_temp.eid(2), (select prev_m from cal), 85 from ctx;

select is((select count(*)::int from pl), 4, 'a company gets four pay plans');
select is((select count(*)::int from public.pay_rules where company_id = (select cid from ctx)), 2, 'and the example rules for achievement and commission');

select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$select public.payroll_save_terms(pg_temp.eid(2), (select id from pi where code = 'BASIC'), 400, null, 'KHR', current_date - 90, null)$$, 'fixed salary is set');
select lives_ok($$select public.payroll_save_terms(pg_temp.eid(2), (select id from pi where code = 'ACHV'), 100, null, 'KHR', current_date - 90, null)$$, 'achievement salary is set');
select lives_ok($$select public.payroll_save_terms(pg_temp.eid(2), (select id from pi where code = 'COMM'), null, 2.5, 'KHR', current_date - 90, null)$$, 'commission rate is set');
select lives_ok($$select public.payroll_set_sales_volume(pg_temp.eid(2), (select prev_m from cal), 1000, 'KHR')$$, 'sales volume is typed');

-- Fixed run
select lives_ok($$select public.payroll_open_run((select id from pl where kind = 'fixed'), current_date)$$, 'the fixed salary run opens');
select is((select count(*)::int from public.payroll_runs() where plan_kind = 'fixed'), 1, 'one fixed run');
select is((select gross from public.payroll_run_slips((select id from public.payroll_runs() where plan_kind = 'fixed')) where employee_id = pg_temp.eid(2)), 400.00, 'the draft starts from the reference salary');
select is((select slips from public.payroll_runs() where plan_kind = 'fixed'), 1, 'only people with a fixed salary get a draft');
select lives_ok($$select public.payroll_open_run((select id from pl where kind = 'fixed'), current_date)$$, 'opening again refreshes');
select is((select count(*)::int from public.payroll_runs() where plan_kind = 'fixed'), 1, 'and does not duplicate the run');
select is((select count(*)::int from public.payroll_run_slips((select id from public.payroll_runs() where plan_kind = 'fixed'))), 1, 'or the payslip');

-- Achievement run: KPI 85 falls in band 80 to 94 = 100 percent of 100
select lives_ok($$select public.payroll_open_run((select id from pl where kind = 'achievement'), (select prev_m from cal))$$, 'the achievement run opens for last month');
select is((select gross from public.payroll_run_slips((select id from public.payroll_runs() where plan_kind = 'achievement')) where employee_id = pg_temp.eid(2)), 100.00, 'KPI 85 gives 100 percent of the reference amount');
select is((select l ->> 'source' from jsonb_array_elements(public.payroll_payslip((select payslip_id from public.payroll_run_slips((select id from public.payroll_runs() where plan_kind = 'achievement')) limit 1))->'lines') l limit 1), 'rule', 'the line says it came from the rule');
select ok((select l ->> 'note' from jsonb_array_elements(public.payroll_payslip((select payslip_id from public.payroll_run_slips((select id from public.payroll_runs() where plan_kind = 'achievement')) limit 1))->'lines') l limit 1) like 'Rule: KPI 85 %band 80 to 94 = 100 %', 'and explains the band');

-- Override a rule line
create temp table ach as select (select payslip_id from public.payroll_run_slips((select id from public.payroll_runs() where plan_kind = 'achievement')) limit 1) as sid,
  (select (l ->> 'id')::uuid from jsonb_array_elements(public.payroll_payslip((select payslip_id from public.payroll_run_slips((select id from public.payroll_runs() where plan_kind = 'achievement')) limit 1))->'lines') l limit 1) as lid,
  (select id from pi where code = 'ACHV') as item;
grant select on ach to authenticated;
select throws_ok($$select public.payroll_save_line((select sid from ach), (select lid from ach), (select item from ach), 1, 80, null)$$, 'P0001', 'payroll: reason', 'changing a rule amount needs a reason');
select lives_ok($$select public.payroll_save_line((select sid from ach), (select lid from ach), (select item from ach), 1, 80, 'Half month on leave')$$, 'with a reason it saves');
select is((select l ->> 'source' from jsonb_array_elements(public.payroll_payslip((select sid from ach))->'lines') l limit 1), 'override', 'the line becomes an override');
select is((select l ->> 'source_ref' from jsonb_array_elements(public.payroll_payslip((select sid from ach))->'lines') l limit 1), '100.00', 'and keeps the rule result');
select is((select net from public.payslips where id = (select sid from ach)), 80.00, 'the totals follow');
select lives_ok($$select public.payroll_open_run((select id from pl where kind = 'achievement'), (select prev_m from cal))$$, 'refreshing the run');
select is((select net from public.payslips where id = (select sid from ach)), 80.00, 'keeps the override');
select lives_ok($$select public.payroll_save_line((select sid from ach), null, (select id from pi where code = 'FINE'), 1, 15, 'Late three times')$$, 'a deduction line is added');
select is((select net from public.payslips where id = (select sid from ach)), 65.00, 'net is earnings minus deductions');
select lives_ok($$select public.payroll_delete_line((select (l ->> 'id')::uuid from jsonb_array_elements(public.payroll_payslip((select sid from ach))->'lines') l where l ->> 'kind' = 'deduction'))$$, 'a line is removed');
select is((select net from public.payslips where id = (select sid from ach)), 80.00, 'and the totals follow');

-- Commission run: 1000 x 2.5 percent
select lives_ok($$select public.payroll_open_run((select id from pl where kind = 'commission'), (select prev_m from cal))$$, 'the commission run opens');
select is((select gross from public.payroll_run_slips((select id from public.payroll_runs() where plan_kind = 'commission')) where employee_id = pg_temp.eid(2)), 25.00, 'commission is sales volume times the rate');

-- Rules
select throws_ok($$select public.payroll_save_rule((select id from pl where kind = 'achievement'), 'kpi_bands', '{"bands":[{"min":50,"pct":0},{"min":40,"pct":10}]}'::jsonb, current_date)$$, 'P0001', 'payroll: rule', 'bands must go up');
select throws_ok($$select public.payroll_save_rule((select id from pl where kind = 'achievement'), 'sales_rate', '{"rate_pct":2}'::jsonb, current_date)$$, 'P0001', 'payroll: rule', 'a rule must fit its plan');
select lives_ok($$select public.payroll_save_rule((select id from pl where kind = 'commission'), 'sales_tiers', '{"tiers":[{"from":0,"rate_pct":1},{"from":500,"rate_pct":3}]}'::jsonb, current_date)$$, 'tiers can replace the flat rate');
select lives_ok($$select public.payroll_save_plan((select id from pl where kind = 'fixed'), 20, 'cutoff', true, true)$$, 'the open day can change');
select throws_ok($$select public.payroll_save_plan((select id from pl where kind = 'bonus'), 5, 'calendar_month', true, true)$$, 'P0001', 'payroll: plan', 'a bonus plan has no open day');

-- Bonus
select lives_ok($$select public.payroll_open_run((select id from pl where kind = 'bonus'), current_date, 'Year-end bonus')$$, 'a bonus run is created by hand');
select is((select slips from public.payroll_runs() where plan_kind = 'bonus'), 0, 'and starts empty');
select lives_ok($$select public.payroll_add_bonus((select id from public.payroll_runs() where plan_kind = 'bonus'), pg_temp.eid(2), 50, 'KHR', 'Thank you')$$, 'a bonus is added for a person');
select is((select net from public.payroll_run_slips((select id from public.payroll_runs() where plan_kind = 'bonus')) where employee_id = pg_temp.eid(2)), 50.00, 'with its amount');

-- Suggestions on a fixed draft are shown, never applied
select lives_ok($$select * from public.payroll_suggestions((select payslip_id from public.payroll_run_slips((select id from public.payroll_runs() where plan_kind = 'fixed')) limit 1))$$, 'suggestions can be read');
select throws_ok($$delete from public.payslip_lines$$, '42501', null, 'lines cannot be deleted directly');
select throws_ok($$update public.payslips set net = 1$$, '42501', null, 'payslips cannot be changed directly');
reset role;

select ok((select count(*) from public.audit_log where company_id = (select cid from ctx) and entity_type = 'payslips') > 0, 'payslip changes are audited');
select is((select count(*)::int from public.audit_log where company_id = (select cid from ctx) and entity_type in ('payslips', 'pay_runs', 'sales_volumes') and (details::text like '%1000%' or details::text like '%400%')), 0, 'but the audit log holds no amounts');

-- The daily opener does not duplicate runs
select ok(app.run_pay_openers() >= 0, 'the daily opener runs');
select is((select count(*)::int from public.pay_runs where company_id = (select cid from ctx) and plan_id = (select id from pl where kind = 'fixed')), 1, 'and does not duplicate the fixed run');

-- Accountant: view only
select pg_temp.as_user(4);
set local role authenticated;
select is((select count(*)::int from public.payroll_runs()), 4, 'the accountant can see the runs');
select ok((select count(*) from public.payroll_run_slips((select id from public.payroll_runs() where plan_kind = 'fixed'))) = 1, 'and the payslips');
select throws_ok($$select public.payroll_open_run((select id from pl where kind = 'fixed'), current_date)$$, '42501', 'not allowed', 'but cannot open a run');
select throws_ok($$select public.payroll_save_line((select sid from ach), null, (select id from pi where code = 'FINE'), 1, 1, 'x')$$, '42501', 'not allowed', 'or change a line');
select throws_ok($$select public.payroll_save_plan((select id from pl where kind = 'fixed'), 10, 'cutoff', true, true)$$, '42501', 'not allowed', 'or a plan');
select throws_ok($$select public.payroll_save_rule((select id from pl where kind = 'commission'), 'sales_rate', '{"rate_pct":9}'::jsonb, current_date + 1)$$, '42501', 'not allowed', 'or a rule');
reset role;

-- Manager with team scope, staff: nothing
select pg_temp.as_user(3);
set local role authenticated;
select throws_ok($$select * from public.payroll_runs()$$, '42501', 'not allowed', 'a manager cannot list pay runs');
select throws_ok($$select public.payroll_payslip((select sid from ach))$$, '42501', 'not allowed', 'or open a payslip');
select is((select count(*)::int from public.payslips), 0, 'the payslip table shows the manager nothing');
select is((select count(*)::int from public.payslip_lines), 0, 'nor lines');
select is((select count(*)::int from public.sales_volumes), 0, 'nor sales volumes');
reset role;
select pg_temp.as_user(2);
set local role authenticated;
select throws_ok($$select * from public.payroll_runs()$$, '42501', 'not allowed', 'staff cannot list pay runs');
select is((select count(*)::int from public.payslips), 0, 'staff cannot read payslips here, not even their own drafts');
select is((select count(*)::int from public.pay_plans), 0, 'or the plans');
reset role;

-- Other company
select pg_temp.as_user(5);
set local role authenticated;
select is((select count(*)::int from public.payslips), 0, 'the other company sees no payslips');
select is((select count(*)::int from public.pay_runs where plan_id in (select id from pl)), 0, 'and none of the first company''s runs');
select throws_ok($$select * from public.payroll_run_slips((select id from public.pay_runs where plan_id in (select id from pl) limit 1))$$, 'P0002', 'payroll: not found', 'cannot read the payslips of a run of another company');
select throws_ok($$select public.payroll_open_run((select id from pl where kind = 'fixed'), current_date)$$, 'P0002', 'payroll: not found', 'or open a run with another plan');
select is((select count(*)::int from public.payroll_runs() where plan_id in (select id from pl)), 0, 'the list holds nothing from the first company');
reset role;

select * from finish();
rollback;

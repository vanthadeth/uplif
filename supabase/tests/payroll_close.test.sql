-- Closing pay runs: close, report, mark paid, lock, reopen, export log, and who can do it.
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


reset role;
select pg_temp.as_user(1);
set local role authenticated;
select throws_ok($$select public.payroll_close((select run_id from sl))$$, 'P0001', 'payroll: not ready', 'a run with drafts cannot close');
select lives_ok($$select public.payroll_save_profile(pg_temp.eid(2), 'KHR', 'bank', 'Staff Name', '123456', 'ABA', null)$$, 'a payment profile is set');
select public.payroll_post_run((select run_id from sl));
select throws_ok($$select public.payroll_mark_paid((select run_id from sl), current_date)$$, 'P0001', 'payroll: status', 'only a closed run can be marked paid');
select lives_ok($$select public.payroll_close((select run_id from sl))$$, 'a run with every payslip posted closes');
select is((select status from public.payroll_runs() where id = (select run_id from sl)), 'closed', 'it is closed');
select throws_ok($$select public.payroll_save_line((select staff_sid from sl), null, (select id from pi where code = 'FINE'), 1, 1, 'x')$$, 'P0001', 'payroll: status', 'a closed run takes no changes');
select throws_ok($$select public.payroll_reopen((select run_id from sl), 'x')$$, 'P0001', 'payroll: reason', 'reopening needs a reason');
select lives_ok($$select public.payroll_reopen((select run_id from sl), 'Missed a deduction')$$, 'a closed run can reopen with a reason');
select is((select status from public.payroll_runs() where id = (select run_id from sl)), 'open', 'it is open again');
select lives_ok($$select public.payroll_close((select run_id from sl))$$, 'and closes again');
select is((select count(*)::int from public.payroll_report((select run_id from sl))), 2, 'the report lists the posted payslips');
select is((select account_no from public.payroll_report((select run_id from sl)) where employee_id = pg_temp.eid(2)), '123456', 'with account details for the exporter');
select lives_ok($$select public.payroll_log_export((select run_id from sl), 'csv', 2)$$, 'an export is logged');
select is((select jsonb_array_length(public.payroll_run_info((select run_id from sl)) -> 'exports')), 1, 'and shows in the run');
select throws_ok($$select public.payroll_mark_paid((select run_id from sl), current_date + 3)$$, 'P0001', 'payroll: date', 'a future payment date is refused');
select throws_ok($$select public.payroll_lock((select run_id from sl))$$, 'P0001', 'payroll: status', 'only a paid run can be locked');
select lives_ok($$select public.payroll_mark_paid((select run_id from sl), current_date)$$, 'the run is marked paid');
select is((select count(*)::int from public.payslips where run_id = (select run_id from sl) and is_current and paid_at is not null), 2, 'and its payslips carry the date');
select throws_ok($$select public.payroll_reopen((select run_id from sl), 'too late')$$, 'P0001', 'payroll: status', 'a paid run cannot reopen');
select lives_ok($$select public.payroll_lock((select run_id from sl))$$, 'a paid run locks');
select throws_ok($$select public.payroll_close((select run_id from sl))$$, 'P0001', 'payroll: status', 'a locked run stays locked');
reset role;
select ok((select count(*) from public.audit_log where company_id = (select cid from ctx) and entity_type = 'payroll_exports') = 1, 'the export is audited');

-- Accountant: report and export, never move the run
select pg_temp.as_user(4);
set local role authenticated;
select is((select count(*)::int from public.payroll_report((select run_id from sl))), 2, 'the accountant reads the report');
select throws_ok($$select public.payroll_close((select run_id from sl))$$, '42501', 'not allowed', 'but cannot close');
select throws_ok($$select public.payroll_lock((select run_id from sl))$$, '42501', 'not allowed', 'or lock');
select lives_ok($$select public.payroll_log_export((select run_id from sl), 'print', 2)$$, 'and may log a print');
reset role;
-- Without export permission the account is hidden
delete from public.role_permissions where company_id = (select cid from ctx) and role_id = (select acct_role from ctx) and permission_key = 'payroll.report.export';
select pg_temp.as_user(4);
set local role authenticated;
select is((select account_no from public.payroll_report((select run_id from sl)) where employee_id = pg_temp.eid(2)), null, 'without export permission the account number is hidden');
select throws_ok($$select public.payroll_log_export((select run_id from sl), 'csv', 1)$$, '42501', 'not allowed', 'and an export is refused');
reset role;

-- Staff, manager, other company
select pg_temp.as_user(2);
set local role authenticated;
select throws_ok($$select * from public.payroll_report((select run_id from sl))$$, '42501', 'not allowed', 'staff cannot read the report');
select throws_ok($$select public.payroll_close((select run_id from sl))$$, '42501', 'not allowed', 'or close');
select is((select count(*)::int from public.payroll_exports), 0, 'or see exports');
reset role;
select pg_temp.as_user(3);
set local role authenticated;
select throws_ok($$select public.payroll_run_info((select run_id from sl))$$, '42501', 'not allowed', 'a manager cannot open run info');
reset role;
select pg_temp.as_user(5);
set local role authenticated;
select throws_ok($$select * from public.payroll_report((select run_id from sl))$$, 'P0002', 'payroll: not found', 'another company cannot read our report');
select throws_ok($$select public.payroll_close((select run_id from sl))$$, 'P0002', 'payroll: not found', 'or close our run');
select is((select count(*)::int from public.payroll_exports), 0, 'or see our exports');
reset role;

select * from finish();
rollback;

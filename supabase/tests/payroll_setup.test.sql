-- Pay setup: who may see or change pay, no direct writes, no amounts in the audit log, append-only events, company isolation.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('fe000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ps-owner@test.local'),
  ('fe000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ps-staff@test.local'),
  ('fe000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'ps-manager@test.local'),
  ('fe000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'ps-acct@test.local'),
  ('fe000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'ps-other@test.local');
insert into public.profiles (user_id, full_name) values
  ('fe000000-0000-0000-0000-000000000001', 'Owner'), ('fe000000-0000-0000-0000-000000000002', 'Staff'),
  ('fe000000-0000-0000-0000-000000000003', 'Manager'), ('fe000000-0000-0000-0000-000000000004', 'Acct'),
  ('fe000000-0000-0000-0000-000000000005', 'Other');

select set_config('request.jwt.claims', json_build_object('sub', 'fe000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Ps Co', null, 'PS', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'fe000000-0000-0000-0000-000000000005', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Ps Other Co', null, 'PS', 'KHR', 'Main');
reset role;

create temp table ctx as
  select c.id as cid, m.id as owner_mid,
         (select id from public.roles where company_id = c.id and name = 'Staff') as staff_role,
         (select id from public.roles where company_id = c.id and name = 'Manager') as mgr_role,
         (select id from public.roles where company_id = c.id and name = 'Accountant') as acct_role,
         (select m2.id from public.memberships m2 join public.companies c2 on c2.id = m2.company_id where c2.name = 'Ps Other Co') as other_mid,
         (select c2.id from public.companies c2 where c2.name = 'Ps Other Co') as other_cid
  from public.companies c join public.memberships m on m.company_id = c.id where c.name = 'Ps Co';
grant select on ctx to authenticated;

insert into public.memberships (company_id, user_id, display_name) select cid, 'fe000000-0000-0000-0000-000000000002', 'Staff' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'fe000000-0000-0000-0000-000000000003', 'Manager' from ctx;
insert into public.memberships (company_id, user_id, display_name) select cid, 'fe000000-0000-0000-0000-000000000004', 'Acct' from ctx;
insert into public.membership_roles (company_id, membership_id, role_id)
  select ctx.cid, m.id, case m.user_id when 'fe000000-0000-0000-0000-000000000002' then ctx.staff_role
                                      when 'fe000000-0000-0000-0000-000000000003' then ctx.mgr_role else ctx.acct_role end
  from ctx join public.memberships m on m.company_id = ctx.cid and m.user_id <> 'fe000000-0000-0000-0000-000000000001';
-- Give the manager role the pay permissions at team scope: the database must still refuse, because pay is company scope only.
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select cid, mgr_role, k, 'team' from ctx, (values ('payroll.terms.view'), ('payroll.terms.manage')) v(k)
  on conflict do nothing;

create temp table people as
  select m.user_id, m.id as mid, e.id as eid
  from public.memberships m join public.employees e on e.membership_id = m.id join ctx on ctx.cid = m.company_id;
grant select on people to authenticated;

create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'fe000000-0000-0000-0000-00000000000' || n, 'role', 'authenticated',
    'app_metadata', json_build_object('company_id', case when n = 5 then (select other_cid from ctx) else (select cid from ctx) end,
      'membership_id', case when n = 5 then (select other_mid from ctx)
                            else (select mid from people where user_id = ('fe000000-0000-0000-0000-00000000000' || n)::uuid) end))::text, true)
$$;
create function pg_temp.eid(n int) returns uuid language sql as $$ select eid from people where user_id = ('fe000000-0000-0000-0000-00000000000' || n)::uuid $$;
grant execute on function pg_temp.eid(int) to authenticated;
create temp table pi as select id, code from public.pay_items where company_id = (select cid from ctx);
grant select on pi to authenticated;

-- Defaults
select is((select count(*)::int from pi), 13, 'a company gets 13 default pay items');
select is((select count(*)::int from public.payroll_settings where company_id = (select cid from ctx)), 1, 'and its settings row');

-- Owner
select pg_temp.as_user(1);
set local role authenticated;
select lives_ok($$select public.payroll_save_terms(pg_temp.eid(2), (select id from pi where code = 'BASIC'), 400, null, 'KHR', current_date - 30, 'start')$$, 'the owner sets a fixed salary');
select lives_ok($$select public.payroll_save_terms(pg_temp.eid(2), (select id from pi where code = 'COMM'), null, 2.5, 'KHR', current_date - 30, null)$$, 'the owner sets a commission rate');
select lives_ok($$select public.payroll_save_terms(pg_temp.eid(2), (select id from pi where code = 'BASIC'), 450, null, 'KHR', current_date, 'raise')$$, 'a raise closes the old row');
select is((select count(*)::int from jsonb_array_elements(public.payroll_person(pg_temp.eid(2))->'terms') t where t->>'code' = 'BASIC'), 2, 'history keeps both rows');
select is((select fixed_amount from public.payroll_people() where employee_id = pg_temp.eid(2)), 450.00, 'the list shows the current fixed salary');
select throws_ok($$select public.payroll_save_terms(pg_temp.eid(2), (select id from pi where code = 'BASIC'), 500, null, 'KHR', current_date - 5, null)$$, 'P0001', 'payroll: date', 'a new row must start after the current one');
select throws_ok($$select public.payroll_save_terms(pg_temp.eid(2), (select id from pi where code = 'BASIC'), -1, null, 'KHR', current_date + 1, null)$$, 'P0001', 'payroll: terms', 'negative amounts are refused');
select throws_ok($$select public.payroll_save_terms(pg_temp.eid(2), (select id from pi where code = 'BASIC'), 5, null, 'XXX', current_date + 1, null)$$, 'P0001', 'payroll: terms', 'a currency the company does not use is refused');
select lives_ok($$select public.payroll_save_profile(pg_temp.eid(2), 'KHR', 'bank', 'Staff', '123-456', 'ABA', null)$$, 'the owner saves a pay profile');
select lives_ok($$select public.payroll_save_settings('30', 2, false, true)$$, 'the owner saves settings');
select is((select public.payroll_get_settings()->>'rate_divisor'), '30', 'settings read back');
select throws_ok($$select public.payroll_save_settings('99', 2, false, true)$$, 'P0001', 'payroll: settings', 'a bad divisor is refused');
select throws_ok($$insert into public.employee_pay_terms (company_id, employee_id, pay_item_id, amount, currency_code, effective_from) select cid, pg_temp.eid(2), (select id from pi limit 1), 1, 'KHR', current_date from ctx$$, '42501', null, 'even the owner cannot write the table directly');
select throws_ok($$update public.employee_pay_terms set amount = 1$$, '42501', null, 'or update it directly');
select throws_ok($$update public.payroll_events set detail = '{}'$$, '42501', null, 'events cannot be changed');
select throws_ok($$delete from public.payroll_events$$, '42501', null, 'events cannot be deleted');
reset role;

-- Audit log never holds the amounts
select is((select count(*)::int from public.audit_log where company_id = (select cid from ctx) and action like 'employee_pay_terms.%'), 4, 'pay changes are audited');
select is((select count(*)::int from public.audit_log where company_id = (select cid from ctx) and (details::text like '%450%' or details::text like '%2.5%' or details::text like '%123-456%')), 0, 'but the audit log holds no amounts or account numbers');
select ok((select count(*) from public.payroll_events where company_id = (select cid from ctx)) >= 5, 'events hold the full detail');

-- Accountant: can view, cannot change
select pg_temp.as_user(4);
set local role authenticated;
select is((select fixed_amount from public.payroll_people() where employee_id = pg_temp.eid(2)), 450.00, 'the accountant can view');
select throws_ok($$select public.payroll_save_terms(pg_temp.eid(2), (select id from pi where code = 'BASIC'), 999, null, 'KHR', current_date + 5, null)$$, '42501', 'not allowed', 'the accountant cannot change pay');
select throws_ok($$select public.payroll_save_settings('26', 1.5, false, true)$$, '42501', 'not allowed', 'or settings');
select is((select count(*)::int from public.employee_pay_terms), 3, 'the accountant can read the table at company scope');
reset role;

-- Manager with team scope: refused everywhere
select pg_temp.as_user(3);
set local role authenticated;
select throws_ok($$select * from public.payroll_people()$$, '42501', 'not allowed', 'a manager with team scope cannot list pay');
select throws_ok($$select public.payroll_person(pg_temp.eid(2))$$, '42501', 'not allowed', 'or open a person');
select throws_ok($$select public.payroll_save_terms(pg_temp.eid(2), (select id from pi where code = 'BASIC'), 1, null, 'KHR', current_date + 5, null)$$, '42501', 'not allowed', 'or change pay');
select is((select count(*)::int from public.employee_pay_terms), 0, 'the table shows the manager no rows');
select is((select count(*)::int from public.employee_pay_profiles), 0, 'nor profiles');
select is((select count(*)::int from public.payroll_events), 0, 'nor events');
select throws_ok($$select * from public.payroll_pay_items()$$, '42501', 'not allowed', 'nor the pay items list');
reset role;

-- Staff
select pg_temp.as_user(2);
set local role authenticated;
select throws_ok($$select * from public.payroll_people()$$, '42501', 'not allowed', 'staff cannot list pay');
select is((select count(*)::int from public.employee_pay_terms), 0, 'staff cannot read even their own terms here');
select is((select count(*)::int from public.payroll_events), 0, 'or events');
select throws_ok($$select public.payroll_get_settings()$$, '42501', 'not allowed', 'or settings');
reset role;

-- Other company
select pg_temp.as_user(5);
set local role authenticated;
select is((select count(*)::int from public.employee_pay_terms), 0, 'the other company sees no terms');
select throws_ok($$select public.payroll_person(pg_temp.eid(2))$$, 'P0002', 'payroll: not found', 'cannot open a person of another company');
select throws_ok($$select public.payroll_save_terms(pg_temp.eid(2), (select id from pi where code = 'BASIC'), 1, null, 'KHR', current_date + 5, null)$$, 'P0002', 'payroll: not found', 'or set their pay');
select is((select count(*)::int from public.payroll_people() where employee_id in (select eid from people)), 0, 'the list holds nobody from the first company');
reset role;

select * from finish();
rollback;

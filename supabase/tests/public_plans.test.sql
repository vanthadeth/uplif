-- Tests for public.public_plans(). One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

reset role;
insert into public.plans (code, name, kind, price_month_cents, price_year_cents, max_companies, max_branches, max_users, modules, archived_at)
  values ('pp_old', 'Old plan', 'standard', 100, 1000, 1, 1, 1, array['attendance'], now());
insert into public.plans (code, name, kind, price_year_cents, max_companies, max_users, modules)
  values ('pp_custom', 'Custom for one customer', 'custom', 9900, 1, 9, array['attendance']);

set local role anon;
select ok((select count(*) from public.public_plans()) >= 2, 'a signed-out visitor sees the standard plans');
select ok(exists (select 1 from public.public_plans() where code = 'lite'), 'Lite is listed');
select ok(not exists (select 1 from public.public_plans() where code = 'pp_old'), 'an archived plan is not listed');
select ok(not exists (select 1 from public.public_plans() where code = 'pp_custom'), 'a custom package is never listed');
select throws_ok($$select * from public.plans$$, '42501', null, 'the plans table itself stays closed to anon');
reset role;

select * from finish();
rollback;

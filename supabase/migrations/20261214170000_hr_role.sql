-- HR system role (Time plan decision 4): runs people and pay day to day. Not settings, not closing or reopening a run
-- (payroll.run.manage stays with Owner and Admin), no selfies.
create or replace function app.system_role_local_name(p_name text) returns text
language sql immutable set search_path = '' as $$
  select case p_name
    when 'Owner' then 'ម្ចាស់'
    when 'Admin' then 'អ្នកគ្រប់គ្រងប្រព័ន្ធ'
    when 'Manager' then 'អ្នកគ្រប់គ្រង'
    when 'Sales rep' then 'អ្នកលក់'
    when 'Warehouse' then 'ឃ្លាំង'
    when 'Accountant' then 'គណនេយ្យករ'
    when 'Staff' then 'បុគ្គលិក'
    when 'HR' then 'ធនធានមនុស្ស'
  end
$$;

create function app.seed_hr_role_permissions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_system and new.name = 'HR' then
    insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
    select new.company_id, new.id, k.key, k.scope::public.data_scope
    from (values
      ('org.branch.read', 'company'), ('org.member.read', 'company'), ('org.employee.read', 'company'),
      ('attendance.record.read', 'company'), ('attendance.amendment.review', 'company'), ('attendance.holiday.read', 'company'),
      ('attendance.schedule.read', 'company'), ('attendance.clock.self', 'own'),
      ('leave.request.review', 'company'), ('leave.allowance.manage', 'company'),
      ('payroll.terms.view', 'company'), ('payroll.terms.manage', 'company'), ('payroll.payslip.view', 'company'),
      ('payroll.payslip.prepare', 'company'), ('payroll.payslip.post', 'company'), ('payroll.report.export', 'company')
    ) as k(key, scope)
    where exists (select 1 from public.permissions p where p.key = k.key)
    on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function app.seed_hr_role_permissions() from public, anon, authenticated;
create trigger roles_seed_hr_permissions after insert on public.roles for each row execute function app.seed_hr_role_permissions();

-- Every new company gets the HR role right after its Owner role.
create function app.add_hr_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_system and new.name = 'Owner'
     and not exists (select 1 from public.roles where company_id = new.company_id and name = 'HR') then
    insert into public.roles (company_id, name, is_system) values (new.company_id, 'HR', true);
  end if;
  return new;
end $$;
revoke all on function app.add_hr_role() from public, anon, authenticated;
create trigger roles_add_hr after insert on public.roles for each row execute function app.add_hr_role();

-- Existing companies, unless they already made their own role called HR.
insert into public.roles (company_id, name, is_system)
select c.id, 'HR', true from public.companies c
where not exists (select 1 from public.roles ro where ro.company_id = c.id and ro.name = 'HR');

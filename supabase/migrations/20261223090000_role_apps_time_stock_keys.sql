-- Payroll actions belong to the Time app. Stock keys were already mapped by prefix.
create or replace function app.app_of_permission(p_key text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_key = 'org.branch.read' then null
    when p_key ~ '^(org|leave|learn|performance|career)\.' then 'admin'
    when p_key ~ '^(attendance|payroll)\.' then 'time'
    when p_key like 'sales.%' then 'go'
    when p_key like 'orders.%' then 'orders'
    when p_key like 'stock.%' then 'stock'
    when p_key like 'pos.%' then 'pos'
    when p_key like 'sites.%' then 'sites'
  end
$$;

-- Roles that already hold a payroll action keep it: allow the Time app for them.
insert into public.role_apps (company_id, role_id, app_key, allowed)
select r.company_id, r.id, 'time', true
from public.roles r
where exists (select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_key like 'payroll.%')
on conflict (role_id, app_key) do update set allowed = true;

insert into public.i18n_strings (key, source_text, position) values
  ('ra.group.payroll', 'Pay runs and payslips', 4800),
  ('ra.group.stockMoves', 'Stock movements and cost', 4801)
on conflict (key) do nothing;
insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('ra.group.payroll', 'ការបើកប្រាក់ខែ និងប័ណ្ណប្រាក់ខែ'),
  ('ra.group.stockMoves', 'ចលនាស្តុក និងតម្លៃដើម')
) as v(key, text)
on conflict do nothing;

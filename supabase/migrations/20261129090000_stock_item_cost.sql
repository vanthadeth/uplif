-- Stock: item cost. What you pay for one unit of the item. Kept in its own table so that only roles holding
-- the permission stock.cost.view can read or change it (a column grant cannot depend on a role). The audit log
-- records that the cost changed but never the amounts.
insert into public.permissions (key, description) values
  ('stock.cost.view', 'See and edit what items cost you')
on conflict (key) do nothing;

-- Existing companies: Owner, Admin, Manager and Accountant. Everyone else (Warehouse, Sales rep) does not see cost.
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, 'stock.cost.view', 'company'
from public.roles ro where ro.is_system and ro.name in ('Owner', 'Admin', 'Manager', 'Accountant')
on conflict do nothing;

create function app.seed_stock_cost_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_system and new.name in ('Manager', 'Accountant') then
    insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
    values (new.company_id, new.id, 'stock.cost.view', 'company')
    on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function app.seed_stock_cost_defaults() from public, anon, authenticated;
create trigger roles_seed_stock_cost_defaults after insert on public.roles for each row execute function app.seed_stock_cost_defaults();

create function app.stock_can_view_cost() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active_member()
    and app.module_enabled(app.company_id(), 'inventory')
    and app.permission_scope('stock.cost.view') = 'company'
$$;
revoke all on function app.stock_can_view_cost() from public, anon;
grant execute on function app.stock_can_view_cost() to authenticated;

create table public.item_costs (
  item_id uuid primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  cost numeric(14, 4) not null check (cost >= 0),
  updated_at timestamptz not null default now(),
  foreign key (company_id, item_id) references public.items (company_id, id) on delete cascade
);

create trigger touch_item_costs before update on public.item_costs for each row execute function app.touch_updated_at();
create trigger immutable_company_item_costs before update on public.item_costs for each row execute function app.forbid_company_change();

-- Audit without amounts.
create function app.audit_item_cost() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.item_costs := case when tg_op = 'DELETE' then old else new end;
begin
  if app.membership_id() is not null and r.company_id = app.company_id() then
    perform app.write_audit(r.company_id, app.membership_id(), 'item_costs.' || lower(tg_op), 'item_costs', r.item_id, '{}'::jsonb);
  end if;
  return coalesce(new, old);
end $$;
revoke all on function app.audit_item_cost() from public, anon, authenticated;
create trigger audit_item_costs after insert or update or delete on public.item_costs for each row execute function app.audit_item_cost();

alter table public.item_costs enable row level security;
alter table public.item_costs force row level security;
create policy item_costs_select on public.item_costs for select to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_view_cost()));
create policy item_costs_insert on public.item_costs for insert to authenticated
  with check (company_id = (select app.company_id()) and (select app.stock_can_view_cost()) and (select app.stock_can_manage()));
create policy item_costs_update on public.item_costs for update to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_view_cost()) and (select app.stock_can_manage()))
  with check (company_id = (select app.company_id()));
create policy item_costs_delete on public.item_costs for delete to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_view_cost()) and (select app.stock_can_manage()));
grant select, insert (item_id, company_id, cost), update (cost), delete on public.item_costs to authenticated;

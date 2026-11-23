-- Low-stock notification in the Me bell.
--  * When an item's total quantity (all locations and variants) falls to or below its reorder level from above it, the company's
--    Stock managers get one notification. Stock managers are people whose role holds stock.catalog.manage at company scope
--    (not tied to a single branch) and who have an active employee record.
--  * It fires once per drop. Restocking above the level and falling again fires it again.
--  * The notification stores the facts only (item, quantity, level, unit); the Me app writes the sentence.
--  * Per-person overrides are not consulted: the role decides who is told.

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('leave_approved', 'leave_rejected', 'amendment_approved', 'amendment_rejected', 'performance_review', 'promotion', 'transfer', 'low_stock'));

create function app.notify_low_stock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_item public.items%rowtype;
  v_total numeric;
  v_drop numeric := old.qty - new.qty;
  r record;
begin
  if v_drop <= 0 then return new; end if;
  select i.* into v_item from public.items i join public.item_variants v on v.item_id = i.id and v.company_id = i.company_id
    where v.id = new.variant_id and v.company_id = new.company_id;
  if not found or v_item.reorder_level is null then return new; end if;
  select coalesce(sum(b.qty), 0) into v_total from public.stock_balances b
    join public.item_variants v on v.id = b.variant_id and v.company_id = b.company_id
    where v.item_id = v_item.id and b.company_id = new.company_id;
  if v_total > v_item.reorder_level or v_total + v_drop <= v_item.reorder_level then return new; end if;
  if not app.module_enabled(new.company_id, 'inventory') then return new; end if;
  for r in
    select distinct e.id from public.employees e
    join public.memberships m on m.id = e.membership_id and m.company_id = e.company_id and m.status = 'active'
    join public.membership_roles mr on mr.membership_id = m.id and mr.company_id = m.company_id and mr.branch_id is null
    join public.role_permissions rp on rp.role_id = mr.role_id and rp.company_id = mr.company_id
      and rp.permission_key = 'stock.catalog.manage' and rp.data_scope = 'company'
    where e.company_id = new.company_id and e.status = 'active'
  loop
    perform app.notify(new.company_id, r.id, 'low_stock', jsonb_build_object(
      'item_id', v_item.id, 'name', v_item.name, 'name_local', v_item.name_local,
      'qty', v_total, 'level', v_item.reorder_level, 'unit', v_item.base_uom));
  end loop;
  return new;
end $$;
revoke all on function app.notify_low_stock() from public, anon, authenticated;
create trigger stock_balances_low_alert after update of qty on public.stock_balances for each row execute function app.notify_low_stock();

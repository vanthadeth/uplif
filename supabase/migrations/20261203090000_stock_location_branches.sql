-- Stock: link locations to branches, so branch staff only see and move the stock of their own branch.
-- A location with no branch is company-level (for example the main warehouse): everyone with stock access can see
-- its stock, but only company-wide roles can move it.
-- Seeing: company-wide roles see every location; branch-assigned roles see locations of their branches, company-level
-- locations, and every other branch too when the company turns on "cross-branch stock visibility".
-- Moving (receive, adjust, send, confirm arrival, cancel): company-wide roles anywhere; branch-assigned roles only
-- at locations of their own branch. Names of locations stay visible to everyone with stock access, so a transfer
-- can be addressed to another branch.
alter table public.locations
  add column branch_id uuid,
  add foreign key (company_id, branch_id) references public.branches (company_id, id) on delete set null (branch_id);
create index locations_branch on public.locations (branch_id) where branch_id is not null;
grant insert (branch_id), update (branch_id) on public.locations to authenticated;

-- Can the caller see (p_write false) or move (p_write true) stock at this location?
create function app.stock_location_ok(p_location uuid, p_write boolean) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  b uuid;
  found_loc boolean;
  s public.data_scope;
begin
  select true, branch_id into found_loc, b from public.locations where id = p_location and company_id = cid;
  if found_loc is not true then return false; end if;
  if p_write then
    s := app.permission_scope('stock.movement.create');
    if s = 'company' then return true; end if;
    return s is not null and b is not null and b = any (app.my_branch_ids());
  end if;
  s := greatest(app.permission_scope('stock.catalog.read'), app.permission_scope('stock.catalog.manage'));
  if s is null then return false; end if;
  if s = 'company' or b is null or b = any (app.my_branch_ids()) then return true; end if;
  return coalesce((select cs.cross_branch_stock_visibility from public.company_settings cs where cs.company_id = cid), false);
end $$;
revoke all on function app.stock_location_ok(uuid, boolean) from public, anon;
grant execute on function app.stock_location_ok(uuid, boolean) to authenticated;

-- Branch-assigned staff hold the move permission at 'branch' scope; that is enough to try, the location decides.
create or replace function app.stock_can_move() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    app.is_active_member()
      and app.module_enabled(app.company_id(), 'inventory')
      and app.permission_scope('stock.movement.create') is not null,
    false)
$$;

-- Every stock change writes a movement at one location; refuse it when the caller may not move stock there.
create function app.check_movement_location() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if app.stock_location_ok(new.location_id, true) is not true then
    raise exception 'Not allowed at this location' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function app.check_movement_location() from public, anon, authenticated;
create trigger stock_movements_check_location before insert on public.stock_movements for each row execute function app.check_movement_location();

-- The locations the caller may move stock at, for the app to offer in its lists.
create function public.stock_writable_locations() returns setof uuid
language sql stable security invoker set search_path = '' as $$
  select l.id from public.locations l where app.stock_location_ok(l.id, true)
$$;
revoke all on function public.stock_writable_locations() from public, anon;
grant execute on function public.stock_writable_locations() to authenticated;

-- ---------- reading stock follows the location ----------
drop policy stock_movements_select on public.stock_movements;
drop policy stock_ledger_select on public.stock_ledger;
drop policy stock_balances_select on public.stock_balances;
drop policy stock_transfers_select on public.stock_transfers;
drop policy stock_transfer_lines_select on public.stock_transfer_lines;
create policy stock_movements_select on public.stock_movements for select to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_read()) and app.stock_location_ok(location_id, false));
create policy stock_ledger_select on public.stock_ledger for select to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_read()) and app.stock_location_ok(location_id, false));
create policy stock_balances_select on public.stock_balances for select to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_read()) and app.stock_location_ok(location_id, false));
-- A transfer is visible from either end.
create policy stock_transfers_select on public.stock_transfers for select to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_read())
         and (app.stock_location_ok(from_location_id, false) or app.stock_location_ok(to_location_id, false)));
create policy stock_transfer_lines_select on public.stock_transfer_lines for select to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_read())
         and exists (select 1 from public.stock_transfers t where t.id = stock_transfer_lines.transfer_id and t.company_id = stock_transfer_lines.company_id));

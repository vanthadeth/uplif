-- Stock: the ledger and receiving. Every change to stock is one row in stock_ledger, written only by security-definer
-- functions (no direct insert, update or delete for anyone). stock_balances is the running total per location and
-- variant, kept by a trigger on the ledger, and can never go below zero. This piece adds receiving; adjustments and
-- transfers use the same ledger later.
insert into public.permissions (key, description) values
  ('stock.movement.create', 'Receive, adjust and move stock')
on conflict (key) do nothing;

insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, 'stock.movement.create', 'company'
from public.roles ro where ro.is_system and ro.name in ('Owner', 'Admin', 'Manager', 'Warehouse')
on conflict do nothing;

create function app.seed_stock_move_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_system and new.name in ('Manager', 'Warehouse') then
    insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
    values (new.company_id, new.id, 'stock.movement.create', 'company')
    on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function app.seed_stock_move_defaults() from public, anon, authenticated;
create trigger roles_seed_stock_move_defaults after insert on public.roles for each row execute function app.seed_stock_move_defaults();

create function app.stock_can_move() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active_member()
    and app.module_enabled(app.company_id(), 'inventory')
    and app.permission_scope('stock.movement.create') = 'company'
$$;
revoke all on function app.stock_can_move() from public, anon;
grant execute on function app.stock_can_move() to authenticated;

-- ---------- movements (one per receipt, later per adjustment or transfer) ----------
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null check (kind in ('receive', 'adjust', 'transfer')),
  location_id uuid not null,
  supplier_id uuid,
  reference text check (reference is null or length(reference) <= 80),
  note text check (note is null or length(note) <= 500),
  request_id uuid not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, request_id),
  foreign key (company_id, location_id) references public.locations (company_id, id),
  foreign key (company_id, supplier_id) references public.suppliers (company_id, id) on delete set null (supplier_id)
);
create index stock_movements_company_created on public.stock_movements (company_id, created_at desc);

-- ---------- ledger lines ----------
create table public.stock_ledger (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  movement_id uuid not null,
  location_id uuid not null,
  variant_id uuid not null,
  qty_delta numeric(14, 3) not null check (qty_delta <> 0),
  created_at timestamptz not null default now(),
  foreign key (company_id, movement_id) references public.stock_movements (company_id, id),
  foreign key (company_id, location_id) references public.locations (company_id, id),
  foreign key (company_id, variant_id) references public.item_variants (company_id, id)
);
create index stock_ledger_movement on public.stock_ledger (movement_id);
create index stock_ledger_variant on public.stock_ledger (variant_id, location_id);

-- ---------- running balances ----------
create table public.stock_balances (
  company_id uuid not null references public.companies (id) on delete cascade,
  location_id uuid not null,
  variant_id uuid not null,
  qty numeric(14, 3) not null check (qty >= 0),
  updated_at timestamptz not null default now(),
  primary key (location_id, variant_id),
  foreign key (company_id, location_id) references public.locations (company_id, id),
  foreign key (company_id, variant_id) references public.item_variants (company_id, id)
);

create function app.apply_ledger_line() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.stock_balances (company_id, location_id, variant_id, qty)
  values (new.company_id, new.location_id, new.variant_id, new.qty_delta)
  on conflict (location_id, variant_id) do update set qty = public.stock_balances.qty + excluded.qty, updated_at = now();
  return new;
end $$;
revoke all on function app.apply_ledger_line() from public, anon, authenticated;
create trigger stock_ledger_apply after insert on public.stock_ledger for each row execute function app.apply_ledger_line();

-- The ledger and its movements are append-only, even for the table owner's callers.
-- The one exception: rows go when their whole company is purged.
create function app.forbid_ledger_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.companies where id = old.company_id) then return old; end if;
  raise exception 'The stock ledger cannot be changed' using errcode = '42501';
end $$;
revoke all on function app.forbid_ledger_change() from public, anon, authenticated;
create trigger stock_ledger_append_only before update or delete on public.stock_ledger for each row execute function app.forbid_ledger_change();
-- Movements may only lose their supplier (when the supplier is deleted); nothing else about them changes.
create function app.forbid_movement_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.supplier_id is not null and new.supplier_id is null
     and (to_jsonb(new) - 'supplier_id') = (to_jsonb(old) - 'supplier_id') then return new; end if;
  if tg_op = 'DELETE' and not exists (select 1 from public.companies where id = old.company_id) then return old; end if;
  raise exception 'The stock ledger cannot be changed' using errcode = '42501';
end $$;
revoke all on function app.forbid_movement_change() from public, anon, authenticated;
create trigger stock_movements_append_only before update or delete on public.stock_movements for each row execute function app.forbid_movement_change();

-- ---------- access: read for catalogue readers, writes only through functions ----------
alter table public.stock_movements enable row level security;
alter table public.stock_movements force row level security;
alter table public.stock_ledger enable row level security;
alter table public.stock_ledger force row level security;
alter table public.stock_balances enable row level security;
alter table public.stock_balances force row level security;
create policy stock_movements_select on public.stock_movements for select to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_read()));
create policy stock_ledger_select on public.stock_ledger for select to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_read()));
create policy stock_balances_select on public.stock_balances for select to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_read()));
grant select on public.stock_movements, public.stock_ledger, public.stock_balances to authenticated;

-- ---------- receive stock ----------
-- p_lines: [{"variant_id": "...", "qty": 12}]. Sending the same p_request_id again returns the first movement
-- instead of receiving twice, so a retry after a dropped connection is safe.
create function public.receive_stock(p_request_id uuid, p_location_id uuid, p_supplier_id uuid, p_reference text, p_note text, p_lines jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  mid uuid;
  line jsonb;
  v uuid;
  q numeric;
begin
  if not app.stock_can_move() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select id into mid from public.stock_movements where company_id = cid and request_id = p_request_id;
  if mid is not null then return mid; end if;
  if not exists (select 1 from public.locations where company_id = cid and id = p_location_id and is_active) then
    raise exception 'location_invalid' using errcode = 'P0001';
  end if;
  if p_supplier_id is not null and not exists (select 1 from public.suppliers where company_id = cid and id = p_supplier_id) then
    raise exception 'supplier_invalid' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'no_lines' using errcode = 'P0001'; end if;
  if jsonb_array_length(p_lines) > 200 then raise exception 'too_many_lines' using errcode = 'P0001'; end if;

  insert into public.stock_movements (company_id, kind, location_id, supplier_id, reference, note, request_id, created_by)
  values (cid, 'receive', p_location_id, p_supplier_id, nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''), p_request_id, app.membership_id())
  returning id into mid;

  for line in select value from jsonb_array_elements(p_lines) loop
    begin
      v := (line ->> 'variant_id')::uuid;
      q := (line ->> 'qty')::numeric;
    exception when others then
      raise exception 'line_invalid' using errcode = 'P0001';
    end;
    if q is null or q <= 0 or q > 1000000000 or v is null
       or not exists (select 1 from public.item_variants iv join public.items i on i.id = iv.item_id
                      where iv.company_id = cid and iv.id = v and iv.is_active and i.is_active and i.kind = 'stocked') then
      raise exception 'line_invalid' using errcode = 'P0001';
    end if;
    insert into public.stock_ledger (company_id, movement_id, location_id, variant_id, qty_delta) values (cid, mid, p_location_id, v, q);
  end loop;
  return mid;
end $$;
revoke all on function public.receive_stock(uuid, uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.receive_stock(uuid, uuid, uuid, text, text, jsonb) to authenticated;

-- Audit the movement itself (lines are in the ledger).
create trigger audit_stock_movements after insert on public.stock_movements for each row execute function app.audit_row();

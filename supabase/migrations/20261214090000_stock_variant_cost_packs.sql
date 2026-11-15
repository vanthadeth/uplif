-- Stock: variants can carry their own cost and their own packs. A pack is a shortcut size (Box of 12, Carton of 72)
-- and may also carry the carton measurement and weights (length, width, height in cm; gross and net weight in kg).
-- An empty variant cost or empty variant packs means "use the item's". The variant price already works this way.

-- One check for every pack list (item and variant): at most 10 packs, each a name, a whole quantity of 2 or more,
-- and optional measurements. Net weight can never be above gross weight.
create function app.valid_packs(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare e jsonb; k text; v numeric;
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 10 or pg_column_size(p) > 4000 then return false; end if;
  for e in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(e) <> 'object' then return false; end if;
    if jsonb_typeof(e -> 'name') <> 'string' or length(btrim(e ->> 'name')) = 0 or length(e ->> 'name') > 40 then return false; end if;
    if jsonb_typeof(e -> 'qty') <> 'number' or (e ->> 'qty')::numeric <> trunc((e ->> 'qty')::numeric) or (e ->> 'qty')::numeric < 2 then return false; end if;
    for k in select jsonb_object_keys(e) loop
      if k in ('name', 'qty') then continue; end if;
      if k not in ('length_cm', 'width_cm', 'height_cm', 'gross_kg', 'net_kg') then return false; end if;
      if jsonb_typeof(e -> k) <> 'number' then return false; end if;
      v := (e ->> k)::numeric;
      if v < 0 or v > 1000000 then return false; end if;
    end loop;
    if (e ? 'gross_kg') and (e ? 'net_kg') and (e ->> 'net_kg')::numeric > (e ->> 'gross_kg')::numeric then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function app.valid_packs(jsonb) from public, anon;
grant execute on function app.valid_packs(jsonb) to authenticated;

alter table public.items drop constraint items_packs_check;
alter table public.items add constraint items_packs_check check (jsonb_typeof(packs) = 'array' and app.valid_packs(packs));

alter table public.item_variants add column packs jsonb;
alter table public.item_variants add constraint item_variants_packs_check check (packs is null or app.valid_packs(packs));
grant insert (packs), update (packs) on public.item_variants to authenticated;

-- Variant cost: same rules as the item cost (own table, only roles with stock.cost.view, audit without amounts).
create table public.variant_costs (
  variant_id uuid primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  cost numeric(14, 4) not null check (cost >= 0),
  updated_at timestamptz not null default now(),
  foreign key (company_id, variant_id) references public.item_variants (company_id, id) on delete cascade
);
create trigger touch_variant_costs before update on public.variant_costs for each row execute function app.touch_updated_at();
create trigger immutable_company_variant_costs before update on public.variant_costs for each row execute function app.forbid_company_change();

create function app.audit_variant_cost() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.variant_costs := case when tg_op = 'DELETE' then old else new end;
begin
  if app.membership_id() is not null and r.company_id = app.company_id() then
    perform app.write_audit(r.company_id, app.membership_id(), 'variant_costs.' || lower(tg_op), 'variant_costs', r.variant_id, '{}'::jsonb);
  end if;
  return coalesce(new, old);
end $$;
revoke all on function app.audit_variant_cost() from public, anon, authenticated;
create trigger audit_variant_costs after insert or update or delete on public.variant_costs for each row execute function app.audit_variant_cost();

alter table public.variant_costs enable row level security;
alter table public.variant_costs force row level security;
create policy variant_costs_select on public.variant_costs for select to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_view_cost()));
create policy variant_costs_insert on public.variant_costs for insert to authenticated
  with check (company_id = (select app.company_id()) and (select app.stock_can_view_cost()) and (select app.stock_can_manage()));
create policy variant_costs_update on public.variant_costs for update to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_view_cost()) and (select app.stock_can_manage()))
  with check (company_id = (select app.company_id()));
create policy variant_costs_delete on public.variant_costs for delete to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_view_cost()) and (select app.stock_can_manage()));
grant select, insert (variant_id, company_id, cost), update (cost), delete on public.variant_costs to authenticated;
